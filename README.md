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

## 📊 Phase 1 Status Summary

* [x] **Project Structure**: Created modular directory structure across frontend, backend, ai, database, shared, docs.
* [x] **FastAPI Backend**: Configured Python 3.12 FastAPI server with Pydantic settings and CORS.
* [x] **Database & ORM**: Modeled core entities (`User`, `StudentProfile`, `TeacherProfile`, `Classroom`, `ClassSession`, `SessionParticipant`) and minimal AI/analytics stubs using SQLAlchemy 2.0 with UUIDs, indexes, and timezone-aware timestamps.
* [x] **Alembic Migrations**: Initialized Alembic and successfully executed initial database schema migration to `edusense_db`.
* [x] **Health Check**: Implemented `GET /api/health` returning live service and PostgreSQL DB connection status.
* [x] **Frontend Shell**: Initialized React + Vite + TypeScript frontend shell verifying backend API connectivity.

---
