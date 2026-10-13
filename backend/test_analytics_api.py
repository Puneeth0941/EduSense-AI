"""
EduSense AI — Day 2 Engagement Analytics API Integration Test Suite.
Tests API authentication, authorization, payload validation, database persistence,
and session report generation.
Run with: python3 backend/test_analytics_api.py
"""

import os
import sys
import uuid
import base64
import cv2
import numpy as np
from datetime import datetime, timezone
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__))))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app
from app.db.session import SessionLocal
from app.models.user import User
from app.models.enums import UserRole, SessionStatus, AttendanceStatus
from app.models.classroom import Classroom
from app.models.session import ClassSession
from app.models.profile import StudentProfile, TeacherProfile
from app.models.stubs import (
    FacialAnalysis,
    SentimentAnalysis,
    DistractionEvent,
    EngagementMetric,
    ClassReport,
    AttendanceRecord,
)
from app.core.security import create_access_token


def generate_synthetic_image_b64() -> str:
    """Generates a synthetic base64 JPEG image."""
    img = np.full((300, 300, 3), 150, dtype=np.uint8)
    cv2.circle(img, (150, 150), 60, (200, 200, 200), -1)
    _, buffer = cv2.imencode('.jpg', img)
    return base64.b64encode(buffer).decode('utf-8')


def run_analytics_api_tests():
    print("==================================================")
    print("STARTING DAY 2 ENGAGEMENT ANALYTICS API TEST SUITE")
    print("==================================================")

    client = TestClient(app)
    db = SessionLocal()

    try:
        # 1. Setup Test Teacher & Classroom & Active Session
        teacher_email = f"teacher_analytics_{uuid.uuid4().hex[:6]}@edusense.ai"
        teacher_user = User(
            email=teacher_email,
            password_hash="hashed_pwd",
            full_name="Dr. Analytics Teacher",
            role=UserRole.TEACHER,
            is_active=True,
        )
        db.add(teacher_user)
        db.commit()
        db.refresh(teacher_user)

        teacher_profile = TeacherProfile(
            user_id=teacher_user.id,
            employee_id=f"EMP_{uuid.uuid4().hex[:6]}",
            department="Computer Science",
        )
        db.add(teacher_profile)
        db.commit()
        db.refresh(teacher_profile)

        classroom = Classroom(
            title="AI & Data Science 101",
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
            title="Lecture on Neural Engagement",
            status=SessionStatus.ACTIVE,
            scheduled_start_time=now,
            scheduled_end_time=now,
            actual_start_time=now,
        )
        db.add(session)
        db.commit()
        db.refresh(session)

        # 2. Setup Test Student A & Student B
        student_a_email = f"student_a_{uuid.uuid4().hex[:6]}@edusense.ai"
        student_a_user = User(
            email=student_a_email,
            password_hash="pwd",
            full_name="Student Alice",
            role=UserRole.STUDENT,
            is_active=True,
        )
        db.add(student_a_user)
        db.commit()
        db.refresh(student_a_user)

        student_a_profile = StudentProfile(
            user_id=student_a_user.id,
            student_id_number=f"STU_{uuid.uuid4().hex[:6]}",
        )
        db.add(student_a_profile)
        db.commit()
        db.refresh(student_a_profile)

        # Student A Attendance Record
        att_a = AttendanceRecord(
            session_id=session.id,
            student_id=student_a_profile.id,
            status=AttendanceStatus.PRESENT,
        )
        db.add(att_a)

        student_b_email = f"student_b_{uuid.uuid4().hex[:6]}@edusense.ai"
        student_b_user = User(
            email=student_b_email,
            password_hash="pwd",
            full_name="Student Bob",
            role=UserRole.STUDENT,
            is_active=True,
        )
        db.add(student_b_user)
        db.commit()
        db.refresh(student_b_user)

        student_b_profile = StudentProfile(
            user_id=student_b_user.id,
            student_id_number=f"STU_{uuid.uuid4().hex[:6]}",
        )
        db.add(student_b_profile)
        db.commit()

        # 3. Setup Teacher 2 (Other teacher) & Classroom 2
        teacher2_email = f"teacher2_analytics_{uuid.uuid4().hex[:6]}@edusense.ai"
        teacher2_user = User(
            email=teacher2_email,
            password_hash="hashed_pwd",
            full_name="Dr. Other Teacher",
            role=UserRole.TEACHER,
            is_active=True,
        )
        db.add(teacher2_user)
        db.commit()
        db.refresh(teacher2_user)

        teacher2_profile = TeacherProfile(
            user_id=teacher2_user.id,
            employee_id=f"EMP_{uuid.uuid4().hex[:6]}",
            department="Physics",
        )
        db.add(teacher2_profile)
        db.commit()

        # Auth Tokens
        teacher_token = create_access_token(data={"sub": str(teacher_user.id)})
        teacher2_token = create_access_token(data={"sub": str(teacher2_user.id)})
        student_a_token = create_access_token(data={"sub": str(student_a_user.id)})
        student_b_token = create_access_token(data={"sub": str(student_b_user.id)})

        teacher_headers = {"Authorization": f"Bearer {teacher_token}"}
        teacher2_headers = {"Authorization": f"Bearer {teacher2_token}"}
        student_a_headers = {"Authorization": f"Bearer {student_a_token}"}
        student_b_headers = {"Authorization": f"Bearer {student_b_token}"}

        print("✓ Test database fixtures & JWT tokens initialized.")

        # --- TEST 1: Unauthorized Access ---
        res_unauth = client.post("/api/analytics/sample-frame", json={})
        assert res_unauth.status_code == 401
        print("✓ TEST 1 PASSED: Unauthenticated request rejected with 401.")

        # --- TEST 2: Student Frame Sampling & Persistence ---
        img_b64 = generate_synthetic_image_b64()
        frame_payload = {
            "session_id": str(session.id),
            "image_base64": img_b64,
        }
        res_frame = client.post("/api/analytics/sample-frame", json=frame_payload, headers=student_a_headers)
        if res_frame.status_code != 200:
            print(f"DEBUG res_frame failed: {res_frame.status_code} - {res_frame.text}")
        assert res_frame.status_code == 200

        frame_data = res_frame.json()
        assert "attentiveness_score" in frame_data
        assert "dominant_emotion" in frame_data
        assert frame_data["emotion_model_loaded"] is True

        # Verify PostgreSQL DB record
        fa_db = db.query(FacialAnalysis).filter_by(session_id=session.id, student_id=student_a_profile.id).first()
        assert fa_db is not None
        assert fa_db.dominant_emotion is not None
        print("✓ TEST 2 PASSED: Frame sample processed and persisted in PostgreSQL.")

        # --- TEST 3: Text Sentiment Analysis & Intent ---
        sent_payload = {
            "session_id": str(session.id),
            "text": "Could you please re-explain matrix multiplication? I am confused!",
        }
        res_sent = client.post("/api/analytics/sentiment", json=sent_payload, headers=student_a_headers)
        assert res_sent.status_code == 200
        sent_data = res_sent.json()
        assert sent_data["is_question"] is True
        assert sent_data["is_confusion"] is True
        assert sent_data["sentiment_label"] == "confused"

        # Verify DB Persistence
        sa_db = db.query(SentimentAnalysis).filter_by(session_id=session.id, user_id=student_a_user.id).first()
        assert sa_db is not None
        assert sa_db.sentiment_label == "confused"
        print("✓ TEST 3 PASSED: Text sentiment & intent analysis processed and persisted.")

        # --- TEST 4: Student Summary Retrieval & Authorization ---
        # Student A requesting Student A summary -> 200 OK
        res_sum_a = client.get(
            f"/api/analytics/session/{session.id}/student/{student_a_profile.id}",
            headers=student_a_headers
        )
        assert res_sum_a.status_code == 200
        sum_a_data = res_sum_a.json()
        assert sum_a_data["student_id"] == str(student_a_profile.id)
        assert sum_a_data["composite_score"] is not None
        assert sum_a_data["question_count"] >= 1

        # Student B attempting to view Student A summary -> 403 Forbidden
        res_forbidden = client.get(
            f"/api/analytics/session/{session.id}/student/{student_a_profile.id}",
            headers=student_b_headers
        )
        assert res_forbidden.status_code == 403

        # Student B (not enrolled/participant in session) attempting to view Student B summary in session 1 -> 403 Forbidden
        res_not_enrolled = client.get(
            f"/api/analytics/session/{session.id}/student/{student_b_profile.id}",
            headers=student_b_headers
        )
        assert res_not_enrolled.status_code == 403
        print("✓ TEST 4 PASSED: Student engagement summary retrieved with strict 403 authorization.")

        # --- TEST 5: Session Overview & Teacher Authorization ---
        # Teacher 1 (owner) accessing overview -> 200 OK
        res_overview = client.get(
            f"/api/analytics/session/{session.id}/overview",
            headers=teacher_headers
        )
        assert res_overview.status_code == 200
        overview_data = res_overview.json()
        assert overview_data["session_id"] == str(session.id)
        assert "attendance_rate" in overview_data
        assert "average_engagement" in overview_data

        # Teacher 2 (other teacher) accessing session 1 overview -> 403 Forbidden
        res_other_teacher = client.get(
            f"/api/analytics/session/{session.id}/overview",
            headers=teacher2_headers
        )
        assert res_other_teacher.status_code == 403

        # Student A calling session overview -> 403 Forbidden
        res_student_overview = client.get(
            f"/api/analytics/session/{session.id}/overview",
            headers=student_a_headers
        )
        assert res_student_overview.status_code == 403

        # --- TEST 6: 5-Minute Window Facial Analytics Authorization (TEST 9 & 10) ---
        # Teacher 1 (owner) accessing classroom 5-minute facial window -> 200 OK
        res_fac_win = client.get(
            f"/api/analytics/session/{session.id}/facial-window",
            headers=teacher_headers
        )
        assert res_fac_win.status_code == 200
        fac_win_data = res_fac_win.json()
        assert "dominant_expression" in fac_win_data
        assert "expression_distribution" in fac_win_data

        # TEST 10: Teacher 2 (other teacher) accessing classroom 5-minute facial window -> 403 Forbidden
        res_fac_win_t2 = client.get(
            f"/api/analytics/session/{session.id}/facial-window",
            headers=teacher2_headers
        )
        assert res_fac_win_t2.status_code == 403

        # Student A accessing own 5-minute facial window -> 200 OK
        res_stu_win_a = client.get(
            f"/api/analytics/session/{session.id}/student/{student_a_profile.id}/facial-window",
            headers=student_a_headers
        )
        assert res_stu_win_a.status_code == 200
        assert res_stu_win_a.json()["student_id"] == str(student_a_profile.id)

        # TEST 9: Student B attempting to access Student A's 5-minute facial window -> 403 Forbidden
        res_stu_win_b = client.get(
            f"/api/analytics/session/{session.id}/student/{student_a_profile.id}/facial-window",
            headers=student_b_headers
        )
        assert res_stu_win_b.status_code == 403

        # Verify ClassReport record in DB
        report_db = db.query(ClassReport).filter_by(session_id=session.id).first()
        assert report_db is not None
        assert report_db.average_engagement is not None
        print("✓ TEST 5 PASSED: Session overview authorization & report generation verified.")

        print("==================================================")
        print("ALL ENGAGEMENT ANALYTICS PRIVACY & API TESTS PASSED! ✅")
        print("==================================================")

    finally:
        try:
            if 'session' in locals() and session:
                db.query(FacialAnalysis).filter_by(session_id=session.id).delete()
                db.query(SentimentAnalysis).filter_by(session_id=session.id).delete()
                db.query(ClassReport).filter_by(session_id=session.id).delete()
                db.query(ClassSession).filter_by(id=session.id).delete()
            if 'classroom' in locals() and classroom:
                db.query(Classroom).filter_by(id=classroom.id).delete()
            if 'teacher_user' in locals() and teacher_user:
                db.query(User).filter_by(id=teacher_user.id).delete()
            if 'teacher2_user' in locals() and teacher2_user:
                db.query(User).filter_by(id=teacher2_user.id).delete()
            if 'student_a_user' in locals() and student_a_user:
                db.query(User).filter_by(id=student_a_user.id).delete()
            if 'student_b_user' in locals() and student_b_user:
                db.query(User).filter_by(id=student_b_user.id).delete()
            db.commit()
        except Exception:
            db.rollback()
        finally:
            db.close()


if __name__ == "__main__":
    run_analytics_api_tests()
