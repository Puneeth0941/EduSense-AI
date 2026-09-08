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
    print("STARTING TEACHER ATTENDANCE RECORDS FLOW TESTS")
    print("==================================================")
    
    client = TestClient(app)
    db = SessionLocal()

    try:
        # 1. Create Teacher A (Owner)
        teacher_a = User(
            email=f"teacher_a_{uuid.uuid4().hex[:6]}@edusense.ai",
            password_hash="pwd",
            full_name="Teacher Alice (Owner)",
            role=UserRole.TEACHER,
        )
        db.add(teacher_a)
        db.commit()
        t_profile_a = TeacherProfile(user_id=teacher_a.id, employee_id=f"EMP_A_{uuid.uuid4().hex[:4]}")
        db.add(t_profile_a)
        db.commit()

        # 2. Create Teacher B (Unauthorized)
        teacher_b = User(
            email=f"teacher_b_{uuid.uuid4().hex[:6]}@edusense.ai",
            password_hash="pwd",
            full_name="Teacher Bob (Other)",
            role=UserRole.TEACHER,
        )
        db.add(teacher_b)
        db.commit()
        t_profile_b = TeacherProfile(user_id=teacher_b.id, employee_id=f"EMP_B_{uuid.uuid4().hex[:4]}")
        db.add(t_profile_b)
        db.commit()

        # 3. Create Student 1 (Enrolled & Active)
        student_1 = User(
            email=f"student_1_{uuid.uuid4().hex[:6]}@edusense.ai",
            password_hash="pwd",
            full_name="Student Charlie",
            role=UserRole.STUDENT,
        )
        db.add(student_1)
        db.commit()
        s_profile_1 = StudentProfile(user_id=student_1.id, student_id_number=f"STU_1_{uuid.uuid4().hex[:4]}")
        db.add(s_profile_1)
        db.commit()

        # Create Face Enrollment for Student 1
        dummy_vec = [float(x) for x in (np.ones(512, dtype=np.float32) / np.sqrt(512))]
        face_record = FaceEmbedding(
            student_id=s_profile_1.id,
            embedding_dim=512,
            embedding_data={
                "mean_embedding": dummy_vec,
                "sample_embeddings": [dummy_vec, dummy_vec],
            },
        )
        db.add(face_record)
        db.commit()

        # 4. Create Classroom A & Session A (owned by Teacher A)
        classroom_a = Classroom(
            title="Machine Learning 401",
            course_code=f"CS{uuid.uuid4().hex[:4]}",
            teacher_id=t_profile_a.id,
            livekit_room_name=f"room_{uuid.uuid4().hex[:6]}",
        )
        db.add(classroom_a)
        db.commit()

        session_a = ClassSession(
            classroom_id=classroom_a.id,
            title="Deep Learning & ArcFace Lecture",
            status=SessionStatus.ACTIVE,
            scheduled_start_time=datetime.now(timezone.utc),
            scheduled_end_time=datetime.now(timezone.utc) + timedelta(hours=1),
            actual_start_time=datetime.now(timezone.utc),
        )
        db.add(session_a)
        db.commit()

        # Add Student 1 to Session A
        participant_1 = SessionParticipant(
            session_id=session_a.id,
            user_id=student_1.id,
            role=UserRole.STUDENT,
        )
        db.add(participant_1)
        db.commit()

        # 5. Student 1 Verifies Attendance (3 samples)
        student_token = create_access_token(data={"sub": str(student_1.id), "role": student_1.role.value})
        student_headers = {"Authorization": f"Bearer {student_token}"}
        image_b64 = generate_test_face_image()

        orig_process = FaceService.process_attendance_frame
        def mock_process(self, base64_img, enrolled_data):
            return {
                "matched": True,
                "reason": "MATCH_SUCCESS",
                "similarity": 0.94,
                "message": "Face match verified.",
                "image_width": 640,
                "image_height": 480,
                "num_faces": 1,
                "quality_pass": True,
                "embedding_generated": True,
            }
        FaceService.process_attendance_frame = mock_process

        for step in range(1, 4):
            res = client.post(
                "/api/attendance/verify",
                json={"session_id": str(session_a.id), "image_base64": image_b64},
                headers=student_headers,
            )
            assert res.status_code == 200
            print(f"Student Sample {step}/3 Response: {res.json()['attendance_status']}")

        # Restore process function
        FaceService.process_attendance_frame = orig_process

        # 6. VERIFY POSTGRESQL RECORD EXISTS
        print("\n--- Verification 1: PostgreSQL Record Check ---")
        db.expire_all()
        db_records = db.query(AttendanceRecord).filter(
            AttendanceRecord.session_id == session_a.id,
            AttendanceRecord.student_id == s_profile_1.id,
        ).all()

        assert len(db_records) == 1, f"Expected 1 database record, found {len(db_records)}"
        att_rec = db_records[0]
        status_str = att_rec.status.value if hasattr(att_rec.status, 'value') else str(att_rec.status)
        print(f"PostgreSQL Record Found: ID={att_rec.id}, Status={status_str}, Count={att_rec.verification_count}")
        assert status_str in ("PRESENT", "LATE")
        assert att_rec.verification_count == 3
        print("PASS: Database row exists with verified status and 3 samples!")

        # 7. TEACHER A (OWNER) GETS SESSION ATTENDANCE
        print("\n--- Verification 2: Authorized Teacher A Views Session Attendance ---")
        teacher_a_token = create_access_token(data={"sub": str(teacher_a.id), "role": teacher_a.role.value})
        res_teacher_a = client.get(
            f"/api/attendance/session/{session_a.id}",
            headers={"Authorization": f"Bearer {teacher_a_token}"},
        )
        print(f"Teacher A API Response ({res_teacher_a.status_code}): {res_teacher_a.json()}")
        assert res_teacher_a.status_code == 200
        summary_a = res_teacher_a.json()
        assert summary_a["total_students"] == 1
        assert summary_a["present_count"] + summary_a["late_count"] == 1
        assert len(summary_a["records"]) == 1
        rec_data = summary_a["records"][0]
        assert rec_data["student_name"] == "Student Charlie"
        assert rec_data["status"] in ("PRESENT", "LATE")
        assert rec_data["verification_count"] == 3
        print("PASS: Teacher A received correct real-time attendance list!")

        # 8. TEACHER B (UNAUTHORIZED) TRIES TO GET SESSION A ATTENDANCE
        print("\n--- Verification 3: Unauthorized Teacher B Access Attempt ---")
        teacher_b_token = create_access_token(data={"sub": str(teacher_b.id), "role": teacher_b.role.value})
        res_teacher_b = client.get(
            f"/api/attendance/session/{session_a.id}",
            headers={"Authorization": f"Bearer {teacher_b_token}"},
        )
        print(f"Teacher B API Response ({res_teacher_b.status_code}): {res_teacher_b.json()}")
        assert res_teacher_b.status_code == 403, f"Expected 403 Forbidden, got {res_teacher_b.status_code}"
        print("PASS: Unauthorized Teacher B correctly received HTTP 403 Forbidden!")

        print("\n==================================================")
        print("ALL TEACHER ATTENDANCE RECORDS TESTS PASSED SUCCESSFULLY!")
        print("==================================================")

    finally:
        try:
            if 'session_a' in locals() and session_a and session_a.id:
                db.query(AttendanceRecord).filter(AttendanceRecord.session_id == session_a.id).delete()
                db.query(SessionParticipant).filter(SessionParticipant.session_id == session_a.id).delete()
                db.query(ClassSession).filter(ClassSession.id == session_a.id).delete()
            if 'classroom_a' in locals() and classroom_a and classroom_a.id:
                db.query(Classroom).filter(Classroom.id == classroom_a.id).delete()
            if 's_profile_1' in locals() and s_profile_1 and s_profile_1.id:
                db.query(FaceEmbedding).filter(FaceEmbedding.student_id == s_profile_1.id).delete()
                db.query(StudentProfile).filter(StudentProfile.id == s_profile_1.id).delete()
            if 't_profile_a' in locals() and t_profile_a and t_profile_a.id:
                db.query(TeacherProfile).filter(TeacherProfile.id == t_profile_a.id).delete()
            if 't_profile_b' in locals() and t_profile_b and t_profile_b.id:
                db.query(TeacherProfile).filter(TeacherProfile.id == t_profile_b.id).delete()
            if 'student_1' in locals() and student_1 and student_1.id:
                db.query(User).filter(User.id == student_1.id).delete()
            if 'teacher_a' in locals() and teacher_a and teacher_a.id:
                db.query(User).filter(User.id == teacher_a.id).delete()
            if 'teacher_b' in locals() and teacher_b and teacher_b.id:
                db.query(User).filter(User.id == teacher_b.id).delete()
            db.commit()
        except Exception as clean_err:
            db.rollback()
            print(f"Cleanup error in test script: {clean_err}")
        finally:
            db.close()

if __name__ == "__main__":
    run_tests()

