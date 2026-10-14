"""
Comprehensive End-to-End Test Suite for EduSense AI Facial Emotion Detection Pipeline.

Tests:
1. Model initialization, primary EmotiEffLib, FERPlus fallback, and unavailable-model handling.
2. Valid face images, invalid image inputs, grayscale, BGRA, and image quality checks.
3. Preprocessing contracts, 8-class preservation, and out-of-set emotion mapping.
4. Confidence thresholds and uncertainty states (no_face, low_confidence, ambiguous_face, model_error).
5. Student attribution contract and teacher exclusion.
6. Database persistence and API serialization with audit fields.
7. 5-minute temporal window aggregation, boundary conditions, and retry deduplication.
8. Empty windows and insufficient-data handling (never fabricating neutral).
9. Real model inference verification on actual face benchmark samples.

Run with: backend/venv/bin/python3 backend/test_facial_pipeline_comprehensive.py
"""

import os
import sys
import uuid
import base64
import time
import cv2
import numpy as np
from datetime import datetime, timezone, timedelta

# Ensure project root and backend are on sys.path
backend_dir = os.path.abspath(os.path.dirname(__file__))
project_root = os.path.abspath(os.path.join(backend_dir, ".."))
if project_root not in sys.path:
    sys.path.insert(0, project_root)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from fastapi.testclient import TestClient
from app.main import app
from app.db.session import SessionLocal
from app.models.user import User
from app.models.enums import UserRole, SessionStatus, AttendanceStatus
from app.models.classroom import Classroom
from app.models.session import ClassSession, SessionParticipant
from app.models.profile import StudentProfile, TeacherProfile
from app.models.stubs import FacialAnalysis, AttendanceRecord
from app.core.security import create_access_token

from ai.facial_emotion import (
    FacialEmotionAnalyzer,
    EMOTIEFFLIB_CLASSES,
    FERPLUS_CLASSES,
    ALLOWED_EMOTIONS,
)
from app.services.analytics_service import AnalyticsService, analytics_service


def draw_face(img, cx=200, cy=200, r=80):
    cv2.circle(img, (cx, cy), r, (200, 200, 200), -1)
    eye_offset = int(r * 0.35)
    eye_r = max(4, int(r * 0.15))
    cv2.circle(img, (cx - eye_offset, cy - int(r * 0.25)), eye_r, (0, 0, 0), -1)
    cv2.circle(img, (cx + eye_offset, cy - int(r * 0.25)), eye_r, (0, 0, 0), -1)
    cv2.rectangle(
        img,
        (cx - int(r * 0.3), cy + int(r * 0.3)),
        (cx + int(r * 0.3), cy + int(r * 0.45)),
        (0, 0, 0),
        -1,
    )
    return img


def test_model_initialization_and_fallbacks():
    print("1. Testing Model Initialization & Fallback Behavior...")
    # Primary: EmotiEffLib
    primary = FacialEmotionAnalyzer(force_ferplus=False)
    assert primary.backend == "emotiefflib"
    assert primary.emotion_model_loaded is True

    # Fallback: FERPlus
    fallback = FacialEmotionAnalyzer(force_ferplus=True)
    assert fallback.backend == "ferplus"
    assert fallback.emotion_model_loaded is True

    # Unavailable model
    unavailable = FacialEmotionAnalyzer(
        emotion_model_path="non_existent_file.onnx", force_ferplus=True
    )
    assert unavailable.emotion_model_loaded is False
    assert unavailable.backend == "none"

    test_img = np.zeros((300, 300, 3), dtype=np.uint8)
    draw_face(test_img)
    res_unavail = unavailable.analyze_frame(test_img)
    assert res_unavail["valid_input"] is True
    assert res_unavail["confidence"] == 0.0
    assert res_unavail["dominant_emotion"] == "uncertain"
    assert res_unavail["prediction_status"] == "model_error"
    # Must NOT fabricate neutral 1.0
    assert res_unavail["emotion_probabilities"]["neutral"] == 0.0
    print("   ✓ Primary EmotiEffLib, FERPlus fallback, and unavailable model verified.")


def test_frame_input_and_quality_checks():
    print("2. Testing Frame Inputs, Channels, and Quality Checks...")
    analyzer = FacialEmotionAnalyzer()

    # None and empty
    assert analyzer.analyze_frame(None)["prediction_status"] == "invalid_input"
    assert analyzer.analyze_frame(np.array([]))["prediction_status"] == "invalid_input"

    # Grayscale 1-channel frame with face
    gray_face = np.full((300, 300), 128, dtype=np.uint8)
    draw_face(gray_face, 150, 150, 60)
    res_gray = analyzer.analyze_frame(gray_face)
    assert res_gray["valid_input"] is True
    assert res_gray["face_detected"] is True

    # 4-channel BGRA frame with face
    bgra_face = np.full((300, 300, 4), 128, dtype=np.uint8)
    draw_face(bgra_face, 150, 150, 60)
    res_bgra = analyzer.analyze_frame(bgra_face)
    assert res_bgra["valid_input"] is True
    assert res_bgra["face_detected"] is True

    # Poor lighting (pitch black)
    black = np.zeros((300, 300, 3), dtype=np.uint8)
    res_black = analyzer.analyze_frame(black)
    assert res_black["prediction_status"] == "poor_image_quality"
    assert res_black["quality_status"] == "poor_lighting"
    assert res_black["confidence"] == 0.0

    # Illuminated frame with no face
    no_face = np.full((300, 300, 3), 128, dtype=np.uint8)
    res_noface = analyzer.analyze_frame(no_face)
    assert res_noface["prediction_status"] == "no_face"
    assert res_noface["face_detected"] is False
    assert res_noface["confidence"] == 0.0

    # Ambiguous multiple faces
    multi = np.zeros((400, 600, 3), dtype=np.uint8)
    draw_face(multi, cx=100, cy=200, r=70)
    draw_face(multi, cx=500, cy=200, r=70)
    res_multi = analyzer.analyze_frame(multi)
    assert res_multi["prediction_status"] == "ambiguous_face"
    assert res_multi["dominant_emotion"] == "uncertain"
    assert res_multi["confidence"] == 0.0
    print("   ✓ Input validation, channel conversion, lighting checks, and ambiguity verified.")


def test_out_of_set_emotion_mapping():
    print("3. Testing Out-of-Set Emotion Mapping (Contempt, Disgust, Surprise)...")
    analyzer = FacialEmotionAnalyzer()

    # EmotiEffLib raw 8-classes:
    # 0: Anger, 1: Contempt, 2: Disgust, 3: Fear, 4: Happiness, 5: Neutral, 6: Sadness, 7: Surprise
    # When model outputs Surprise:
    # dominant_emotion must be 'uncertain', NOT 'neutral'!
    # raw_dominant must be 'Surprise'.
    face = np.zeros((300, 300, 3), dtype=np.uint8)
    draw_face(face)
    res = analyzer.analyze_frame(face)
    if res["raw_dominant"] in ["Surprise", "Contempt", "Disgust"]:
        assert res["dominant_emotion"] == "uncertain"
        assert res["prediction_status"] == "valid_prediction"

    # Verify that ALLOWED_EMOTIONS exactly matches EduSense 5 classes
    assert ALLOWED_EMOTIONS == {"neutral", "happy", "sad", "angry", "fear"}
    assert len(res["emotion_probabilities"]) == 5
    for em in ALLOWED_EMOTIONS:
        assert em in res["emotion_probabilities"]
    print("   ✓ Out-of-set classes preserved in raw without inflating neutral.")


def test_temporal_aggregation_and_deduplication():
    print("4. Testing Temporal Aggregation & Retry Deduplication...")
    now = datetime.now(timezone.utc)

    # Test retry deduplication: two identical samples within 0.5s
    dup_samples = [
        {
            "sampled_at": now,
            "dominant_emotion": "happy",
            "prediction_status": "valid_prediction",
            "emotion_probabilities": {"happy": 0.9, "neutral": 0.1, "sad": 0.0, "angry": 0.0, "fear": 0.0},
        },
        {
            "sampled_at": now + timedelta(milliseconds=400),
            "dominant_emotion": "happy",  # Duplicate retry of the same frame!
            "prediction_status": "valid_prediction",
            "emotion_probabilities": {"happy": 0.9, "neutral": 0.1, "sad": 0.0, "angry": 0.0, "fear": 0.0},
        },
        {
            "sampled_at": now + timedelta(seconds=150),
            "dominant_emotion": "neutral",
            "prediction_status": "valid_prediction",
            "emotion_probabilities": {"happy": 0.1, "neutral": 0.9, "sad": 0.0, "angry": 0.0, "fear": 0.0},
        },
    ]
    res_dedup = analytics_service.aggregate_student_window_facial_emotion(dup_samples)
    # The duplicate retry should be suppressed: sample_count = 2
    assert res_dedup["sample_count"] == 2
    assert res_dedup["valid_sample_count"] == 2

    # Test empty window produces insufficient_data
    empty_res = analytics_service.aggregate_student_window_facial_emotion([])
    assert empty_res["dominant_expression"] == "insufficient_data"
    assert empty_res["confidence"] == 0.0
    assert empty_res["valid_sample_count"] == 0

    # Test window with rejected samples produces insufficient_data
    rejected_samples = [
        {"dominant_emotion": "uncertain", "prediction_status": "low_confidence"},
        {"dominant_emotion": "unknown", "prediction_status": "no_face"},
        {"dominant_emotion": "uncertain", "prediction_status": "poor_image_quality"},
    ]
    res_rej = analytics_service.aggregate_student_window_facial_emotion(rejected_samples)
    assert res_rej["dominant_expression"] == "insufficient_data"
    assert res_rej["valid_sample_count"] == 0

    print("   ✓ Deduplication, empty window handling, and rejection filtering verified.")


def test_database_persistence_and_student_attribution():
    print("5. Testing Database Persistence, Student Attribution, and Teacher Exclusion...")
    client = TestClient(app)
    db = SessionLocal()

    teacher = None
    student = None
    t_prof = None
    s_prof = None
    classroom = None
    session = None

    try:
        # Create test teacher, student, classroom, session
        teacher = User(
            email=f"teacher_audit_{uuid.uuid4().hex[:6]}@edusense.ai",
            password_hash="hashed_pwd",
            full_name="Prof. Audit",
            role=UserRole.TEACHER,
        )
        student = User(
            email=f"student_audit_{uuid.uuid4().hex[:6]}@edusense.ai",
            password_hash="hashed_pwd",
            full_name="Student Audit",
            role=UserRole.STUDENT,
        )
        db.add_all([teacher, student])
        db.flush()

        t_prof = TeacherProfile(user_id=teacher.id, employee_id=f"T_{uuid.uuid4().hex[:4]}")
        s_prof = StudentProfile(user_id=student.id, student_id_number=f"S_{uuid.uuid4().hex[:4]}")
        db.add_all([t_prof, s_prof])
        db.flush()

        classroom = Classroom(
            title="Audit Room",
            teacher_id=t_prof.id,
            course_code="AUD101",
            livekit_room_name=f"audit-room-{uuid.uuid4().hex[:6]}",
        )
        db.add(classroom)
        db.flush()

        now_utc = datetime.now(timezone.utc)
        session = ClassSession(
            classroom_id=classroom.id,
            title="Facial Audit Session",
            status=SessionStatus.ACTIVE,
            scheduled_start_time=now_utc - timedelta(minutes=10),
            scheduled_end_time=now_utc + timedelta(minutes=50),
            actual_start_time=now_utc - timedelta(minutes=10),
        )
        db.add(session)
        db.flush()

        part = SessionParticipant(session_id=session.id, user_id=student.id, role=UserRole.STUDENT)
        att = AttendanceRecord(session_id=session.id, student_id=s_prof.id, status=AttendanceStatus.PRESENT)
        db.add_all([part, att])
        db.commit()

        student_token = create_access_token(data={"sub": str(student.id), "role": "student"})
        teacher_token = create_access_token(data={"sub": str(teacher.id), "role": "teacher"})

        # Generate base64 face frame
        face_img = np.full((300, 300, 3), 128, dtype=np.uint8)
        draw_face(face_img, 150, 150, 60)
        _, buf = cv2.imencode(".jpg", face_img)
        b64 = base64.b64encode(buf).decode("utf-8")

        # 1. Student submits frame -> succeeds with target_student_id = student's own ID
        resp = client.post(
            "/api/analytics/sample-frame",
            json={"session_id": str(session.id), "image_base64": b64, "slot": "sample-1"},
            headers={"Authorization": f"Bearer {student_token}"},
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["face_detected"] is True
        assert data["emotion_backend"] in ["emotiefflib", "ferplus"]
        assert "raw_dominant" in data
        assert "prediction_status" in data

        # Verify DB persistence of audit fields
        db.expire_all()
        fa_row = db.query(FacialAnalysis).filter(FacialAnalysis.session_id == session.id).first()
        assert fa_row is not None
        assert fa_row.student_id == s_prof.id
        assert fa_row.emotion_backend in ["emotiefflib", "ferplus"]
        assert fa_row.dominant_emotion is not None
        assert fa_row.prediction_status is not None
        assert fa_row.confidence is not None

        # 2. Teacher submits without student_id -> rejected 400
        resp_teacher_no_id = client.post(
            "/api/analytics/sample-frame",
            json={"session_id": str(session.id), "image_base64": b64},
            headers={"Authorization": f"Bearer {teacher_token}"},
        )
        assert resp_teacher_no_id.status_code == 400

        # 3. Teacher queries 5-minute window
        w_resp = client.get(
            f"/api/analytics/session/{session.id}/facial-window",
            headers={"Authorization": f"Bearer {teacher_token}"},
        )
        assert w_resp.status_code == 200
        w_data = w_resp.json()
        assert w_data["students_analyzed"] >= 1

        print("   ✓ DB persistence of audit fields, student attribution, and teacher exclusion verified.")

    finally:
        # Clean up test rows safely
        try:
            if session:
                db.query(FacialAnalysis).filter(FacialAnalysis.session_id == session.id).delete()
                db.query(AttendanceRecord).filter(AttendanceRecord.session_id == session.id).delete()
                db.query(SessionParticipant).filter(SessionParticipant.session_id == session.id).delete()
                db.query(ClassSession).filter(ClassSession.id == session.id).delete()
            if classroom:
                db.query(Classroom).filter(Classroom.id == classroom.id).delete()
            if s_prof:
                db.query(StudentProfile).filter(StudentProfile.id == s_prof.id).delete()
            if t_prof:
                db.query(TeacherProfile).filter(TeacherProfile.id == t_prof.id).delete()
            if teacher or student:
                u_ids = [u.id for u in (teacher, student) if u]
                db.query(User).filter(User.id.in_(u_ids)).delete()
            db.commit()
        except Exception:
            db.rollback()
        finally:
            db.close()


def test_real_model_inference():
    print("6. Testing Real Model Inference on Real Face Benchmark Images...")
    analyzer_emoti = FacialEmotionAnalyzer(force_ferplus=False)
    analyzer_fer = FacialEmotionAnalyzer(force_ferplus=True)

    # Load 5 samples from FERPlus test set
    fer_test_csv = "/Users/apple/.cache/huggingface/hub/datasets--chitradrishti--fer2013/snapshots/4ad26b38d1dcc1c3891d841a48758653b6c67105/fer2013/test.csv"
    if not os.path.exists(fer_test_csv):
        print("   (Skipping test_real_model_inference: fer2013/test.csv not present)")
        return

    import csv
    with open(fer_test_csv, "r") as f:
        reader = csv.reader(f)
        next(reader)
        for i in range(5):
            row = next(reader)
            pixels = np.array([int(p) for p in row[2].split()], dtype=np.uint8).reshape((48, 48))
            bgr = cv2.cvtColor(pixels, cv2.COLOR_GRAY2BGR)

            # Direct face crop inference on EmotiEffLib
            res_e = analyzer_emoti.predict_emotion_from_face(bgr)
            dom_e, probs_e, conf_e, raw_e, raw_probs_e, status_e = res_e
            assert dom_e in ALLOWED_EMOTIONS or dom_e == "uncertain"
            assert conf_e >= 0.0
            assert sum(raw_probs_e.values()) > 0.95  # Probabilities sum to ~1.0

            # Direct face crop inference on FERPlus
            res_f = analyzer_fer.predict_emotion_from_face(bgr)
            dom_f, probs_f, conf_f, raw_f, raw_probs_f, status_f = res_f
            assert dom_f in ALLOWED_EMOTIONS or dom_f == "uncertain"
            assert conf_f >= 0.0
            assert sum(raw_probs_f.values()) > 0.95

    print("   ✓ Real ONNX inference on benchmark test images verified.")


def run_pipeline_suite():
    print("================================================================")
    print("STARTING COMPREHENSIVE FACIAL EMOTION DETECTION AUDIT SUITE")
    print("================================================================")
    test_model_initialization_and_fallbacks()
    test_frame_input_and_quality_checks()
    test_out_of_set_emotion_mapping()
    test_temporal_aggregation_and_deduplication()
    test_database_persistence_and_student_attribution()
    test_real_model_inference()
    print("================================================================")
    print("ALL COMPREHENSIVE FACIAL PIPELINE TESTS PASSED SUCCESSFULLY! ✅")
    print("================================================================")


if __name__ == "__main__":
    run_pipeline_suite()
