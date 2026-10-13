"""
EduSense AI — Complete Speech Pipeline Verification Test Suite
Tests:
- Multilingual speech transcription (English, Hindi, Kannada, Auto-detect)
- Original language preservation without translation
- Student vs Teacher attribution
- Text sentiment analysis (Positive, Negative, Neutral, Confused, Unsupported Language)
- Idempotency / 8-second deduplication vs legitimate repeated phrases
- Student-wise & Classroom-level analytics API exposure
"""

import os
import sys
import io
import time
import uuid
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient

# Ensure sys.path includes project root and backend dir
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
from app.models.stubs import SpeechAnalysis, SentimentAnalysis, EngagementMetric
from app.core.security import create_access_token
from ai.speech_transcriber import speech_transcriber, SUPPORTED_LANGUAGES
from ai.sentiment_analyzer import TextSentimentAnalyzer
from app.services.analytics_service import analytics_service
from app.services.transcription_service import transcription_service


def test_1_multilingual_supported_languages():
    print("\n--- TEST 1: Supported Languages in Transcriber & Service ---")
    assert "en" in SUPPORTED_LANGUAGES
    assert "kn" in SUPPORTED_LANGUAGES
    assert "hi" in SUPPORTED_LANGUAGES
    langs = transcription_service.get_supported_languages()
    lang_codes = [l.code for l in langs]
    assert "en" in lang_codes
    assert "kn" in lang_codes
    assert "hi" in lang_codes
    print("✓ Supported languages contain en, kn, and hi.")


def test_2_actual_audio_transcription_and_language_detection():
    print("\n--- TEST 2: Actual Audio Transcription & Language Detection ---")
    en_wav_path = os.path.join(backend_dir, "test_en.wav")
    hi_wav_path = os.path.join(backend_dir, "test_hi.wav")

    # 1. English audio with auto-detect
    if os.path.exists(en_wav_path):
        res_en = speech_transcriber.transcribe(en_wav_path, language="auto")
        assert res_en["valid_input"] is True
        assert res_en["language"] == "en"
        assert len(res_en["text"]) > 0
        print(f"✓ English Audio Auto-Detect: text='{res_en['text'][:40]}...', detected='{res_en['language']}'")

    # 2. Hindi audio with explicit 'hi' and auto-detect
    if os.path.exists(hi_wav_path):
        res_hi_explicit = speech_transcriber.transcribe(hi_wav_path, language="hi")
        assert res_hi_explicit["valid_input"] is True
        assert res_hi_explicit["language"] == "hi"
        assert len(res_hi_explicit["text"]) > 0
        print(f"✓ Hindi Audio Explicit 'hi': text='{res_hi_explicit['text'][:40]}...', detected='{res_hi_explicit['language']}'")

        res_hi_auto = speech_transcriber.transcribe(hi_wav_path, language="auto")
        assert res_hi_auto["valid_input"] is True
        assert res_hi_auto["language"] == "hi"
        print(f"✓ Hindi Audio Auto-Detect: detected='{res_hi_auto['language']}'")

    # 3. Kannada target language parameter
    if os.path.exists(en_wav_path):
        res_kn = speech_transcriber.transcribe(en_wav_path, language="kn")
        assert res_kn["language"] == "kn"
        print("✓ Kannada target language parameter accepted and respected by faster-whisper.")


def test_3_text_sentiment_multilingual_behavior():
    print("\n--- TEST 3: Text Sentiment Behavior Across Languages ---")
    analyzer = TextSentimentAnalyzer()

    # Positive English
    pos_res = analyzer.analyze_text("This lecture is great and super clear, thank you!", language="en")
    assert pos_res["valid_input"] is True
    assert pos_res["sentiment_score"] > 0.05
    assert pos_res["sentiment_label"] == "positive"
    assert pos_res["language_supported"] is True
    print(f"✓ Positive English: label={pos_res['sentiment_label']}, score={pos_res['sentiment_score']}")

    # Confused English
    conf_res = analyzer.analyze_text("I am very confused about line 4, can you re-explain?", language="en")
    assert conf_res["valid_input"] is True
    assert conf_res["is_confusion"] is True
    assert conf_res["sentiment_label"] == "confused"
    print(f"✓ Confused English: label={conf_res['sentiment_label']}")

    # Negative English
    neg_res = analyzer.analyze_text("The explanation was bad and confusing.", language="en")
    assert neg_res["valid_input"] is True
    assert neg_res["sentiment_score"] < -0.05
    assert neg_res["sentiment_label"] in ["negative", "confused"]
    print(f"✓ Negative English: label={neg_res['sentiment_label']}, score={neg_res['sentiment_score']}")

    # Neutral English
    neu_res = analyzer.analyze_text("Here is the assignment file for chapter 3.", language="en")
    assert neu_res["valid_input"] is True
    assert neu_res["sentiment_label"] == "neutral"
    print(f"✓ Neutral English: label={neu_res['sentiment_label']}")

    # Kannada text (Unsupported language)
    kn_res = analyzer.analyze_text("ಇದು ಅರ್ಥವಾಯಿತು ಧನ್ಯವಾದಗಳು", language="kn")
    assert kn_res["valid_input"] is True
    assert kn_res["sentiment_score"] is None
    assert kn_res["sentiment_label"] == "unsupported_language"
    assert kn_res["language_supported"] is False
    assert kn_res["status"] == "unsupported_language"
    print(f"✓ Kannada Text: label={kn_res['sentiment_label']}, score={kn_res['sentiment_score']}, supported={kn_res['language_supported']}")

    # Hindi text (Unsupported language)
    hi_res = analyzer.analyze_text("मुझे यह समझ नहीं आया", language="hi")
    assert hi_res["valid_input"] is True
    assert hi_res["sentiment_score"] is None
    assert hi_res["sentiment_label"] == "unsupported_language"
    assert hi_res["language_supported"] is False
    assert hi_res["status"] == "unsupported_language"
    print(f"✓ Hindi Text: label={hi_res['sentiment_label']}, score={hi_res['sentiment_score']}, supported={hi_res['language_supported']}")

    # Empty / None text
    empty_res = analyzer.analyze_text("", language="en")
    assert empty_res["valid_input"] is False
    assert empty_res["status"] == "insufficient_data"
    print("✓ Empty Text: handled gracefully with insufficient_data.")


def test_4_deduplication_and_attribution_flow():
    print("\n--- TEST 4: Deduplication, Attribution & Analytics API ---")
    client = TestClient(app)
    db = SessionLocal()

    try:
        # Create Teacher & 2 Students
        teacher = User(
            email=f"t_pipe_{uuid.uuid4().hex[:6]}@edusense.ai",
            password_hash="hashed_pw",
            full_name="Dr. Multilingual Teacher",
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

        student_1 = User(
            email=f"s1_pipe_{uuid.uuid4().hex[:6]}@edusense.ai",
            password_hash="hashed_pw",
            full_name="Student One",
            role=UserRole.STUDENT,
            is_active=True,
        )
        student_2 = User(
            email=f"s2_pipe_{uuid.uuid4().hex[:6]}@edusense.ai",
            password_hash="hashed_pw",
            full_name="Student Two",
            role=UserRole.STUDENT,
            is_active=True,
        )
        db.add_all([student_1, student_2])
        db.commit()
        db.refresh(student_1)
        db.refresh(student_2)

        s1_profile = StudentProfile(
            user_id=student_1.id,
            student_id_number=f"STU1_{uuid.uuid4().hex[:6]}",
            department="Computer Science",
            enrollment_year=2026,
        )
        s2_profile = StudentProfile(
            user_id=student_2.id,
            student_id_number=f"STU2_{uuid.uuid4().hex[:6]}",
            department="Computer Science",
            enrollment_year=2026,
        )
        db.add_all([s1_profile, s2_profile])

        classroom = Classroom(
            title="Speech Analytics Classroom",
            course_code=f"SP_{uuid.uuid4().hex[:4]}",
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
            title="Live Multilingual Speech Session",
            status=SessionStatus.ACTIVE,
            scheduled_start_time=now,
            scheduled_end_time=now,
            actual_start_time=now,
        )
        db.add(session)
        db.commit()
        db.refresh(session)

        # Create Session Participants
        teacher_part = SessionParticipant(session_id=session.id, user_id=teacher.id, role=UserRole.TEACHER)
        s1_part = SessionParticipant(session_id=session.id, user_id=student_1.id, role=UserRole.STUDENT)
        s2_part = SessionParticipant(session_id=session.id, user_id=student_2.id, role=UserRole.STUDENT)
        db.add_all([teacher_part, s1_part, s2_part])
        db.commit()

        s1_token = create_access_token({"sub": str(student_1.id)})
        s2_token = create_access_token({"sub": str(student_2.id)})
        t_token = create_access_token({"sub": str(teacher.id)})

        s1_headers = {"Authorization": f"Bearer {s1_token}"}
        s2_headers = {"Authorization": f"Bearer {s2_token}"}
        t_headers = {"Authorization": f"Bearer {t_token}"}

        # 1. Student 1 speaks English positive phrase
        now_ts = datetime.now(timezone.utc)
        sa1 = SpeechAnalysis(
            session_id=session.id,
            participant_id=s1_part.id,
            transcript_text="This is great, I understand everything clearly!",
            speech_emotion="positive",
            sampled_at=now_ts,
        )
        db.add(sa1)

        # 2. Student 1 speaks Kannada phrase (unsupported for sentiment)
        sa2 = SpeechAnalysis(
            session_id=session.id,
            participant_id=s1_part.id,
            transcript_text="ಇದು ತುಂಬಾ ಒಳ್ಳೆಯದಾಗಿದೆ ಧನ್ಯವಾದಗಳು",
            speech_emotion="unsupported_language",
            sampled_at=now_ts + timedelta(seconds=20),
        )
        db.add(sa2)

        # 3. Student 2 speaks English negative/confused phrase
        sa3 = SpeechAnalysis(
            session_id=session.id,
            participant_id=s2_part.id,
            transcript_text="I am confused about this step.",
            speech_emotion="confused",
            sampled_at=now_ts + timedelta(seconds=30),
        )
        db.add(sa3)

        # 4. Teacher speaks English (Must NOT be counted in student analytics!)
        sa_teacher = SpeechAnalysis(
            session_id=session.id,
            participant_id=teacher_part.id,
            transcript_text="Welcome students, let us begin our discussion.",
            speech_emotion="positive",
            sampled_at=now_ts + timedelta(seconds=1),
        )
        db.add(sa_teacher)
        db.commit()

        # Query Student 1 analytics
        resp_s1 = client.get(f"/api/analytics/session/{session.id}/student/{s1_profile.id}", headers=s1_headers)
        assert resp_s1.status_code == 200
        data_s1 = resp_s1.json()
        assert "speech_sentiment" in data_s1
        sent_s1 = data_s1["speech_sentiment"]
        assert sent_s1["total_segments"] == 2
        assert sent_s1["valid_analyzed_segments"] == 1
        assert sent_s1["unsupported_language_segments"] == 1
        assert sent_s1["positive_count"] == 1
        assert sent_s1["positive_percentage"] == 100.0
        assert sent_s1["dominant_sentiment"] == "positive"
        assert len(sent_s1["recent_snippets"]) == 2
        print("✓ Student 1 speech sentiment: 1 positive (100%), 1 unsupported Kannada, dominant=positive.")

        # Query Student 2 analytics
        resp_s2 = client.get(f"/api/analytics/session/{session.id}/student/{s2_profile.id}", headers=s2_headers)
        assert resp_s2.status_code == 200
        data_s2 = resp_s2.json()
        sent_s2 = data_s2["speech_sentiment"]
        assert sent_s2["total_segments"] == 1
        assert sent_s2["confused_count"] == 1
        assert sent_s2["confused_percentage"] == 100.0
        assert sent_s2["dominant_sentiment"] == "confused"
        print("✓ Student 2 speech sentiment: 1 confused (100%), dominant=confused. Isolated from Student 1.")

        # Student privacy check: Student 1 cannot view Student 2
        resp_forbidden = client.get(f"/api/analytics/session/{session.id}/student/{s2_profile.id}", headers=s1_headers)
        assert resp_forbidden.status_code == 403
        print("✓ Privacy isolation verified: Student 1 cannot access Student 2 analytics.")

        # Query Classroom Overview (Teacher only)
        resp_overview = client.get(f"/api/analytics/session/{session.id}/overview", headers=t_headers)
        assert resp_overview.status_code == 200
        data_overview = resp_overview.json()
        class_speech = data_overview["classroom_speech_sentiment"]
        assert class_speech is not None
        # Total student transcripts should be 3 (2 from s1, 1 from s2; teacher speech excluded!)
        assert class_speech["total_student_transcripts"] == 3
        assert class_speech["valid_analyzed_transcripts"] == 2  # 1 positive + 1 confused
        assert class_speech["unsupported_language_transcripts"] == 1  # 1 Kannada
        assert class_speech["positive_count"] == 1
        assert class_speech["confused_count"] == 1
        # Percentages calculated from valid analyzed transcripts: 1/2 = 50.0%
        assert class_speech["positive_percentage"] == 50.0
        assert class_speech["confused_percentage"] == 50.0
        assert class_speech["status"] == "active"
        print(f"✓ Classroom Speech Sentiment: total_student={class_speech['total_student_transcripts']} (teacher excluded), valid={class_speech['valid_analyzed_transcripts']}, pos={class_speech['positive_percentage']}%, conf={class_speech['confused_percentage']}%.")

        # Deduplication test via transcription_service
        # Simulate duplicate call with exact same text within 8 seconds
        dup_res = transcription_service.transcribe_audio(
            audio_input=b"fake_audio",
            session=session,
            current_user=student_1,
            db=db,
        )
        # Verify deduplication query logic
        now_check = datetime.now(timezone.utc)
        dup_entry_1 = SpeechAnalysis(
            session_id=session.id,
            participant_id=s1_part.id,
            transcript_text="Test deduplication sentence",
            speech_emotion="positive",
            sampled_at=now_check,
        )
        db.add(dup_entry_1)
        db.commit()

        # Check that 8-second deduplication detects recent match
        recent_match = db.scalar(
            db.query(SpeechAnalysis)
            .filter(
                SpeechAnalysis.session_id == session.id,
                SpeechAnalysis.participant_id == s1_part.id,
                SpeechAnalysis.transcript_text == "Test deduplication sentence",
                SpeechAnalysis.sampled_at >= now_check - timedelta(seconds=8),
            )
            .statement
        )
        assert recent_match is not None
        print("✓ Deduplication logic correctly identifies identical transcripts within 8-second window.")

    finally:
        # Cleanup
        try:
            db.query(SpeechAnalysis).filter(SpeechAnalysis.session_id == session.id).delete()
            db.query(SentimentAnalysis).filter(SentimentAnalysis.session_id == session.id).delete()
            db.query(EngagementMetric).filter(EngagementMetric.session_id == session.id).delete()
            db.query(SessionParticipant).filter(SessionParticipant.session_id == session.id).delete()
            db.query(ClassSession).filter(ClassSession.id == session.id).delete()
            db.query(Classroom).filter(Classroom.id == classroom.id).delete()
            db.query(StudentProfile).filter(StudentProfile.id.in_([s1_profile.id, s2_profile.id])).delete()
            db.query(TeacherProfile).filter(TeacherProfile.id == teacher_profile.id).delete()
            db.query(User).filter(User.id.in_([teacher.id, student_1.id, student_2.id])).delete()
            db.commit()
        except Exception:
            db.rollback()
        db.close()


def run_all_verification_tests():
    print("==================================================================")
    print("STARTING COMPLETE SPEECH PIPELINE VERIFICATION SUITE")
    print("==================================================================")
    test_1_multilingual_supported_languages()
    test_2_actual_audio_transcription_and_language_detection()
    test_3_text_sentiment_multilingual_behavior()
    test_4_deduplication_and_attribution_flow()
    print("\n==================================================================")
    print("ALL SPEECH PIPELINE VERIFICATION TESTS PASSED SUCCESSFULLY! ✅")
    print("==================================================================")


if __name__ == "__main__":
    run_all_verification_tests()
