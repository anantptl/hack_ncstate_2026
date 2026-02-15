<<<<<<< HEAD
# hack_ncstate_2026
Repo for our Hack_NCState project
=======
# Video Forensics - AI-Powered Video Analysis Platform

A comprehensive video analysis platform that combines multiple AI models to detect misinformation, AI-generated content, and video manipulation.

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

**Request**:
- `video` (file): Video file
- `caption_text` (optional): Associated caption
- `posted_date` (optional): Date posted (YYYY-MM-DD)

**Response**: Verdict, claims, fact-check results, splice detection, timeline analysis

### POST `/api/analyze-ai`
Detects AI-generated content.

**Request**:
- `video` (file): Video file

**Response**: AI detection status, trust score, C2PA data, SynthID analysis

## Project Structure

```
├── backend.py              # Flask backend server
├── index.html              # Main HTML file
├── src/
│   ├── app.ts             # TypeScript application logic
│   └── styles.css         # Global styles
├── requirements.txt        # Python dependencies
├── package.json           # Node dependencies
├── .env                   # API keys (not in git)
├── .env.example           # Environment template
└── README.md              # This file
```

## Usage

1. Open the application in your browser
2. Upload a video file (MP4, MOV, WEBM, AVI, WMV, FLV, MKV)
3. (Optional) Add additional context in the caption field
4. Choose analysis type:
   - **Fact-Check Analysis**: For misinformation detection
   - **AI Detection**: For AI-generated content detection
5. View comprehensive results with:
   - Overall verdict and confidence scores
   - Identified claims with evidence
   - Fact-check results from web sources
   - Splice and manipulation detection
   - AI generation markers
   - Video metadata

## License

MIT License - See LICENSE file for details

## Support

For issues or questions, please open an issue on GitHub.

The server will start on `http://localhost:5000`

## API Endpoints

### POST /api/analyze

Analyzes a video for misinformation, manipulation, and AI generation.

**Request**: `multipart/form-data`
- `video` (file): Video file to analyze
- `caption_text` (string, optional): Associated caption or description
- `posted_date` (string, optional): Date the video was posted (YYYY-MM-DD)

**Response**: JSON object with:

```json
{
  "verdict": "REAL|MISLEADING|FAKE",
  "confidence_percent": 85,
  "risk_score": 35,
  "top_reasons": ["...", "..."],
  "summary": "Video summary...",
  "corrections": [...],
  "signals": {
    "splice_risk_score": 20,
    "timeline_mismatch_risk_score": 15,
    "c2pa_ai_detected": false,
    "synthid_ai_detected": false,
    "synthid_trust_score": 75
  },
  "metadata": {
    "format": "mov,mp4,m4a,3gp,3g2,mj2",
    "duration": "120.5",
    "encoder": "Lavf58.29.100",
    "c2pa_data": {...}
  },
  "synthid": {
    "is_ai": false,
    "trust_score": 75,
    "confidence": 85,
    "note": "Analysis note..."
  },
  "details": {
    "structured": {...},
    "splice": {...},
    "timing": {...},
    "factcheck": {...}
  }
}
```

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

## Architecture

```
User Uploads Video
    ↓
Flask Backend (backend.py)
    ↓
    ├─→ Phase 1: Metadata Analysis
    │   ├─ C2PA metadata check
    │   └─ FFmpeg metadata extraction
    │
    ├─→ Phase 2: TwelveLabs Analysis
    │   ├─ Upload & Index video
    │   └─ Extract transcript/visible text/scenes
    │
    ├─→ Phase 3: Gemini Structuring
    │   └─ Identify verifiable claims
    │
    ├─→ Phase 4: Web Fact-Checking
    │   ├─ Tavily search for each claim
    │   └─ Gemini fact-check with sources
    │
    ├─→ Phase 5: Splice Detection
    │   └─ TwelveLabs context shift analysis
    │
    ├─→ Phase 6: Timeline Check
    │   └─ Gemini date consistency check
    │
    ├─→ Phase 7: SynthID Analysis
    │   └─ Gemini multimodal AI detection
    │
    └─→ Phase 8: Final Scoring
        └─ Combine all signals
    ↓
Final Report to User
```

## Frontend Integration

The frontend (`src/app.ts`) sends video files to `/api/analyze` and displays:
- Overall verdict (REAL/MISLEADING/FAKE)
- Confidence percentage
- Risk scores (splice, misinformation, timeline)
- AI generation indicators (C2PA, SynthID)
- Video metadata
- Detailed claim-by-claim fact-checking
- Corrections with citations

## Differences from Original Backends

### backendp1.py → backend.py
- Changed from FastAPI to Flask
- Removed YouTube download (now accepts direct file uploads)
- Removed FFmpeg fix step (optional, applied only if TwelveLabs rejects file)
- Integrated with metadata/SynthID analysis

### backendp2.py → backend.py
- Functions now integrated into main Flask app
- SynthID analysis receives TwelveLabs context for better accuracy
- Results combined with fact-checking pipeline

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

[Your License Here]
>>>>>>> d360fab (frontend + backend code)
