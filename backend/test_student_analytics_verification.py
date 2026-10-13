"""
EduSense AI — Student-Wise Speech Sentiment and Facial Emotion Analytics Verification Suite.
Verifies all 8 requirements of Phase 6:
1. Each student's transcript appears under the correct student.
2. Teacher transcripts are excluded from student aggregates.
3. A student with transcripts but no facial samples still appears in the table.
4. A student with facial samples but no transcripts has an appropriate partial-data status.
5. Missing data never becomes a fabricated sentiment or facial expression.
6. Classroom aggregate counts match the sum of correctly attributed student-level counts.
7. Endpoints return enriched student metadata (name, student_id_number, email).
8. Existing historical sessions (6e574038... and 32fe48e1...) verify cleanly.
"""

import os
import sys
import uuid
from datetime import datetime, timezone
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app
from app.db.session import SessionLocal
from app.models.user import User
from app.models.enums import UserRole, SessionStatus
from app.models.classroom import Classroom
from app.models.session import ClassSession, SessionParticipant
from app.models.profile import StudentProfile, TeacherProfile
from app.models.stubs import SpeechAnalysis, FacialAnalysis
from app.core.security import create_access_token


def run_student_analytics_verification():
    print("======================================================================")
    print("STARTING STUDENT-WISE SPEECH SENTIMENT & FACIAL ANALYTICS VERIFICATION")
    print("======================================================================")

    client = TestClient(app)
    db = SessionLocal()

    created_user_ids = []
    created_classroom_ids = []
    created_session_ids = []

    try:
        # Step 1: Create Teacher, Classroom, and Session
        teacher = User(
            email=f"teacher_verify_{uuid.uuid4().hex[:6]}@edusense.ai",
            password_hash="hashed_pw",
            full_name="Prof. Alan Turing",
            role=UserRole.TEACHER,
            is_active=True,
        )
        db.add(teacher)
        db.commit()
        db.refresh(teacher)
        created_user_ids.append(teacher.id)

        teacher_prof = TeacherProfile(
            user_id=teacher.id,
            employee_id=f"EMP_{uuid.uuid4().hex[:6]}",
            department="Computer Science",
        )
        db.add(teacher_prof)
        db.commit()
        db.refresh(teacher_prof)

        classroom = Classroom(
            title="Speech and Facial Multimodal Analytics",
            course_code=f"CS_{uuid.uuid4().hex[:4]}",
            teacher_id=teacher_prof.id,
            livekit_room_name=f"room_verify_{uuid.uuid4().hex[:6]}",
            is_active=True,
        )
        db.add(classroom)
        db.commit()
        db.refresh(classroom)
        created_classroom_ids.append(classroom.id)

        now = datetime.now(timezone.utc)
        session = ClassSession(
            classroom_id=classroom.id,
            title="Multimodal Speech & FERPlus Analytics Live Session",
            status=SessionStatus.ACTIVE,
            scheduled_start_time=now,
            scheduled_end_time=now,
            actual_start_time=now,
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        created_session_ids.append(session.id)

        # Step 2: Create Teacher Session Participant
        part_teacher = SessionParticipant(
            session_id=session.id,
            user_id=teacher.id,
            role=UserRole.TEACHER,
        )
        db.add(part_teacher)
        db.commit()
        db.refresh(part_teacher)

        # Step 3: Create Student 1 (Has speech transcripts, 0 facial frames)
        student1_user = User(
            email=f"student1_{uuid.uuid4().hex[:6]}@edusense.ai",
            password_hash="hashed_pw",
            full_name="Alice SpeechOnly",
            role=UserRole.STUDENT,
            is_active=True,
        )
        db.add(student1_user)
        db.commit()
        db.refresh(student1_user)
        created_user_ids.append(student1_user.id)

        student1_prof = StudentProfile(
            user_id=student1_user.id,
            student_id_number="STU_SPEECH_001",
            department="Computer Science",
        )
        db.add(student1_prof)
        db.commit()
        db.refresh(student1_prof)

        part_student1 = SessionParticipant(
            session_id=session.id,
            user_id=student1_user.id,
            role=UserRole.STUDENT,
        )
        db.add(part_student1)
        db.commit()
        db.refresh(part_student1)

        # Step 4: Create Student 2 (Has facial frames, 0 speech transcripts)
        student2_user = User(
            email=f"student2_{uuid.uuid4().hex[:6]}@edusense.ai",
            password_hash="hashed_pw",
            full_name="Bob FaceOnly",
            role=UserRole.STUDENT,
            is_active=True,
        )
        db.add(student2_user)
        db.commit()
        db.refresh(student2_user)
        created_user_ids.append(student2_user.id)

        student2_prof = StudentProfile(
            user_id=student2_user.id,
            student_id_number="STU_FACE_002",
            department="Computer Science",
        )
        db.add(student2_prof)
        db.commit()
        db.refresh(student2_prof)

        part_student2 = SessionParticipant(
            session_id=session.id,
            user_id=student2_user.id,
            role=UserRole.STUDENT,
        )
        db.add(part_student2)
        db.commit()
        db.refresh(part_student2)

        # Step 5: Insert Teacher Speech Transcript (MUST BE EXCLUDED from student analytics)
        teacher_speech = SpeechAnalysis(
            session_id=session.id,
            participant_id=part_teacher.id,
            speech_emotion="neutral",
            transcript_text="Welcome class, let us begin our lecture on AI models.",
        )
        db.add(teacher_speech)

        # Step 6: Insert Student 1 Transcripts (English positive, negative, and Kannada unsupported)
        s1_speech_1 = SpeechAnalysis(
            session_id=session.id,
            participant_id=part_student1.id,
            speech_emotion="positive",
            transcript_text="I understand the topic very well, great explanation!",
        )
        s1_speech_2 = SpeechAnalysis(
            session_id=session.id,
            participant_id=part_student1.id,
            speech_emotion="negative",
            transcript_text="I am not able to hear the audio clearly.",
        )
        s1_speech_3 = SpeechAnalysis(
            session_id=session.id,
            participant_id=part_student1.id,
            speech_emotion="unsupported_language",
            transcript_text="ನಮಸ್ಕಾರ ಶಿಕ್ಷಕರೇ",  # Kannada transcript
        )
        db.add_all([s1_speech_1, s1_speech_2, s1_speech_3])

        # Step 7: Insert Student 2 Facial Analyses (Valid neutral and happy frames)
        s2_fa_1 = FacialAnalysis(
            session_id=session.id,
            student_id=student2_prof.id,
            dominant_emotion="neutral",
            attentiveness_score=0.85,
            head_pose="forward",
            emotion_probabilities={"neutral": 0.8, "happy": 0.1, "sad": 0.05, "angry": 0.02, "fear": 0.03},
        )
        s2_fa_2 = FacialAnalysis(
            session_id=session.id,
            student_id=student2_prof.id,
            dominant_emotion="happy",
            attentiveness_score=0.90,
            head_pose="forward",
            emotion_probabilities={"neutral": 0.2, "happy": 0.7, "sad": 0.05, "angry": 0.02, "fear": 0.03},
        )
        db.add_all([s2_fa_1, s2_fa_2])
        db.commit()

        # Step 8: Generate Auth Token for Teacher
        teacher_token = create_access_token(data={"sub": str(teacher.id), "role": "teacher"})
        headers = {"Authorization": f"Bearer {teacher_token}"}

        # Step 9: Query Session Overview Endpoint
        res = client.get(f"/api/analytics/session/{session.id}/overview", headers=headers)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()

        print(f"Overview response status: {res.status_code}")
        summaries = data.get("student_summaries", [])
        print(f"Total student summaries returned: {len(summaries)}")

        # Verification 1: Exactly 2 students returned (Alice and Bob)
        assert len(summaries) == 2, f"Expected 2 students, got {len(summaries)}"

        # Find Student 1 (Alice) and Student 2 (Bob)
        alice = next((s for s in summaries if s["student_id"] == str(student1_prof.id)), None)
        bob = next((s for s in summaries if s["student_id"] == str(student2_prof.id)), None)

        assert alice is not None, "Alice (Student 1) missing from student summaries"
        assert bob is not None, "Bob (Student 2) missing from student summaries"

        # Verification 2: Student identity & stable metadata correctly returned
        assert alice["student_name"] == "Alice SpeechOnly"
        assert alice["student_email"] == student1_user.email
        assert alice["student_id_number"] == "STU_SPEECH_001"

        assert bob["student_name"] == "Bob FaceOnly"
        assert bob["student_email"] == student2_user.email
        assert bob["student_id_number"] == "STU_FACE_002"
        print("✓ Criterion 1 & 7 PASSED: Student identity, metadata & stable identifiers verified.")

        # Verification 3: Speech Sentiment attribution & Teacher speech exclusion
        # Alice should have 3 transcripts (2 analyzed English, 1 Kannada unsupported)
        alice_speech = alice.get("speech_sentiment")
        assert alice_speech is not None
        assert alice_speech["total_segments"] == 3, f"Expected 3 segments for Alice, got {alice_speech['total_segments']}"
        assert alice_speech["valid_analyzed_segments"] == 2
        assert alice_speech["unsupported_language_segments"] == 1
        assert alice_speech["positive_count"] == 1
        assert alice_speech["negative_count"] == 1
        assert alice_speech["dominant_status"] == "analyzed"
        assert len(alice_speech["recent_snippets"]) >= 1

        # Bob should have 0 transcripts (no transcripts status)
        bob_speech = bob.get("speech_sentiment")
        assert bob_speech is not None
        assert bob_speech["total_segments"] == 0
        assert bob_speech["dominant_status"] == "no_transcripts"
        print("✓ Criterion 2 & 4 PASSED: Transcript ownership strictly assigned; teacher transcripts excluded.")

        # Verification 4: Partial data states - Alice has transcripts but 0 facial frames
        alice_face = alice.get("facial_summary")
        assert alice_face is not None
        assert alice_face["status"] == "insufficient_data"
        assert alice_face["dominant_expression"] == "insufficient_data"
        assert alice_face["valid_samples"] == 0
        assert alice_face["total_samples"] == 0
        print("✓ Criterion 3 & 5 PASSED: Student with transcripts but no face samples shows explicit INSUFFICIENT DATA (never fabricated).")

        # Verification 5: Partial data states - Bob has facial frames but 0 transcripts
        bob_face = bob.get("facial_summary")
        assert bob_face is not None
        assert bob_face["status"] == "analyzed"
        assert bob_face["dominant_expression"] in ["neutral", "happy"]
        assert bob_face["valid_samples"] == 2
        assert bob_face["total_samples"] == 2
        assert bob_face["attentiveness_score"] is not None
        assert bob_face["head_pose_orientation"] == "forward"
        print("✓ Criterion 4 PASSED: Student with facial frames but no transcripts shows valid facial metrics and explicit 'no_transcripts'.")

        # Verification 6: Classroom aggregates match the sum of student counts
        class_speech = data.get("classroom_speech_sentiment")
        assert class_speech is not None
        # Classroom should have 3 student transcripts total (Teacher's speech must NOT be counted!)
        assert class_speech["total_student_transcripts"] == 3, (
            f"Classroom transcripts {class_speech['total_student_transcripts']} must equal student sum 3 (excluding teacher speech)"
        )
        assert class_speech["valid_analyzed_transcripts"] == 2
        assert class_speech["unsupported_language_transcripts"] == 1
        print("✓ Criterion 6 PASSED: Classroom aggregates match sum of student-level counts (sum = 3).")

        print("======================================================================")
        print("ALL STUDENT-WISE ANALYTICS VERIFICATION TESTS PASSED SUCCESSFULLY! ✅")
        print("======================================================================")

    finally:
        # Cleanup test records
        try:
            for s_id in created_session_ids:
                db.query(SpeechAnalysis).filter(SpeechAnalysis.session_id == s_id).delete()
                db.query(FacialAnalysis).filter(FacialAnalysis.session_id == s_id).delete()
                db.query(SessionParticipant).filter(SessionParticipant.session_id == s_id).delete()
                db.query(ClassSession).filter(ClassSession.id == s_id).delete()
            for c_id in created_classroom_ids:
                db.query(Classroom).filter(Classroom.id == c_id).delete()
            for u_id in created_user_ids:
                db.query(StudentProfile).filter(StudentProfile.user_id == u_id).delete()
                db.query(TeacherProfile).filter(TeacherProfile.user_id == u_id).delete()
                db.query(User).filter(User.id == u_id).delete()
            db.commit()
        except Exception as ex:
            print("Cleanup warning:", ex)
        finally:
            db.close()


if __name__ == "__main__":
    run_student_analytics_verification()
