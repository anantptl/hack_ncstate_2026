# Video Forensics - AI-Powered Video Analysis Platform

**Team:** Clanker Detectors  
**Team Members:** [Smiti Kothari](https://www.linkedin.com/in/smitikothari/), [Jayneel Shah](https://www.linkedin.com/in/jayneel-m-shah/), Anant Patel, Joshua Jones
**Track:** Siren's Call - Hack NC State 2026

## Motivation

In today's digital landscape, misinformation spreads rapidly through two primary attack vectors:

1. **Video Clipping & Context Manipulation**: Bad actors selectively clip authentic video footage, removing crucial context to create misleading narratives. A politician's statement taken out of context, a news segment edited to suggest false causality, or historical footage repurposed for modern events can all spread false information while appearing legitimate.

2. **AI-Generated Deepfakes**: With the advancement of generative AI, malicious actors can now create entirely synthetic videos that appear real. These AI-generated videos can show people saying or doing things they never did, creating false evidence that can damage reputations, influence elections, or incite violence.

Both techniques are increasingly sophisticated and difficult for the average person to detect. This project tackles **both problems** by combining multiple detection methods:

- **AI Video Detection**: Analyzes C2PA metadata tags and uses Google Gemini's multimodal AI to identify synthetic content and deepfakes
- **Video Content Analysis**: Leverages TwelveLabs AI to extract transcripts, visible text, and scene summaries from videos
- **Real-World Fact-Checking**: Cross-references claims against internet sources using Tavily search to verify facts and identify misinformation
- **Splice & Manipulation Detection**: Detects context shifts, timeline inconsistencies, and edited footage that may indicate manipulation

Our platform provides a comprehensive, detailed analysis report that helps users identify both AI-generated content and manipulated real footage, empowering them to make informed decisions about video authenticity.

## Features

### Two Analysis Modes

#### 1. Fact-Check Analysis
- **TwelveLabs Video Analysis**: Extracts transcript, visible text, and scene summaries
- **Gemini AI**: Identifies and structures verifiable claims
- **Tavily Web Search**: Internet-grounded fact-checking with real sources
- **Splice Detection**: Detects context shifts and video manipulation
- **Timeline Analysis**: Checks for date inconsistencies

#### 2. AI Detection Analysis
- **C2PA Metadata Inspection**: Checks for AI generation tags in video metadata
- **SynthID Analysis**: Uses Gemini multimodal AI to detect deepfakes and AI-generated content
- **Video Metadata**: Extracts technical video information (format, encoder, duration)

## Tech Stack

### Backend
- **Flask** - Python web framework
- **TwelveLabs API** - Video understanding and analysis
- **Google Gemini AI** - Multimodal AI analysis
- **Tavily API** - Web search for fact-checking
- **FFmpeg** - Video metadata extraction

### Frontend
- **TypeScript** - Type-safe JavaScript
- **Vite** - Fast build tool
- **TailwindCSS** - Utility-first CSS framework
- **Font Awesome** - Icons

## Setup

### Prerequisites
- Python 3.8+
- Node.js 16+
- FFmpeg (for metadata extraction)

### 1. Install FFmpeg

**Windows**: 
```bash
choco install ffmpeg
```

**Mac**: 
```bash
brew install ffmpeg
```

**Linux**: 
```bash
sudo apt-get install ffmpeg
```

### 2. Install Dependencies

**Backend**:
```bash
pip install -r requirements.txt
```

**Frontend**:
```bash
npm install
```

### 3. Configure API Keys

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Add your API keys to `.env`:
- **TL_API_KEY**: Get from [TwelveLabs](https://twelvelabs.io)
- **GEMINI_API_KEY**: Get from [Google AI Studio](https://makersuite.google.com/app/apikey)
- **TAVILY_API_KEY**: Get from [Tavily](https://tavily.com)

### 4. Run the Application

**Start Backend**:
```bash
python backend.py
```
Backend runs on `http://localhost:5000`

**Start Frontend** (in another terminal):
```bash
npm run dev
```
Frontend runs on `http://localhost:5173`

**Build for Production**:
```bash
npm run build
```

## API Endpoints

### POST `/api/analyze-factcheck`
Analyzes video for misinformation and manipulations.

**Request**: `multipart/form-data`
- `video` (file): Video file to analyze
- `caption_text` (string, optional): Associated caption or description
- `posted_date` (string, optional): Date posted (YYYY-MM-DD)

**Response**: Verdict, claims, fact-check results, splice detection, timeline analysis

### POST /api/analyze-ai
Detects AI-generated content.

**Request**: `multipart/form-data`
- `video` (file): Video file to analyze

**Response**: AI detection status, trust score, C2PA data, SynthID analysis

### GET /api/health
Health check endpoint.

**Response**: 
```json
{
  "status": "ok",
  "timestamp": 1234567890,
  "services": {
    "twelvelabs": true,
    "gemini": true,
    "tavily": true
  }
}
```

## Project Structure

```
├── backend.py              # Flask backend server
├── index.html              # Main HTML file
├── src/
│   ├── app.ts             # TypeScript application logic
│   └── styles.css         # Global styles
├── requirements.txt        # Python dependencies
├── package.json           # Node dependencies
├── .env.example           # Environment template
└── README.md              # This file
```

## Usage

1. Open the application in your browser (`http://localhost:5173`)
2. Upload a video file (MP4, MOV, WEBM, AVI, WMV, FLV, MKV)
3. (Optional) Add additional context in the caption field
4. Choose analysis type:
   - **Fact-Check Analysis**: For misinformation detection and manipulated footage
   - **AI Detection**: For AI-generated content and deepfake detection
5. View comprehensive results with:
   - Overall verdict (REAL/MISLEADING/FAKE) and confidence scores
   - Identified claims with fact-check evidence
   - Real-world source verification from web searches
   - Splice and context manipulation detection
   - Timeline inconsistency analysis
   - AI generation markers (C2PA, SynthID)
   - Detailed video metadata and technical information

## Architecture

Our platform uses an 8-phase analysis pipeline to detect both AI-generated content and manipulated real footage:

```
User Uploads Video
    ↓
Flask Backend (backend.py)
    ↓
    ├─→ Phase 1: Metadata Analysis (For AI generated video check)
    │   ├─ C2PA metadata check (AI generation tags)
    │   └─ FFmpeg metadata extraction
    │
    ├─→ Phase 2: TwelveLabs Video Analysis (For Fact Check)
    │   ├─ Upload & Index video
    │   └─ Extract transcript/visible text/scene summaries
    │
    ├─→ Phase 3: Gemini Content Structuring (For Fact Check)
    │   └─ Identify verifiable claims from video content
    │
    ├─→ Phase 4: Internet Fact-Checking (For Fact Check)
    │   ├─ Tavily web search for each claim
    │   └─ Gemini cross-references with real-world sources
    │
    ├─→ Phase 5: Splice Detection (For Fact Check)
    │   └─ TwelveLabs context shift & manipulation analysis
    │
    ├─→ Phase 6: Timeline Verification (For Fact Check)
    │   └─ Gemini date inconsistency & temporal analysis
    │
    ├─→ Phase 7: SynthID AI Detection (For AI generated video check)
    │   └─ Gemini multimodal deepfake detection
    │
    └─→ Phase 8: Final Scoring & Reporting
        └─ Combine all signals into comprehensive verdict
    ↓
Detailed Analysis Report → User
```

## Frontend Integration

The TypeScript frontend ([src/app.ts](src/app.ts)) provides an intuitive interface that:
- Sends video files to analysis endpoints
- Displays overall verdict (REAL/MISLEADING/FAKE) with confidence scores
- Shows risk breakdown (splice detection, timeline mismatches, AI markers)
- Presents AI generation indicators (C2PA metadata, SynthID analysis)
- Displays detailed claim-by-claim fact-checking results
- Provides corrections with citations from real-world sources
- Shows comprehensive video metadata and technical details

## Implementation Notes

This project evolved through multiple iterations to create a comprehensive video forensics platform:

### Architecture Evolution
- **Framework**: Migrated from FastAPI to Flask for simpler deployment and integration
- **Video Input**: Shifted from YouTube URL downloads to direct file uploads for broader applicability
- **Modular Design**: Integrated separate analysis modules (metadata, content analysis, AI detection) into unified pipeline
- **Context-Aware Analysis**: SynthID analysis now receives TwelveLabs context for improved accuracy
- **Unified Reporting**: Combined fact-checking, manipulation detection, and AI detection into single comprehensive report

### Video Processing
- FFmpeg integration for metadata extraction and optional video repair
- Automatic handling of corrupted video metadata
- Support for multiple video formats (MP4, MOV, WEBM, AVI, WMV, FLV, MKV)

## Troubleshooting

### FFmpeg not found
Install FFmpeg and ensure it's in your PATH. The backend will still work without it, but metadata extraction will be limited.

### TwelveLabs upload fails
If you see "video_duration_invalid", the video may have corrupted metadata. You can manually fix it with:
```bash
ffmpeg -i input.mp4 -c:v libx264 -c:a aac -movflags +faststart output.mp4
```

### API key errors
Verify all three API keys are set in `.env` and are valid.

## Development

Run in debug mode:
```bash
python backend.py
```

The Flask app runs with `debug=True` by default for development. For production, set `debug=False` and use a production WSGI server like gunicorn:
```bash
gunicorn -w 4 -b 0.0.0.0:5000 backend:app
```

## License

MIT License

## Team

**Clanker Detectors**  
Hack NC State 2026 - Siren's Call Track

Building tools to combat misinformation and synthetic media in the age of AI.
