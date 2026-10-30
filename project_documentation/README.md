# EduSense AI: Quick Start & Execution Guide
## Project Documentation & Local Deployment Reference

---

### 1. Project Summary

**EduSense AI** is a real-time smart classroom platform built with React 19, FastAPI, PostgreSQL 16, and LiveKit WebRTC. It integrates deep-learning biometrics (SCRFD + ArcFace 512D embeddings), temperature-calibrated facial emotion recognition (FERPlus ONNX), multilingual speech transcription (faster-whisper), text sentiment analysis, and multimodal engagement analytics to modernize remote and hybrid education.

---

### 2. Documentation Directory Map

This folder (`project_documentation/`) contains the complete technical and academic project report:

1. **`PROJECT_OVERVIEW.md`**: High-level executive summary, problem statement, objectives, and implementation status.
2. **`TECHNICAL_DOCUMENTATION.md`**: Detailed technology stack, architecture diagrams (Mermaid), database schema, API endpoint references, and deep-dive implementation mechanics.
3. **`PROJECT_REPORT.md`**: University-format major project report organized into Chapters 1 to 8, References, and Appendices.
4. **`METHODOLOGY_AND_ALGORITHMS.md`**: Mathematical formulations, proofs, and pseudocode for all 10 core algorithms.
5. **`TESTING_AND_LIMITATIONS.md`**: Empirical benchmark results, 45-case test matrix, and technical failure mode analyses.
6. **`VIVA_QUESTIONS.md`**: 60 project-specific viva voce defense questions and detailed model answers.
7. **`REFERENCES.md`**: Official documentation and verifiable academic research references.
8. **`README.md`**: This setup and execution reference guide.

---

### 3. Prerequisites

* **Operating System**: macOS (Apple Silicon / Intel) or Linux (Ubuntu 22.04 LTS)
* **Python Runtime**: Python 3.12+ (existing virtual environment at `backend/venv`)
* **Node.js Runtime**: Node.js v20+ and npm v10+
* **Database Engine**: PostgreSQL 16+
* **LiveKit Server**: LiveKit WebRTC Server v1.5+

---

### 4. Step-by-Step Local Setup & Execution

#### Step 1: PostgreSQL Database Configuration
Ensure PostgreSQL is active and create the database if not already present:
```bash
# Start PostgreSQL service on macOS
brew services start postgresql@16

# Verify or create the database
createdb edusense_db
```

#### Step 2: Backend Setup & Startup (Port 8000)
```bash
cd /Users/apple/Desktop/Edusense_AI/backend

# Activate existing Python 3.12 virtual environment
source venv/bin/activate

# Apply any pending database schema migrations
alembic upgrade head

# Start FastAPI ASGI server
uvicorn app.main:app --reload --port 8000
```
* **Interactive API Documentation (Swagger)**: `http://localhost:8000/docs`
* **Service Health Check**: `http://localhost:8000/api/health`

#### Step 3: Frontend Setup & Startup (Port 5173)
Open a new terminal window:
```bash
cd /Users/apple/Desktop/Edusense_AI/frontend

# Install dependencies if needed
npm install

# Start Vite development server
npm run dev
```
* **Application Web Interface**: `http://localhost:5173`

#### Step 4: LiveKit WebRTC Server (Port 7880)
If conducting live multi-participant video calls, run the LiveKit development server:
```bash
livekit-server --dev
```
*(Default development credentials match `.env.example`: URL: `http://localhost:7880`, Key: `devkey`, Secret: `secret`)*

---

### 5. Running Verification & Test Suites

Execute verified test suites from the project root:

```bash
cd /Users/apple/Desktop/Edusense_AI

# 1. Comprehensive Facial Emotion & Attentiveness Pipeline Suite (6 tests)
backend/venv/bin/pytest backend/test_facial_pipeline_comprehensive.py -v

# 2. Automated Face Attendance Verification Suite
backend/venv/bin/python backend/test_phase3b_attendance.py

# 3. Speech Transcription & Multilingual Audio API Suite
backend/venv/bin/python backend/test_transcription_api.py

# 4. Teacher Attendance Management & Manual Correction Flow
backend/venv/bin/python backend/test_teacher_attendance_records_flow.py

# 5. Session Lifecycle & LiveKit Integration Suite
backend/venv/bin/python backend/test_class_session_lifecycle.py
```

---

### 6. Demonstration Sequence (Viva & Project Review)

1. **Verify Service Health**:
   * Navigate to `http://localhost:8000/api/health` and verify `status: "healthy", database: "connected"`.
2. **Teacher Account & Classroom Setup**:
   * Navigate to `http://localhost:5173/login`.
   * Log in with teacher credentials or register a new faculty account at `/register`.
   * Create a new classroom (e.g., Course Code: `AIML401`, Title: `Deep Learning & Computer Vision`).
   * Click **Launch Session** to start an active classroom session.
3. **Student Account & Biometric Face Enrollment**:
   * Open an incognito browser window and register a student account.
   * Navigate to **Face Enrollment** (`/face-enrollment`).
   * Complete the 5-step guided face capture sequence (`front`, `left`, `right`, `up`, `down`).
   * Verify that the consistency score is computed and the green **Biometrics Enrolled** badge appears.
4. **Join Classroom & Automatic Attendance Verification**:
   * Enter the active session code as the student and allow camera permissions.
   * Observe the live video feed. Within 12–16 seconds (3 periodic samples), the attendance status badge automatically transitions from `UNVERIFIED` to **`VERIFIED: PRESENT`**.
5. **Real-Time Facial Emotion & Attentiveness Badges**:
   * Every 4 seconds, observe the floating emotion badge on the student video tile (e.g. `😐 Neutral (78%)`, `😊 Happy (85%)`).
   * Turn head away from the screen; notice the attentiveness score decrease and the distraction status update.
6. **Live Speech Transcription & Captions**:
   * Speak into the microphone; observe real-time speech transcription closed captions appearing in English, Hindi, or Kannada.
7. **Teacher Analytics & Engagement Dashboard**:
   * Switch back to the Teacher dashboard.
   * Open the **Attendance Roster** to view confirmed attendance records.
   * Open the **Analytics Dashboard** to inspect 5-minute rolling window expression distributions, average engagement percentages, and distraction event logs.
