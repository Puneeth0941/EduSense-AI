# EduSense AI – Smart Classroom Attendance and Student Engagement Analytics

EduSense AI is a next-generation real-time web classroom platform designed to modernize remote and hybrid education. Built similar to Zoom and Google Meet, EduSense AI integrates computer vision, speech analytics, emotion recognition, and natural language processing to deliver real-time automated attendance and multi-modal student engagement insights.

---

## 🏗️ Architecture Overview & Design Principles

EduSense AI is structured into decoupled, modular layers to ensure real-time classroom transport is never blocked by compute-heavy AI inference workloads:

1. **Frontend Layer (`frontend/`)**: React + Vite + TypeScript single-page application providing clean classroom controls, participant grids, and real-time dashboard analytics.
2. **Backend Application (`backend/`)**: FastAPI (Python 3.12) REST API for authentication, classroom session scheduling, participant tracking, and analytics aggregation.
3. **Database Layer (`database/` & PostgreSQL)**: PostgreSQL database managed via SQLAlchemy 2.0 ORM with UUID primary keys and Alembic schema migrations.
4. **Real-time Classroom Transport**: Powered by LiveKit WebRTC server (integrated in Phase 2).
5. **Asynchronous AI Pipeline (`ai/`)**: Compute-heavy AI models (ArcFace/InsightFace, Whisper, BERT, YOLO, wav2vec 2.0) execute out-of-band on sampled intervals via background workers, preventing audio/video latency degradation.

---

## 🛠️ Technology Stack

* **Frontend**: React, Vite, TypeScript
* **Backend**: Python 3.12, FastAPI, SQLAlchemy 2.0, Pydantic v2
* **Database**: PostgreSQL 16+, Alembic
* **Real-time Video/Audio**: LiveKit (Phase 2 integration)
* **AI/ML Layer (Future Phases)**: InsightFace/ArcFace, Whisper, BERT, YOLO, wav2vec 2.0, late-fusion models

---

## 📁 Folder Structure

```
EduSense-AI/
│
├── frontend/
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── layouts/
│       ├── hooks/
│       ├── services/
│       ├── types/
│       ├── utils/
│       ├── context/
│       ├── features/
│       │   ├── auth/
│       │   ├── classroom/
│       │   ├── registration/
│       │   ├── attendance/
│       │   ├── analytics/
│       │   ├── reports/
│       │   └── agent/
│       ├── App.tsx
│       └── main.tsx
│
├── backend/
│   └── app/
│       ├── main.py
│       ├── core/
│       │   └── config.py
│       ├── api/
│       │   └── health.py
│       ├── models/
│       │   ├── base.py
│       │   ├── enums.py
│       │   ├── user.py
│       │   ├── profile.py
│       │   ├── classroom.py
│       │   ├── session.py
│       │   └── stubs.py
│       ├── schemas/
│       ├── services/
│       ├── repositories/
│       ├── db/
│       ├── middleware/
│       └── utils/
│   ├── alembic/
│   ├── alembic.ini
│   └── requirements.txt
│
├── ai/
├── database/
├── shared/
├── docs/
│
├── .env.example
├── .gitignore
└── README.md
```

---

## 🚀 Setup & Installation

### Prerequisites
- **Python**: 3.12+
- **Node.js**: v20+ & npm
- **PostgreSQL**: 16+

### 1. Database Setup
Create the PostgreSQL database locally:
```bash
createdb edusense_db
```

### 2. Backend Setup
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Create `.env` file in root or backend:
```bash
cp ../.env.example .env
```

Apply database migrations:
```bash
venv/bin/alembic upgrade head
```

Run FastAPI Backend server:
```bash
venv/bin/uvicorn app.main:app --reload --port 8000
```
Backend API interactive documentation is available at: `http://localhost:8000/docs`
Health Endpoint: `http://localhost:8000/api/health`

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Frontend development server will launch at: `http://localhost:5173`

---

## 🔑 Environment Variables Reference

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `ENVIRONMENT` | Execution mode | `development` |
| `DATABASE_URL` | SQLAlchemy PostgreSQL Connection URI | `postgresql://apple@localhost:5432/edusense_db` |
| `SECRET_KEY` | JWT signing secret key | *(Keep secure, do not commit)* |
| `ALLOWED_ORIGINS` | Permitted CORS origins | `http://localhost:5173,http://127.0.0.1:5173` |
| `LIVEKIT_URL` | LiveKit server endpoint | `http://localhost:7880` |

---

## 🤖 AI Models & Checkpoints

EduSense AI operates genuine, verified deep learning models without simulation:

1. **Facial Emotion Recognition (FER)**:
   - **Model**: `ai/models/emotion-ferplus.onnx` (ONNX Runtime, 8-class softmax: `neutral`, `happiness`, `surprise`, `sadness`, `anger`, `disgust`, `fear`, `contempt`).
   - **Calibrated Temperature**: $T = 0.9922$, calibrated default confidence threshold: $0.35$.
   - **Temporal Smoothing**: Rolling 5-frame exponential moving average (`EmotionTemporalSmoother`) to filter frame-to-frame jitter.
   - **Quality Gating**: Automatic illumination, blur detection, and multi-face uncertainty handling.
2. **Face Detection & Recognition**:
   - **Detection**: SCRFD (`det_500m.onnx` via InsightFace `buffalo_sc` model pack).
   - **Recognition / Embeddings**: ArcFace MobileFaceNet (`w600k_mbf.onnx`, 512-dimensional normalized embeddings).
   - **Verification**: Cosine similarity threshold $\ge 0.50$ for reliable student enrollment and automatic attendance marking.
3. **Speech Transcription & Captions**:
   - **Model**: `faster-whisper` (`base` model, CT2 int8 quantization on CPU/MPS).
   - **Live Processing**: Transcribes classroom audio streams in 4-second audio chunks with live UI captions.
4. **Multimodal Late Fusion**:
   - **Fusion Formula**: $P_{\text{final}} = w_{\text{face}} \cdot P_{\text{face}} + w_{\text{speech}} \cdot P_{\text{speech}}$ ($w_{\text{face}} = 0.65, w_{\text{speech}} = 0.35$).
   - **Discrepancy Detection**: Dynamically flags conflicting signals when modalities diverge.

---

## 🚀 Setup & Startup Instructions

### Prerequisites
- **Python**: 3.12 (virtualenv at `backend/venv`)
- **Node.js**: v20+ & npm
- **PostgreSQL**: 16 (`edusense_db`)

### 1. Database
Ensure PostgreSQL is active:
```bash
brew services start postgresql@16
```

### 2. Backend Startup
```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000
```
- API Docs: `http://localhost:8000/docs`
- Health Check: `http://localhost:8000/health` (or `http://localhost:8000/api/health`)

### 3. Frontend Startup
```bash
cd frontend
npm run dev
```
- Application UI: `http://localhost:5173`

---

## 🧪 Testing Suites

Run full backend unit and integration tests:
```bash
cd /Users/apple/Desktop/Edusense_AI

# Comprehensive Analytics & Facial Pipeline Unit Tests
backend/venv/bin/pytest backend/test_analytics.py backend/test_facial_pipeline_comprehensive.py

# Face Enrollment & Attendance Verification Flow
backend/venv/bin/python backend/test_phase3b_attendance.py

# Teacher & Student Analytics Aggregation Verification
backend/venv/bin/python backend/test_student_analytics_verification.py

# Speech Transcription & Captioning API
backend/venv/bin/python backend/test_transcription_api.py
```

---

## 🎬 Presentation Demonstration Sequence

1. **Start Services**: Launch backend (`port 8000`) and frontend (`port 5173`).
2. **Health Verification**: Open `http://localhost:8000/health` -> verify `status: "healthy", database: "connected"`.
3. **Student Registration & Face Enrollment**:
   - Navigate to `http://localhost:5173/register`.
   - Register a student account and capture their face snapshot for ArcFace 512-dim biometric enrollment.
4. **Join Classroom**:
   - Log in and enter an active classroom session.
   - Allow camera permissions.
5. **Demonstrate Automated Attendance**:
   - The system captures a camera frame, matches the 512-dim ArcFace embedding against enrolled profiles, and marks attendance automatically (reflected with a green verified badge).
6. **Demonstrate Real-Time Facial Emotion Recognition**:
   - Every 4 seconds, the video feed is sampled and evaluated by FERPlus ONNX.
   - The student tile displays a live floating emotion badge (e.g., `😐 Neutral (78%)`, `😊 Happy (85%)`) with temporal smoothing.
7. **Demonstrate Teacher Dashboard & Analytics**:
   - Switch to the teacher view.
   - Open the **Attendance Roster** to view confirmed attendance records.
   - View classroom engagement analytics, expression distributions, and distraction metrics.

---

## ⚠️ Known Limitations & Academic Prototype Boundaries

1. **Acoustic Speech Emotion Recognition**:
   - Whisper is used for accurate speech-to-text transcription and text sentiment heuristics.
   - Raw acoustic emotion extraction directly from vocal prosody (e.g., fine-tuned wav2vec 2.0) is a research prototype component and not claimed as production-ready.
2. **Single Camera Multi-Face Resolution**:
   - In standard single-student webcam setups, the largest frontal face is analyzed. If multiple faces appear in a single frame, the primary face is tracked or marked as ambiguous if occlusion occurs.
3. **Hardware Acceleration**:
   - Inference runs via ONNX Runtime CPU/CoreML and CT2 on Apple Silicon / macOS. High FPS video stream processing is avoided by design in favor of 4-second sampled analysis intervals.

---
