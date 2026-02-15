"""Video Forensics Backend - Flask API"""

import os
import json
import time
import tempfile
import subprocess
import shutil
import re
from typing import Optional, Dict, Any, List
from werkzeug.utils import secure_filename

from flask import Flask, request, jsonify
from flask_cors import CORS
import google.generativeai as genai
from twelvelabs import TwelveLabs
from dotenv import load_dotenv
from tavily import TavilyClient

load_dotenv()

MAX_VIDEO_TEXT_CHARS = 3200
ASSET_POLL_SEC = 1.5
INDEX_POLL_SEC = 2.0
WEB_MAX_RESULTS = 5
WEB_SEARCH_DEPTH = "basic"
WEB_CONTENT_TRIM_CHARS = 3500
GEMINI_TEXT_MODEL = "gemini-2.0-flash"
GEMINI_VIDEO_MODEL = "gemini-2.5-flash"

def log_step(msg: str):
    ts = time.strftime("%H:%M:%S")
    print(f"\n[{ts}] ▶ {msg}", flush=True)

def log_info(msg: str):
    ts = time.strftime("%H:%M:%S")
    print(f"[{ts}]   {msg}", flush=True)


# =========================
# CONFIG
# =========================
TL_API_KEY = os.getenv("TL_API_KEY", "").strip()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "").strip()

if not TL_API_KEY:
    raise RuntimeError("Missing TL_API_KEY env var")
if not GEMINI_API_KEY:
    raise RuntimeError("Missing GEMINI_API_KEY env var")
if not TAVILY_API_KEY:
    raise RuntimeError("Missing TAVILY_API_KEY env var")

# Gemini clients
genai.configure(api_key=GEMINI_API_KEY)

# Model for text analysis (claims, fact-checking, timeline)
# Using 2.0-flash-exp for speed and cost-effectiveness
gemini_text_model = genai.GenerativeModel(GEMINI_TEXT_MODEL)

# Model for multimodal video analysis (SynthID detection)
# Using 2.0-flash-exp with video support
gemini_video_model_name = GEMINI_VIDEO_MODEL

# TwelveLabs client
client = TwelveLabs(api_key=TL_API_KEY)

# Tavily client
tavily_client = TavilyClient(api_key=TAVILY_API_KEY)

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = tempfile.gettempdir()
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500MB


# =========================
# RETRY HELPER
# =========================
def with_retries(fn, retries=4, base_sleep=1.5):
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            return fn()
        except TypeError:
            raise
        except Exception as e:
            last_err = e
            sleep = base_sleep * (2 ** (attempt - 1))
            log_info(f"⚠️ Retry {attempt}/{retries} after {type(e).__name__}: sleeping {sleep:.1f}s")
            debug(f"Retry error details: {repr(e)}")
            time.sleep(sleep)
    raise RuntimeError(f"Failed after retries: {last_err}")


# =========================
# C2PA + METADATA ANALYSIS (from backendp2.py)
# =========================
def check_c2pa(path: str):
    """Check C2PA metadata for AI generation tags"""
    try:
        import c2pa
        reader = c2pa.Reader(path)
        manifest_store = json.loads(reader.json())

        active_manifest_id = manifest_store["active_manifest"]
        active_manifest = manifest_store["manifests"][active_manifest_id]

        digital_source_type = None
        for assertion in active_manifest.get("assertions", []):
            if assertion.get("label") == "c2pa.actions.v2":
                actions = assertion.get("data", {}).get("actions", [])
                for action in actions:
                    if action.get("action") == "c2pa.created":
                        digital_source_type = action.get("digitalSourceType")
                        break

        is_ai = bool(digital_source_type and "trainedAlgorithmicMedia" in digital_source_type)
        return (is_ai, manifest_store)
    except Exception as e:
        if "ManifestNotFound" in str(e) or "no JUMBF data" in str(e):
            return (False, {"status": "No C2PA Manifest Found"})
        print(f"Warning: C2PA error: {e}")
        return (False, {"error": str(e)})


def check_metadata(path: str):
    """Get generic metadata using ffprobe"""
    if not shutil.which("ffprobe"):
        log_info("⚠️ FFmpeg not available for metadata extraction")
        return {}
    
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", path],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
            text=True,
        )
        return json.loads(result.stdout)
    except subprocess.CalledProcessError as e:
        log_info(f"Error running ffprobe: {e.stderr}")
        return {}


def summarize_metadata(path: str) -> Dict[str, Any]:
    """Summarize video metadata including C2PA"""
    if not os.path.exists(path):
        return {"error": "File not found"}

    c2pa_ai, c2pa_data = check_c2pa(path)
    probe = check_metadata(path)
    fmt = probe.get("format", {})
    
    summary = {
        "format": fmt.get("format_name"),
        "duration": fmt.get("duration", "unknown"),
        "creation_time": fmt.get("tags", {}).get("creation_time", "missing"),
        "encoder": fmt.get("tags", {}).get("encoder", "unknown"),
        "device": fmt.get("tags", {}).get("com.apple.quicktime.make", "unknown"),
        "c2pa_ai": c2pa_ai,
        "c2pa_data": c2pa_data,
    }
    
    return summary


def check_video_synthid(video_path: str, video_metadata: Dict, twelvelabs_analysis: str) -> Dict[str, Any]:
    """Use Gemini to detect AI generation and misinformation signals"""
    log_step("SynthID: Analyzing video for AI generation...")
    
    try:
        # Upload video to Gemini
        log_info("Uploading video to Gemini...")
        video_file = genai.upload_file(path=video_path)
        
        # Wait for processing
        log_info("Waiting for video processing...")
        while video_file.state.name == "PROCESSING":
            time.sleep(2)
            video_file = genai.get_file(video_file.name)
        
        if video_file.state.name == "FAILED":
            raise RuntimeError(f"Video upload failed: {video_file.state.name}")
        
        log_info(f"Video ready: {video_file.uri}")
        
        # Analyze with multimodal context
        prompt = f"""
You are a misinformation detection expert.

METADATA: {json.dumps(video_metadata, indent=2)}
Video Analysis Context: {twelvelabs_analysis[:2000]}

TASK:
1. Cross-reference visual and audio elements for consistency
2. Look for Visual-Audio Inconsistency (e.g., environment doesn't match claims)
3. Detect signs of AI generation or deepfake manipulation
4. Check if C2PA metadata indicates AI generation

Return EXACTLY this JSON structure: 
{{ "is_ai": bool, "trust_score": 0-100, "confidence": 0-100, "note": "string" }}
"""
        
        # Use multimodal model for video analysis
        log_info(f"Using Gemini model: {gemini_video_model_name}")
        video_model = genai.GenerativeModel(model_name=gemini_video_model_name)
        response = video_model.generate_content([video_file, prompt])
        
        text = (response.text or "").strip()
        
        # Extract JSON
        if "```" in text:
            parts = text.split("```")
            if len(parts) >= 2:
                text = parts[1].replace("json", "", 1).strip()
        
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(text[start:end + 1])
        
        return {"is_ai": False, "trust_score": 50, "confidence": 50, "note": "Unable to parse response"}
        
    except Exception as e:
        log_info(f"⚠️ SynthID analysis error: {e}")
        return {"is_ai": False, "trust_score": 50, "confidence": 50, "note": f"Error: {str(e)}"}


# =========================
# TWELVELABS PIPELINE (from backendp1.py)
# =========================
def create_index() -> str:
    log_step("TwelveLabs: Creating index...")
    idx = client.indexes.create(
        index_name=f"forensics-{int(time.time())}",
        models=[{"model_name": "pegasus1.2", "model_options": ["visual", "audio"]}],
    )
    log_info(f"✓ Created index: {idx.id}")
    return idx.id


def upload_and_index(index_id: str, video_path: str) -> str:
    log_step("TwelveLabs: Uploading video...")
    
    def _upload():
        with open(video_path, "rb") as f:
            return client.assets.create(method="direct", file=f)
    
    asset = with_retries(_upload)
    asset_id = asset.id
    log_info(f"Uploaded asset: {asset_id}")
    
    log_step("Waiting for asset processing...")
    while True:
        st = client.assets.retrieve(asset_id)
        log_info(f"Asset status: {st.status}")
        
        if st.status == "ready":
            break
        if st.status == "failed":
            raise RuntimeError("Asset processing failed")
        time.sleep(ASSET_POLL_SEC)
    
    log_step("TwelveLabs: Indexing asset...")
    indexed = client.indexes.indexed_assets.create(index_id=index_id, asset_id=asset_id)
    indexed_id = indexed.id
    log_info(f"Indexing started: {indexed_id}")
    
    log_step("Waiting for indexing...")
    while True:
        st = client.indexes.indexed_assets.retrieve(index_id=index_id, indexed_asset_id=indexed_id)
        log_info(f"Index status: {st.status}")
        
        if st.status == "ready":
            break
        if st.status == "failed":
            raise RuntimeError("Indexing failed")
        time.sleep(INDEX_POLL_SEC)
    
    log_info(f"✓ Video ready. video_id={indexed_id}")
    return indexed_id


def analyze_video(video_id: str, prompt: str) -> str:
    log_step("TwelveLabs: Running analyze()...")
    r = client.analyze(video_id=video_id, prompt=prompt, temperature=0.2)
    txt = (r.data or "").strip()
    log_info(f"✓ analyze() complete (chars={len(txt)})")
    return txt


# =========================
# GEMINI HELPERS
# =========================
def gemini_json(prompt: str) -> Dict[str, Any]:
    debug(f"gemini_json() prompt length={len(prompt)}")
    
    resp = gemini_text_model.generate_content(prompt)
    text = (resp.text or "").strip()
    
    if "```" in text:
        parts = text.split("```")
        if len(parts) >= 2:
            text = parts[1].replace("json", "", 1).strip()
    
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end != -1 and end > start:
        raw_json = text[start:end + 1]
        return json.loads(raw_json)
    
    raise ValueError(f"Gemini did not return valid JSON.\nRaw:\n{text[:1200]}")


def gemini_structure(video_text: str, caption: str) -> Dict[str, Any]:
    """Extract summary and claims from video content"""
    log_step("Gemini: Structuring claims...")
    
    prompt = f"""
Return ONLY JSON.

{{
  "video_summary": "",
  "caption_summary": "",
  "combined_summary": "",
  "claims": [
    {{
      "claim": "",
      "claim_source": "video/caption/both",
      "claim_type": "date/person/place/event/number/other",
      "evidence": [{{"source":"Video/Caption","text":""}}]
    }}
  ]
}}

Rules:
- If caption is empty, set caption_summary="" and claim_source should be "video".
- Extract 8-12 CHECKABLE claims when possible. Prefer factual / testable claims.
- Evidence must be short and directly copied/summarized from the input.
- No markdown.

CAPTION:
{caption}

VIDEO_TEXT:
{video_text}
"""
    return gemini_json(prompt)


# =========================
# WEB FACT-CHECKING (TAVILY)
# =========================
def web_evidence_for_claim(claim: str) -> Dict[str, Any]:
    """Fetch web sources for a claim"""
    def _search():
        return tavily_client.search(
            query=claim,
            search_depth=WEB_SEARCH_DEPTH,
            max_results=WEB_MAX_RESULTS,
            include_answer=False,
            include_raw_content=False,
            include_images=False,
        )
    
    log_info(f"Web search: {claim[:60]}...")
    res = with_retries(_search, retries=3, base_sleep=1.0)
    
    results = res.get("results", []) if isinstance(res, dict) else []
    trimmed_results = []
    for r in results:
        r2 = dict(r)
        content = (r2.get("content") or "")
        if len(content) > WEB_CONTENT_TRIM_CHARS:
            r2["content"] = content[:WEB_CONTENT_TRIM_CHARS] + "..."
        trimmed_results.append(r2)
    
    return {"results": trimmed_results}


def gemini_factcheck_one_claim(claim: str, claim_source: str, sources: Dict[str, Any]) -> Dict[str, Any]:
    """Fact-check a single claim using web sources"""
    prompt = f"""
Return ONLY JSON.

{{
  "claim": "{claim}",
  "claim_source": "{claim_source}",
  "verdict": "true/false/mixed/unclear",
  "confidence": 0-100,
  "correct_information": "",
  "explanation": "",
  "citations": [{{"url":"", "supporting_text":""}}]
}}

Rules:
- Use ONLY the SOURCES below.
- If SOURCES do not support the claim, verdict MUST be "unclear".
- If SOURCES contradict each other, verdict="mixed".
- Provide 1-3 citations. supporting_text must be short.
- No markdown.

SOURCES:
{json.dumps(sources, ensure_ascii=False)}
"""
    return gemini_json(prompt)


def gemini_factcheck(structured: Dict[str, Any]) -> Dict[str, Any]:
    """Fact-check all claims using web evidence"""
    log_step("Gemini+Web: Fact-checking claims...")
    out: List[Dict[str, Any]] = []
    
    claims = structured.get("claims", []) or []
    for i, c in enumerate(claims, start=1):
        claim = (c.get("claim") or "").strip()
        claim_source = (c.get("claim_source") or "video").strip()
        
        if not claim:
            continue
        
        log_info(f"Claim {i}/{len(claims)}: {claim[:70]}...")
        sources = web_evidence_for_claim(claim)
        
        if not sources.get("results"):
            out.append({
                "claim": claim,
                "claim_source": claim_source,
                "verdict": "unclear",
                "confidence": 0,
                "correct_information": "",
                "explanation": "No web sources found for this claim.",
                "citations": [],
            })
            continue
        
        verdict = gemini_factcheck_one_claim(claim, claim_source, sources)
        verdict.setdefault("claim", claim)
        verdict.setdefault("claim_source", claim_source)
        verdict.setdefault("verdict", "unclear")
        verdict.setdefault("confidence", 0)
        verdict.setdefault("correct_information", "")
        verdict.setdefault("explanation", "")
        verdict.setdefault("citations", [])
        
        out.append(verdict)
    
    return {"results": out}


def gemini_splice(video_id: str) -> Dict[str, Any]:
    """Detect context shifts and splice manipulation"""
    log_step("Splice: Detecting context shifts...")
    
    prompt = """
Return ONLY JSON:
{
  "has_sudden_shifts": true/false,
  "splice_risk_score": 0-100,
  "summary": ""
}

Rules:
- Ignore normal editing: tip cards, title screens, jump cuts, camera angles, b-roll.
- Give HIGH splice_risk_score only for real context mismatches:
  different locations as same, mismatched time/events, conflicting audio/visuals,
  repurposed footage, conflicting labels.
- Single coherent tutorial with edit cards: keep splice_risk_score low (0-30).
"""
    raw = analyze_video(video_id, prompt)
    
    try:
        return json.loads(raw)
    except:
        return gemini_json("Convert to JSON with keys has_sudden_shifts, splice_risk_score, summary:\n\n" + raw)


def gemini_timeline(structured: Dict[str, Any], posted_date: str) -> Dict[str, Any]:
    """Check for timeline mismatches"""
    log_step("Timeline: Checking date consistency...")
    
    prompt = f"""
Return ONLY JSON.

{{
  "posted_date": "{posted_date}",
  "likely_event_year": null,
  "time_relation": "same_year/past_years/future/unclear",
  "timeline_mismatch_risk_score": 0-100,
  "why": "",
  "what_is_correct": ""
}}

Goal:
- If caption/video implies event year far from posted_date, flag it.
- If no explicit year/date clues, use unclear.

STRUCTURED:
{json.dumps(structured, ensure_ascii=False)}
"""
    return gemini_json(prompt)


# =========================
# FINAL SCORING
# =========================
def compute_final(factcheck: Dict[str, Any], splice: Dict[str, Any], timing: Dict[str, Any]) -> Dict[str, Any]:
    """Compute final verdict and risk score"""
    results = factcheck.get("results", [])
    
    false_or_mixed = sum(1 for r in results if r.get("verdict") in ["false", "mixed"])
    unclear = sum(1 for r in results if r.get("verdict") == "unclear")
    avg_conf = (sum(r.get("confidence", 0) for r in results) / max(1, len(results)))
    
    splice_score = int(splice.get("splice_risk_score", 0) or 0)
    time_score = int(timing.get("timeline_mismatch_risk_score", 0) or 0)
    
    risk = 0
    risk += splice_score * 0.25
    risk += time_score * 0.35
    risk += false_or_mixed * 14
    risk += unclear * 5
    risk = int(max(0, min(100, round(risk))))
    
    # Verdict logic
    if false_or_mixed == 0 and time_score < 60:
        verdict = "REAL" if risk < 70 else "MISLEADING"
    else:
        if false_or_mixed >= 2 or risk >= 75:
            verdict = "FAKE"
        elif false_or_mixed >= 1 or risk >= 50 or time_score >= 60:
            verdict = "MISLEADING"
        else:
            verdict = "REAL"
    
    confidence = int(max(50, min(95, round(90 - risk * 0.6))))
    
    return {
        "verdict": verdict,
        "confidence_percent": confidence,
        "misinformation_risk_score": risk,
        "avg_factcheck_confidence": round(avg_conf, 1),
        "false_or_mixed_claims": false_or_mixed,
        "unclear_claims": unclear,
        "splice_risk_score": splice_score,
        "timeline_mismatch_risk_score": time_score,
        "likely_event_year": timing.get("likely_event_year"),
        "posted_date": timing.get("posted_date"),
    }


def make_user_report(final: Dict[str, Any], structured: Dict[str, Any], splice: Dict[str, Any],
                     timing: Dict[str, Any], factcheck: Dict[str, Any], metadata: Dict[str, Any],
                     synthid: Dict[str, Any]) -> Dict[str, Any]:
    """Create user-friendly report"""
    reasons = []
    
    s = final["splice_risk_score"]
    t = final["timeline_mismatch_risk_score"]
    f = final["false_or_mixed_claims"]
    u = final["unclear_claims"]
    
    # C2PA and SynthID insights
    if metadata.get("c2pa_ai"):
        reasons.append("C2PA metadata indicates AI-generated content.")
    if synthid.get("is_ai"):
        reasons.append("SynthID analysis detected AI generation patterns.")
    
    reasons.append("Normal editing/jump cuts detected (common in tutorials)." if s >= 30 else
                   "Little to no abrupt editing detected.")
    
    reasons.append("Timeline looks consistent with posted date." if t < 30 else
                   "Some timeline uncertainty." if t < 60 else
                   "Posted date and event timing look inconsistent.")
    
    reasons.append("Key claims look consistent with web sources." if f == 0 and u == 0 else
                   "Some claims could not be confirmed from web sources." if f == 0 else
                   "One or more claims appear false or misleading based on web sources.")
    
    corrections = []
    for r in factcheck.get("results", []):
        if r.get("verdict") in ["false", "mixed"]:
            corrections.append({
                "incorrect_claim": r.get("claim", ""),
                "correct_information": r.get("correct_information", ""),
                "confidence": r.get("confidence", 0),
                "explanation": r.get("explanation", ""),
                "citations": r.get("citations", []),
            })
    
    summary = structured.get("combined_summary") or structured.get("video_summary") or ""
    
    return {
        "verdict": final["verdict"],
        "confidence_percent": final["confidence_percent"],
        "risk_score": final["misinformation_risk_score"],
        "top_reasons": reasons[:5],
        "summary": summary[:900],
        "corrections": corrections[:5],
        "signals": {
            "splice_risk_score": s,
            "timeline_mismatch_risk_score": t,
            "likely_event_year": final.get("likely_event_year"),
            "c2pa_ai_detected": metadata.get("c2pa_ai", False),
            "synthid_ai_detected": synthid.get("is_ai", False),
            "synthid_trust_score": synthid.get("trust_score", 50),
        },
        "metadata": {
            "format": metadata.get("format"),
            "duration": metadata.get("duration"),
            "encoder": metadata.get("encoder"),
            "c2pa_data": metadata.get("c2pa_data", {}),
        },
        "synthid": synthid,
        "details": {
            "structured": structured,
            "splice": splice,
            "timing": timing,
            "factcheck": factcheck,
            "final": final,
        }
    }


# =========================
# API ROUTES
# =========================

@app.route('/api/analyze-factcheck', methods=['POST'])
def analyze_factcheck():
    """
    Fact-checking analysis endpoint.
    Analyzes video for misinformation, splice detection, and timeline consistency.
    Accepts: multipart/form-data with video file, caption_text, posted_date
    Returns: Fact-check analysis results
    """
    log_step("New request: /api/analyze-factcheck")
    
    # Validate request
    if 'video' not in request.files:
        return jsonify({"error": "No video file provided"}), 400
    
    video_file = request.files['video']
    if video_file.filename == '':
        return jsonify({"error": "Empty filename"}), 400
    
    caption = request.form.get('caption_text', '').strip()
    posted_date = request.form.get('posted_date', '').strip()
    
    log_info(f"Video: {video_file.filename}")
    log_info(f"Caption length: {len(caption)}")
    log_info(f"Posted date: {posted_date or '(none)'}")
    
    # Save uploaded file
    filename = secure_filename(video_file.filename)
    temp_dir = tempfile.mkdtemp()
    video_path = os.path.join(temp_dir, filename)
    video_file.save(video_path)
    
    try:
        # PHASE 1: TwelveLabs Analysis
        log_step("PHASE 1: TwelveLabs Video Analysis")
        idx_id = create_index()
        video_id = upload_and_index(idx_id, video_path)
        
        log_step("Extracting transcript/visible text/scene summary...")
        base_prompt = """
Return under EXACT headings:
TRANSCRIPT:
VISIBLE_TEXT:
SCENE_SUMMARY:
"""
        result_text = analyze_video(video_id, base_prompt)
        video_text_trim = result_text[:MAX_VIDEO_TEXT_CHARS]
        
        # PHASE 2: Gemini Structuring
        log_step("PHASE 2: Structuring Claims")
        structured = gemini_structure(video_text_trim, caption)
        
        # PHASE 3: Web Fact-Checking
        log_step("PHASE 3: Fact-Checking")
        factcheck = gemini_factcheck(structured)
        
        # PHASE 4: Splice Detection
        log_step("PHASE 4: Splice Detection")
        splice = gemini_splice(video_id)
        
        # PHASE 5: Timeline Check
        log_step("PHASE 5: Timeline Analysis")
        timing = gemini_timeline(structured, posted_date)
        
        # PHASE 6: Final Scoring
        log_step("PHASE 6: Computing Final Score")
        final = compute_final(factcheck, splice, timing)
        
        # Prepare final label
        final_label = f"{final['verdict']} - {final['confidence_percent']}% Confidence"
        
        # Add one_line_label to final
        final["one_line_label"] = final_label
        
        # Generate report matching frontend structure
        report = {
            "final": final,
            "structured": structured,
            "claims": {
                "claims": structured.get("claims", [])
            },
            "factcheck": factcheck,
            "splice": splice,
            "timing": timing,
            "signals": {
                "splice_risk_score": final["splice_risk_score"],
                "timeline_mismatch_risk_score": final["timeline_mismatch_risk_score"],
            },
            "details": {
                "structured": structured,
                "splice": splice,
                "timing": timing,
                "factcheck": factcheck,
                "final": final,
            }
        }
        
        log_step("Fact-check analysis complete ✅")
        log_info(f"Verdict: {report['final']['verdict']} | {report['final']['confidence_percent']}% | risk={report['final']['misinformation_risk_score']}/100")
        
        return jsonify(report)
        
    except Exception as e:
        log_info(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
        
    finally:
        # Cleanup
        try:
            shutil.rmtree(temp_dir)
        except:
            pass


@app.route('/api/analyze-ai', methods=['POST'])
def analyze_ai():
    """AI generation detection endpoint"""
    log_step("New request: /api/analyze-ai")
    
    # Validate request
    if 'video' not in request.files:
        return jsonify({"error": "No video file provided"}), 400
    
    video_file = request.files['video']
    if video_file.filename == '':
        return jsonify({"error": "Empty filename"}), 400
    
    log_info(f"Video: {video_file.filename}")
    
    filename = secure_filename(video_file.filename)
    temp_dir = tempfile.mkdtemp()
    video_path = os.path.join(temp_dir, filename)
    video_file.save(video_path)
    
    try:
        log_step("PHASE 1: Extracting Metadata")
        metadata = summarize_metadata(video_path)
        
        log_step("PHASE 2: SynthID AI Detection")
        synthid = check_video_synthid(video_path, metadata, "")
        
        report = {
            "is_ai_generated": synthid.get("is_ai", False) or metadata.get("c2pa_ai", False),
            "trust_score": synthid.get("trust_score", 50),
            "confidence": synthid.get("confidence", 50),
            "detection_methods": {
                "c2pa_metadata": {
                    "detected": metadata.get("c2pa_ai", False),
                    "data": metadata.get("c2pa_data", {})
                },
                "synthid_analysis": synthid
            },
            "metadata": {
                "format": metadata.get("format"),
                "duration": metadata.get("duration"),
                "encoder": metadata.get("encoder"),
                "device": metadata.get("device")
            },
            "note": synthid.get("note", "Analysis complete")
        }
        
        log_step("AI detection complete ✅")
        log_info(f"AI Detected: {report['is_ai_generated']} | Trust Score: {report['trust_score']}/100")
        
        return jsonify(report)
        
    except Exception as e:
        log_info(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
        
    finally:
        # Cleanup
        try:
            shutil.rmtree(temp_dir)
        except:
            pass


@app.route('/api/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        "status": "ok",
        "timestamp": time.time(),
        "endpoints": {
            "factcheck": "/api/analyze-factcheck",
            "ai_detection": "/api/analyze-ai"
        },
        "services": {
            "twelvelabs": bool(TL_API_KEY),
            "gemini": bool(GEMINI_API_KEY),
            "tavily": bool(TAVILY_API_KEY),
        },
        "models": {
            "text": GEMINI_TEXT_MODEL,
            "video": GEMINI_VIDEO_MODEL
        }
    })


if __name__ == '__main__':
    print("=" * 60)
    print("Video Forensics Backend - Dual Endpoint Server")
    print("=" * 60)
    print(f"TwelveLabs API: {'✓' if TL_API_KEY else '✗'}")
    print(f"Gemini API: {'✓' if GEMINI_API_KEY else '✗'}")
    print(f"Tavily API: {'✓' if TAVILY_API_KEY else '✗'}")
    print("-" * 60)
    print(f"Text Analysis Model: {GEMINI_TEXT_MODEL}")
    print(f"Video Analysis Model: {GEMINI_VIDEO_MODEL}")
    print("-" * 60)
    print("Available Endpoints:")
    print("  POST /api/analyze-factcheck  - Fact-checking & misinformation")
    print("  POST /api/analyze-ai         - AI generation detection")
    print("  GET  /api/health             - Health check")
    print("=" * 60)
    app.run(host='0.0.0.0', port=5000, debug=True)

