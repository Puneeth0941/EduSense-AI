import os
import sys
import uuid
import numpy as np
import cv2
import base64
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
    img = np.full((480, 640, 3), 200, dtype=np.uint8)
    cv2.ellipse(img, (320, 240), (100, 140), 0, 0, 360, (180, 150, 130), -1)
    cv2.circle(img, (280, 200), 15, (50, 50, 50), -1)
    cv2.circle(img, (360, 200), 15, (50, 50, 50), -1)
    cv2.ellipse(img, (320, 270), (45, 15), 0, 0, 180, (50, 50, 50), 3)
    _, buffer = cv2.imencode('.jpg', img)
    return base64.b64encode(buffer).decode('utf-8')

def test_session_lifecycle():
    print("==================================================")
    print("STARTING COMPLETE CLASS SESSION END LIFECYCLE TESTS")
    print("==================================================")

    client = TestClient(app)
    db = SessionLocal()

    try:
        # 1. SETUP TEACHER & STUDENT
        t_user = User(
            email=f"teacher_lifecycle_{uuid.uuid4().hex[:6]}@edusense.ai",
            password_hash="hashed_pwd",
            full_name="Teacher Lifecycle Test",
            role=UserRole.TEACHER,
            is_active=True,
        )
        db.add(t_user)
        db.commit()
        t_prof = TeacherProfile(user_id=t_user.id, employee_id=f"EMP_{uuid.uuid4().hex[:6]}")
        db.add(t_prof)
        db.commit()

        s_user = User(
            email=f"student_lifecycle_{uuid.uuid4().hex[:6]}@edusense.ai",
            password_hash="hashed_pwd",
            full_name="Student Lifecycle Test",
            role=UserRole.STUDENT,
            is_active=True,
        )
        db.add(s_user)
        db.commit()
        s_prof = StudentProfile(user_id=s_user.id, student_id_number=f"STU_{uuid.uuid4().hex[:6]}")
        db.add(s_prof)
        db.commit()

        dummy_vec = [float(x) for x in (np.ones(512, dtype=np.float32) / np.sqrt(512))]
        face_rec = FaceEmbedding(
            student_id=s_prof.id,
            embedding_dim=512,
            embedding_data={"mean_embedding": dummy_vec, "sample_embeddings": [dummy_vec]},
        )
        db.add(face_rec)
        db.commit()

        t_token = create_access_token(data={"sub": str(t_user.id), "role": t_user.role.value})
        s_token = create_access_token(data={"sub": str(s_user.id), "role": s_user.role.value})

        t_headers = {"Authorization": f"Bearer {t_token}"}
        s_headers = {"Authorization": f"Bearer {s_token}"}

        # 2. TEST A — INITIAL DASHBOARD CHECK & CLASSROOM CREATION
        print("\n--- TEST A: Classroom Creation & Initial Live Now Check ---")
        c_res = client.post(
            "/api/classrooms/",
            json={"title": "Data Structures & Algorithms", "course_code": "CS-301", "description": "DSA Course"},
            headers=t_headers,
        )
        assert c_res.status_code == 201
        classroom_data = c_res.json()
        classroom_id = classroom_data["id"]
        print(f"Classroom created: {classroom_data['title']} (ID: {classroom_id})")

        # Verify active session returns 404 before launch
        act_res = client.get(f"/api/classrooms/{classroom_id}/active-session", headers=t_headers)
        assert act_res.status_code == 404, f"Expected 404 No Active Session, got {act_res.status_code}"
        print("PASS: Live Now = 0 before launch.")

        # 3. TEST A — LAUNCH CLASS SESSION
        print("\n--- TEST A (cont.): Launch Class Session ---")
        sess_create_res = client.post(
            f"/api/classrooms/{classroom_id}/sessions",
            json={"title": "Session 1: Binary Trees"},
            headers=t_headers,
        )
        assert sess_create_res.status_code == 201
        session1 = sess_create_res.json()
        session1_id = session1["id"]

        sess_start_res = client.post(f"/api/sessions/{session1_id}/start", headers=t_headers)
        assert sess_start_res.status_code == 200
        session1_started = sess_start_res.json()
        assert session1_started["status"] == "ACTIVE"
        assert session1_started["actual_start_time"] is not None
        print(f"Session 1 launched: Status={session1_started['status']}, StartTime={session1_started['actual_start_time']}")

        act_res2 = client.get(f"/api/classrooms/{classroom_id}/active-session", headers=t_headers)
        assert act_res2.status_code == 200
        assert act_res2.json()["id"] == session1_id
        print("PASS: Live Now = 1 after launch.")

        # Student joins Session 1
        join_res = client.post(f"/api/classrooms/{classroom_id}/sessions/{session1_id}/join", headers=s_headers)
        assert join_res.status_code == 200
        print("Student joined LiveKit session 1 successfully.")

        # 4. TEST C — ATTENDANCE VERIFICATION & PRESERVATION
        print("\n--- TEST C: Attendance Verification ---")
        orig_process = FaceService.process_attendance_frame
        def mock_process(self, base64_img, enrolled_data):
            return {
                "matched": True, "reason": "MATCH_SUCCESS", "similarity": 0.95,
                "message": "Face verified.", "image_width": 640, "image_height": 480,
                "num_faces": 1, "quality_pass": True, "embedding_generated": True,
            }
        FaceService.process_attendance_frame = mock_process

        for step in range(3):
            v_res = client.post(
                "/api/attendance/verify",
                json={"session_id": session1_id, "image_base64": generate_test_face_image()},
                headers=s_headers,
            )
            assert v_res.status_code == 200

        FaceService.process_attendance_frame = orig_process
        print("PASS: Student attendance verified with 3 samples.")

        # 5. TEST B — END CLASS SESSION
        print("\n--- TEST B: End Class Session ---")
        end_res = client.post(f"/api/sessions/{session1_id}/end", headers=t_headers)
        assert end_res.status_code == 200
        ended_sess = end_res.json()
        assert ended_sess["status"] == "COMPLETED"
        assert ended_sess["actual_end_time"] is not None
        print(f"Session 1 ended: Status={ended_sess['status']}, EndTime={ended_sess['actual_end_time']}")

        # Confirm Live Now is 0 after ending
        act_res3 = client.get(f"/api/classrooms/{classroom_id}/active-session", headers=t_headers)
        assert act_res3.status_code == 404
        print("PASS: Live Now = 0 after ending session.")

        # Confirm Classroom STILL exists in list
        class_list_res = client.get("/api/classrooms/", headers=t_headers)
        assert class_list_res.status_code == 200
        teacher_classes = class_list_res.json()
        assert any(c["id"] == classroom_id for c in teacher_classes)
        print("PASS: Classroom STILL exists in My Classes.")

        # Confirm Attendance record PRESERVED in PostgreSQL
        db.expire_all()
        att_recs = db.query(AttendanceRecord).filter(AttendanceRecord.session_id == uuid.UUID(session1_id)).all()
        assert len(att_recs) == 1
        assert att_recs[0].verification_count == 3
        print(f"PASS: Attendance record preserved: ID={att_recs[0].id}, Status={att_recs[0].status}, Samples={att_recs[0].verification_count}")

        # 6. TEST D — RELAUNCH SAME CLASSROOM (NEW SESSION CREATED)
        print("\n--- TEST D: Relaunch Same Classroom (New Session) ---")
        sess_create_res2 = client.post(
            f"/api/classrooms/{classroom_id}/sessions",
            json={"title": "Session 2: Graph Theory"},
            headers=t_headers,
        )
        assert sess_create_res2.status_code == 201
        session2_id = sess_create_res2.json()["id"]
        assert session2_id != session1_id, "New session must have a DIFFERENT ID than previous ended session"

        sess_start_res2 = client.post(f"/api/sessions/{session2_id}/start", headers=t_headers)
        assert sess_start_res2.status_code == 200
        assert sess_start_res2.json()["status"] == "ACTIVE"
        print(f"Session 2 launched: ID={session2_id}")

        # Confirm Live Now = 1 (Session 2 ACTIVE) while Session 1 is COMPLETED
        act_res4 = client.get(f"/api/classrooms/{classroom_id}/active-session", headers=t_headers)
        assert act_res4.status_code == 200
        assert act_res4.json()["id"] == session2_id

        # Verify Session 1 in DB remains COMPLETED
        sess1_db = db.query(ClassSession).filter(ClassSession.id == uuid.UUID(session1_id)).first()
        assert sess1_db.status == SessionStatus.COMPLETED
        print("PASS: Previous Session 1 remains COMPLETED while Session 2 is LIVE.")

        # End Session 2
        client.post(f"/api/sessions/{session2_id}/end", headers=t_headers)
        act_res5 = client.get(f"/api/classrooms/{classroom_id}/active-session", headers=t_headers)
        assert act_res5.status_code == 404
        print("PASS: Live Now = 0 again after ending Session 2.")

        # 7. TEST E — STUDENT BLOCKED FROM JOINING ENDED SESSION
        print("\n--- TEST E: Student Blocked from Ended Sessions ---")
        join_ended_res = client.post(f"/api/classrooms/{classroom_id}/sessions/{session1_id}/join", headers=s_headers)
        assert join_ended_res.status_code == 400
        print(f"PASS: Student join attempt on ended session correctly blocked with status {join_ended_res.status_code}: '{join_ended_res.json()['detail']}'")

        print("\n==================================================")
        print("ALL LIFECYCLE TESTS PASSED 100% SUCCESSFULLY!")
        print("==================================================")

    finally:
        try:
            if 'session1_id' in locals():
                db.query(AttendanceRecord).filter(AttendanceRecord.session_id == uuid.UUID(session1_id)).delete()
                db.query(SessionParticipant).filter(SessionParticipant.session_id == uuid.UUID(session1_id)).delete()
                db.query(ClassSession).filter(ClassSession.id == uuid.UUID(session1_id)).delete()
            if 'session2_id' in locals():
                db.query(AttendanceRecord).filter(AttendanceRecord.session_id == uuid.UUID(session2_id)).delete()
                db.query(SessionParticipant).filter(SessionParticipant.session_id == uuid.UUID(session2_id)).delete()
                db.query(ClassSession).filter(ClassSession.id == uuid.UUID(session2_id)).delete()
            if 'classroom_id' in locals():
                db.query(Classroom).filter(Classroom.id == uuid.UUID(classroom_id)).delete()
            if 's_prof' in locals() and s_prof:
                db.query(FaceEmbedding).filter(FaceEmbedding.student_id == s_prof.id).delete()
                db.query(StudentProfile).filter(StudentProfile.id == s_prof.id).delete()
            if 't_prof' in locals() and t_prof:
                db.query(TeacherProfile).filter(TeacherProfile.id == t_prof.id).delete()
            if 's_user' in locals() and s_user:
                db.query(User).filter(User.id == s_user.id).delete()
            if 't_user' in locals() and t_user:
                db.query(User).filter(User.id == t_user.id).delete()
            db.commit()
        except Exception as clean_err:
            db.rollback()
            print(f"Cleanup error: {clean_err}")
        finally:
            db.close()

if __name__ == "__main__":
    test_session_lifecycle()
