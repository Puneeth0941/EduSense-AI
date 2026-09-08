import sys
import os
import traceback

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from fastapi.testclient import TestClient
from app.main import app
from app.db.session import SessionLocal
from app.models.user import User
from app.models.enums import UserRole, SessionStatus
from app.models.classroom import Classroom
from app.models.session import ClassSession, SessionParticipant
from app.models.profile import StudentProfile
from app.models.stubs import FaceEmbedding
from app.core.security import create_access_token
import numpy as np
import cv2
import base64

client = TestClient(app)

def test_direct_verify():
    print("=" * 60)
    print("DIRECT FASTAPI TEST CLIENT VERIFICATION")
    print("=" * 60)

    db = SessionLocal()
    try:
        # Find or create a test student user
        student_user = db.query(User).filter(User.role == UserRole.STUDENT).first()
        if not student_user:
            print("No student user found in database.")
            return

        print(f"Using Student User: id={student_user.id}, email={student_user.email}, name={student_user.full_name}")

        # Check student profile
        sp = db.query(StudentProfile).filter(StudentProfile.user_id == student_user.id).first()
        # Ensure face embedding exists for test student
        face_rec = db.query(FaceEmbedding).filter(FaceEmbedding.student_id == sp.id).first()
        if not face_rec:
            print("Adding synthetic face embedding for test student...")
            np.random.seed(42)
            base_v = np.random.randn(512).astype(np.float32)
            base_v /= np.linalg.norm(base_v)
            mean_v = [float(x) for x in base_v]
            face_rec = FaceEmbedding(
                student_id=sp.id,
                embedding_dim=512,
                embedding_data={
                    "sample_embeddings": [mean_v],
                    "mean_embedding": mean_v,
                    "num_samples": 1,
                }
            )
            db.add(face_rec)
            db.commit()

        # Generate JWT token
        token = create_access_token({"sub": str(student_user.id)})
        headers = {
            "Authorization": f"Bearer {token}",
            "Origin": "http://localhost:5173"
        }

        # Find or create an ACTIVE session
        session = db.query(ClassSession).filter(ClassSession.status == SessionStatus.ACTIVE).first()
        if not session:
            # Create dummy classroom and active session for test
            print("Creating active session for test...")
            classroom = db.query(Classroom).first()
            if not classroom:
                print("No classroom found.")
                return
            session = ClassSession(
                classroom_id=classroom.id,
                title="Test Attendance Session",
                status=SessionStatus.ACTIVE
            )
            db.add(session)
            db.commit()
            db.refresh(session)

        print(f"Using Session: id={session.id}, status={session.status}")

        # Ensure student is a participant
        participant = db.query(SessionParticipant).filter(
            SessionParticipant.session_id == session.id,
            SessionParticipant.user_id == student_user.id
        ).first()

        if not participant:
            print("Adding student as session participant...")
            participant = SessionParticipant(
                session_id=session.id,
                user_id=student_user.id,
                role=UserRole.STUDENT
            )
            db.add(participant)
            db.commit()

        # Create sample base64 image
        img = np.ones((480, 640, 3), dtype=np.uint8) * 220
        cx, cy = 320, 240
        cv2.ellipse(img, (cx, cy), (110, 140), 0, 0, 360, (180, 150, 120), -1)
        cv2.circle(img, (cx - 40, cy - 30), 14, (255, 255, 255), -1)
        cv2.circle(img, (cx + 40, cy - 30), 14, (255, 255, 255), -1)
        cv2.circle(img, (cx - 40, cy - 30), 6, (40, 40, 40), -1)
        cv2.circle(img, (cx + 40, cy - 30), 6, (40, 40, 40), -1)
        _, buf = cv2.imencode('.jpg', img)
        frame_b64 = base64.b64encode(buf).decode('utf-8')

        # Send request 1
        print("\n[Request 1] Posting to /api/attendance/verify...")
        response1 = client.post(
            "/api/attendance/verify",
            headers=headers,
            json={
                "session_id": str(session.id),
                "image_base64": frame_b64
            }
        )
        print(f"Status Code: {response1.status_code}")
        print(f"Content: {response1.text}")

        # Send request 2 (existing_record now exists in DB!)
        print("\n[Request 2] Posting to /api/attendance/verify (existing_record in DB)...")
        response2 = client.post(
            "/api/attendance/verify",
            headers=headers,
            json={
                "session_id": str(session.id),
                "image_base64": frame_b64
            }
        )
        print(f"Status Code: {response2.status_code}")
        print(f"Content: {response2.text}")

    except Exception as e:
        print("\nEXCEPTIONAL FAILURE:")
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    test_direct_verify()
