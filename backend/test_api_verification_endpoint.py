import os
import sys
import uuid
import base64
import cv2
import numpy as np
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__))))

from app.main import app
from app.db.session import SessionLocal
from app.models.user import User
from app.models.enums import UserRole, SessionStatus, AttendanceStatus
from app.models.classroom import Classroom
from app.models.session import ClassSession, SessionParticipant
from app.models.profile import StudentProfile, TeacherProfile
from app.models.stubs import FaceEmbedding, AttendanceRecord
from app.core.security import create_access_token
from app.services.face_service import FaceService

def generate_test_face_image() -> str:
    """Generates a synthetic 640x480 BGR image with a clear face-like structure."""
    img = np.full((480, 640, 3), 200, dtype=np.uint8)
    cv2.ellipse(img, (320, 240), (100, 140), 0, 0, 360, (180, 150, 130), -1)
    cv2.circle(img, (280, 200), 15, (50, 50, 50), -1)
    cv2.circle(img, (360, 200), 15, (50, 50, 50), -1)
    cv2.ellipse(img, (320, 270), (45, 15), 0, 0, 180, (50, 50, 50), 3)
    _, buffer = cv2.imencode('.jpg', img)
    return base64.b64encode(buffer).decode('utf-8')

def run_tests():
    print("==================================================")
    print("STARTING PHASE 3B ATTENDANCE BACKEND VERIFICATION TESTS")
    print("==================================================")
    
    client = TestClient(app)
    db = SessionLocal()

    try:
        # 1. Setup Test Student User
        test_email = f"student_test_{uuid.uuid4().hex[:6]}@edusense.ai"
        student_user = User(
            email=test_email,
            password_hash="hashed_pwd_stub",
            full_name="Test Student Phase3B",
            role=UserRole.STUDENT,
            is_active=True,
        )
        db.add(student_user)
        db.commit()
        db.refresh(student_user)

        student_profile = StudentProfile(
            user_id=student_user.id,
            student_id_number=f"STU_{uuid.uuid4().hex[:6]}",
        )
        db.add(student_profile)
        db.commit()
        db.refresh(student_profile)

        # 2. Setup Test Session & Participation
        # Create teacher profile for classroom constraint
        teacher_user = User(
            email=f"teacher_{uuid.uuid4().hex[:6]}@edusense.ai",
            password_hash="pwd",
            full_name="Test Teacher",
            role=UserRole.TEACHER,
        )
        db.add(teacher_user)
        db.commit()
        teacher_profile = TeacherProfile(
            user_id=teacher_user.id,
            employee_id=f"EMP_{uuid.uuid4().hex[:6]}",
        )
        db.add(teacher_profile)
        db.commit()

        classroom = Classroom(
            title="Computer Science 101",
            course_code=f"CS{uuid.uuid4().hex[:4]}",
            teacher_id=teacher_profile.id,
            livekit_room_name=f"room_{uuid.uuid4().hex[:6]}",
        )
        db.add(classroom)
        db.commit()
        db.refresh(classroom)

        session_obj = ClassSession(
            classroom_id=classroom.id,
            title="Phase 3B Verification Session",
            status=SessionStatus.ACTIVE,
            scheduled_start_time=datetime.now(timezone.utc),
            scheduled_end_time=datetime.now(timezone.utc) + timedelta(hours=1),
            actual_start_time=datetime.now(timezone.utc),
        )
        db.add(session_obj)
        db.commit()
        db.refresh(session_obj)

        participant = SessionParticipant(
            session_id=session_obj.id,
            user_id=student_user.id,
            role=UserRole.STUDENT,
        )
        db.add(participant)
        db.commit()

        # 3. Create Face Enrollment
        # Generate dummy 512D ArcFace embedding vector
        dummy_vec = [float(x) for x in (np.ones(512, dtype=np.float32) / np.sqrt(512))]
        face_record = FaceEmbedding(
            student_id=student_profile.id,
            embedding_dim=512,
            embedding_data={
                "mean_embedding": dummy_vec,
                "sample_embeddings": [dummy_vec, dummy_vec],
            },
        )
        db.add(face_record)
        db.commit()

        # Create auth token
        token = create_access_token(data={"sub": str(student_user.id), "role": student_user.role.value})
        headers = {"Authorization": f"Bearer {token}"}

        image_b64 = generate_test_face_image()

        # 4. TEST EDGE CASE: INVALID/EXPIRED AUTH
        print("\n--- Test 1: Invalid/Expired Auth Token ---")
        res = client.post(
            "/api/attendance/verify",
            json={"session_id": str(session_obj.id), "image_base64": image_b64},
            headers={"Authorization": "Bearer invalid_token_123"},
        )
        print(f"Status Code: {res.status_code}")
        assert res.status_code == 401, f"Expected 401, got {res.status_code}"
        print("PASS: 401 Unauthorized returned correctly.")

        # 5. TEST EDGE CASE: NO FACE IN FRAME
        print("\n--- Test 2: Frame with No Face Detected ---")
        # Empty dark frame
        empty_img = np.zeros((480, 640, 3), dtype=np.uint8)
        _, buffer = cv2.imencode('.jpg', empty_img)
        empty_b64 = base64.b64encode(buffer).decode('utf-8')
        
        res = client.post(
            "/api/attendance/verify",
            json={"session_id": str(session_obj.id), "image_base64": empty_b64},
            headers=headers,
        )
        print(f"Status Code: {res.status_code}, Payload: {res.json()}")
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        data = res.json()
        assert data["verified"] is False
        assert data["reason"] == "FACE_NOT_DETECTED"
        print("PASS: No face detection correctly handled with HTTP 200.")

        # 6. TEST EDGE CASE: STUDENT NOT ENROLLED
        print("\n--- Test 3: Unenrolled Student ---")
        unenrolled_user = User(
            email=f"unenrolled_{uuid.uuid4().hex[:6]}@edusense.ai",
            password_hash="pwd",
            full_name="Unenrolled Student",
            role=UserRole.STUDENT,
        )
        db.add(unenrolled_user)
        db.commit()
        un_sp = StudentProfile(user_id=unenrolled_user.id, student_id_number=f"UN_{uuid.uuid4().hex[:6]}")
        db.add(un_sp)
        db.commit()
        un_part = SessionParticipant(session_id=session_obj.id, user_id=unenrolled_user.id, role=UserRole.STUDENT)
        db.add(un_part)
        db.commit()

        un_token = create_access_token(data={"sub": str(unenrolled_user.id), "role": unenrolled_user.role.value})
        res = client.post(
            "/api/attendance/verify",
            json={"session_id": str(session_obj.id), "image_base64": image_b64},
            headers={"Authorization": f"Bearer {un_token}"},
        )
        print(f"Status Code: {res.status_code}, Payload: {res.json()}")
        assert res.status_code == 200
        assert res.json()["reason"] == "NOT_ENROLLED"
        print("PASS: Unenrolled student correctly returned NOT_ENROLLED.")

        # 7. TEST TEMPORAL CONFIRMATION (SAMPLE 1, 2, 3)
        print("\n--- Test 4: Temporal Confirmation Flow (Samples 1/3, 2/3, 3/3) ---")

        # Mock FaceService match to return True for our test frame
        orig_process = FaceService.process_attendance_frame
        def mock_process(self, base64_img, enrolled_data):
            return {
                "matched": True,
                "reason": "MATCH_SUCCESS",
                "similarity": 0.92,
                "message": "Face match verified.",
                "image_width": 640,
                "image_height": 480,
                "num_faces": 1,
                "quality_pass": True,
                "embedding_generated": True,
            }
        FaceService.process_attendance_frame = mock_process

        # Sample 1/3
        res1 = client.post(
            "/api/attendance/verify",
            json={"session_id": str(session_obj.id), "image_base64": image_b64},
            headers=headers,
        )
        print(f"Sample 1 Response: {res1.status_code} -> {res1.json()}")
        assert res1.status_code == 200
        d1 = res1.json()
        assert d1["verified"] is False
        assert d1["samples_confirmed"] == 1
        assert d1["attendance_status"] == "UNVERIFIED"
        assert d1["reason"] == "PENDING_TEMPORAL"

        # Sample 2/3
        res2 = client.post(
            "/api/attendance/verify",
            json={"session_id": str(session_obj.id), "image_base64": image_b64},
            headers=headers,
        )
        print(f"Sample 2 Response: {res2.status_code} -> {res2.json()}")
        assert res2.status_code == 200
        d2 = res2.json()
        assert d2["verified"] is False
        assert d2["samples_confirmed"] == 2
        assert d2["attendance_status"] == "UNVERIFIED"

        # Sample 3/3 -> Should transition to PRESENT!
        res3 = client.post(
            "/api/attendance/verify",
            json={"session_id": str(session_obj.id), "image_base64": image_b64},
            headers=headers,
        )
        print(f"Sample 3 Response: {res3.status_code} -> {res3.json()}")
        assert res3.status_code == 200
        d3 = res3.json()
        assert d3["verified"] is True
        assert d3["samples_confirmed"] == 3
        assert d3["attendance_status"] == "PRESENT"
        assert d3["reason"] == "CONFIRMED"
        print("PASS: 3/3 samples achieved and status changed to PRESENT!")

        # 8. TEST DUPLICATE PREVENTION & REPEATED VERIFICATION
        print("\n--- Test 5: Repeated Verification (Sample 4) ---")
        res4 = client.post(
            "/api/attendance/verify",
            json={"session_id": str(session_obj.id), "image_base64": image_b64},
            headers=headers,
        )
        print(f"Sample 4 Response: {res4.status_code} -> {res4.json()}")
        assert res4.status_code == 200
        d4 = res4.json()
        assert d4["verified"] is True
        assert d4["samples_confirmed"] == 4
        assert d4["attendance_status"] == "PRESENT"

        # 9. VERIFY POSTGRESQL RECORD COUNT
        print("\n--- Test 6: Verify Single PostgreSQL Attendance Record ---")
        db.expire_all()
        records = db.query(AttendanceRecord).filter(
            AttendanceRecord.session_id == session_obj.id,
            AttendanceRecord.student_id == student_profile.id,
        ).all()
        print(f"Attendance records found in PostgreSQL: {len(records)}")
        assert len(records) == 1, f"Expected exactly 1 attendance record, found {len(records)}"
        rec = records[0]
        status_val = rec.status.value if hasattr(rec.status, 'value') else str(rec.status)
        print(f"Record details: ID={rec.id}, Status={status_val}, VerificationCount={rec.verification_count}")
        assert status_val == "PRESENT"
        assert rec.verification_count == 4
        print("PASS: Exactly ONE record exists in PostgreSQL with status PRESENT.")

        # Restore original process function
        FaceService.process_attendance_frame = orig_process

        print("\n==================================================")
        print("ALL BACKEND ATTENDANCE TESTS PASSED SUCCESSFULLY!")
        print("==================================================")

    finally:
        try:
            if 'session_obj' in locals() and session_obj and session_obj.id:
                db.query(AttendanceRecord).filter(AttendanceRecord.session_id == session_obj.id).delete()
                db.query(SessionParticipant).filter(SessionParticipant.session_id == session_obj.id).delete()
                db.query(ClassSession).filter(ClassSession.id == session_obj.id).delete()
            if 'classroom' in locals() and classroom and classroom.id:
                db.query(Classroom).filter(Classroom.id == classroom.id).delete()
            if 'student_profile' in locals() and student_profile and student_profile.id:
                db.query(FaceEmbedding).filter(FaceEmbedding.student_id == student_profile.id).delete()
                db.query(StudentProfile).filter(StudentProfile.id == student_profile.id).delete()
            if 'teacher_profile' in locals() and teacher_profile and teacher_profile.id:
                db.query(TeacherProfile).filter(TeacherProfile.id == teacher_profile.id).delete()
            if 'student_user' in locals() and student_user and student_user.id:
                db.query(User).filter(User.id == student_user.id).delete()
            if 'teacher_user' in locals() and teacher_user and teacher_user.id:
                db.query(User).filter(User.id == teacher_user.id).delete()
            db.commit()
        except Exception as clean_err:
            db.rollback()
            print(f"Cleanup error in test script: {clean_err}")
        finally:
            db.close()

if __name__ == "__main__":
    run_tests()

