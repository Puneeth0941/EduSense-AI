"""
Integration Test Suite for EduSense AI Whisper Transcription API.
Tests endpoints:
- GET /api/transcription/languages
- POST /api/transcription/audio
- POST /api/transcription/snippet
- GET /api/transcription/session/{session_id}/history

Run with: python3 backend/test_transcription_api.py
"""

import os
import sys
import io
import wave
import base64
import uuid
import numpy as np
from datetime import datetime, timezone
from fastapi.testclient import TestClient

# Ensure project root and backend modules are on sys.path
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
backend_dir = os.path.abspath(os.path.dirname(__file__))
if project_root not in sys.path:
    sys.path.insert(0, project_root)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.main import app
from app.db.session import SessionLocal
from app.models.user import User
from app.models.classroom import Classroom
from app.models.session import ClassSession, SessionParticipant
from app.models.profile import StudentProfile, TeacherProfile
from app.models.enums import UserRole, SessionStatus
from app.models.stubs import SpeechAnalysis
from app.core.security import create_access_token


def generate_synthetic_wav(duration_sec: float = 1.0, freq_hz: float = 440.0, sample_rate: int = 16000) -> bytes:
    """Generates a synthetic PCM 16-bit mono WAV buffer."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        n_samples = int(duration_sec * sample_rate)
        t = np.linspace(0, duration_sec, n_samples, endpoint=False)
        samples = (np.sin(2 * np.pi * freq_hz * t) * 12000).astype(np.int16)
        wav.writeframes(samples.tobytes())
    buf.seek(0)
    return buf.read()


def run_transcription_api_tests():
    print("==================================================")
    print("STARTING WHISPER TRANSCRIPTION API TEST SUITE")
    print("==================================================")

    client = TestClient(app)
    db = SessionLocal()

    try:
        # Setup Test Users
        teacher = User(
            email=f"teacher_speech_{uuid.uuid4().hex[:6]}@edusense.ai",
            password_hash="hashed_pw",
            full_name="Prof. Audio Teacher",
            role=UserRole.TEACHER,
            is_active=True,
        )
        db.add(teacher)
        db.commit()
        db.refresh(teacher)

        teacher_profile = TeacherProfile(
            user_id=teacher.id,
            employee_id=f"EMP_{uuid.uuid4().hex[:6]}",
            department="Computer Science",
        )
        db.add(teacher_profile)
        db.commit()
        db.refresh(teacher_profile)

        student = User(
            email=f"student_speech_{uuid.uuid4().hex[:6]}@edusense.ai",
            password_hash="hashed_pw",
            full_name="Student Speaker",
            role=UserRole.STUDENT,
            is_active=True,
        )
        db.add(student)
        db.commit()
        db.refresh(student)

        student_profile = StudentProfile(
            user_id=student.id,
            student_id_number=f"STU_{uuid.uuid4().hex[:6]}",
            department="Computer Science",
            enrollment_year=2026,
        )
        db.add(student_profile)
        db.commit()
        db.refresh(student_profile)

        classroom = Classroom(
            title="Speech Processing & AI",
            course_code=f"CS_{uuid.uuid4().hex[:4]}",
            teacher_id=teacher_profile.id,
            livekit_room_name=f"room_{uuid.uuid4().hex[:6]}",
            is_active=True,
        )
        db.add(classroom)
        db.commit()
        db.refresh(classroom)

        now = datetime.now(timezone.utc)
        session = ClassSession(
            classroom_id=classroom.id,
            title="Lecture on Speech-to-Text",
            status=SessionStatus.ACTIVE,
            scheduled_start_time=now,
            scheduled_end_time=now,
            actual_start_time=now,
        )
        db.add(session)
        db.commit()
        db.refresh(session)

        # Student participant record
        student_participant = SessionParticipant(
            session_id=session.id,
            user_id=student.id,
            role=UserRole.STUDENT,
        )
        db.add(student_participant)
        db.commit()

        teacher_token = create_access_token({"sub": str(teacher.id)})
        student_token = create_access_token({"sub": str(student.id)})
        teacher_headers = {"Authorization": f"Bearer {teacher_token}"}
        student_headers = {"Authorization": f"Bearer {student_token}"}

        # 1. TEST /languages endpoint
        resp_lang = client.get("/api/transcription/languages")
        assert resp_lang.status_code == 200
        langs = resp_lang.json()
        assert any(l["code"] == "en" for l in langs)
        assert any(l["code"] == "kn" for l in langs)
        print("✓ TEST 1 PASSED: Languages endpoint verified.")

        # 2. TEST /audio endpoint (UploadFile)
        wav_data = generate_synthetic_wav(duration_sec=1.0)
        files = {"file": ("test.wav", io.BytesIO(wav_data), "audio/wav")}
        data = {
            "session_id": str(session.id),
            "language": "en",
            "analyze_sentiment": "true",
        }
        resp_audio = client.post(
            "/api/transcription/audio",
            headers=student_headers,
            files=files,
            data=data,
        )
        assert resp_audio.status_code == 200, f"Failed audio upload: {resp_audio.text}"
        res_json = resp_audio.json()
        assert res_json["valid_input"] is True
        assert res_json["duration_seconds"] >= 0.9
        print("✓ TEST 2 PASSED: Audio upload endpoint verified.")

        # 3. TEST /snippet endpoint (Base64)
        b64_audio = base64.b64encode(wav_data).decode("utf-8")
        snippet_payload = {
            "session_id": str(session.id),
            "audio_base64": f"data:audio/wav;base64,{b64_audio}",
            "language": "kn",
            "analyze_sentiment": True,
        }
        resp_snippet = client.post(
            "/api/transcription/snippet",
            headers=student_headers,
            json=snippet_payload,
        )
        assert resp_snippet.status_code == 200, f"Failed snippet: {resp_snippet.text}"
        snip_json = resp_snippet.json()
        assert snip_json["valid_input"] is True
        assert snip_json["language"] == "kn"
        print("✓ TEST 3 PASSED: Base64 audio snippet endpoint verified with Kannada flag.")

        # 4. TEST /session/{session_id}/history
        resp_history = client.get(
            f"/api/transcription/session/{session.id}/history",
            headers=teacher_headers,
        )
        assert resp_history.status_code == 200
        assert isinstance(resp_history.json(), list)
        print("✓ TEST 4 PASSED: Session transcript history endpoint verified.")

        # 5. TEST Unauthorized session access
        outsider = User(
            email=f"outsider_{uuid.uuid4().hex[:6]}@edusense.ai",
            password_hash="hashed_pw",
            full_name="Outsider Student",
            role=UserRole.STUDENT,
            is_active=True,
        )
        db.add(outsider)
        db.commit()
        db.refresh(outsider)
        outsider_profile = StudentProfile(
            user_id=outsider.id,
            student_id_number=f"OUT_{uuid.uuid4().hex[:6]}",
            department="Physics",
            enrollment_year=2026,
        )
        db.add(outsider_profile)
        db.commit()
        outsider_token = create_access_token({"sub": str(outsider.id)})

        files = {"file": ("test.wav", io.BytesIO(wav_data), "audio/wav")}
        resp_forbidden = client.post(
            "/api/transcription/audio",
            headers={"Authorization": f"Bearer {outsider_token}"},
            files=files,
            data={"session_id": str(session.id)},
        )
        assert resp_forbidden.status_code == 403
        print("✓ TEST 5 PASSED: Session authorization isolation verified.")

        print("==================================================")
        print("ALL WHISPER TRANSCRIPTION API TESTS PASSED! ✅")
        print("==================================================")

    finally:
        # Cleanup
        try:
            db.query(SpeechAnalysis).filter(SpeechAnalysis.session_id == session.id).delete()
            db.query(SessionParticipant).filter(SessionParticipant.session_id == session.id).delete()
            db.query(ClassSession).filter(ClassSession.id == session.id).delete()
            db.query(Classroom).filter(Classroom.id == classroom.id).delete()
            db.query(StudentProfile).filter(StudentProfile.id.in_([student_profile.id, outsider_profile.id])).delete()
            db.query(TeacherProfile).filter(TeacherProfile.id == teacher_profile.id).delete()
            db.query(User).filter(User.id.in_([teacher.id, student.id, outsider.id])).delete()
            db.commit()
        except Exception:
            db.rollback()
        db.close()


if __name__ == "__main__":
    run_transcription_api_tests()
