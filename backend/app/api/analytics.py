"""
FastAPI Analytics Router for EduSense AI.

Provides endpoints for:
- Classroom frame analysis (facial pose & attentiveness)
- Student chat/transcript sentiment analysis
- Student engagement summary retrieval
- Session analytics overview & report generation
"""

import logging
import uuid
import base64
import math
import numpy as np
import cv2
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Tuple
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import select, func

from app.core.deps import get_db, get_current_user
from app.models.user import User
from app.models.classroom import Classroom
from app.models.session import ClassSession, SessionParticipant
from app.models.profile import StudentProfile
from app.models.stubs import (
    FacialAnalysis,
    SpeechAnalysis,
    SentimentAnalysis,
    DistractionEvent,
    EngagementMetric,
    ClassReport,
    AttendanceRecord,
)
from app.models.enums import UserRole, SessionStatus
from app.schemas.analytics import (
    FacialFrameInput,
    FacialAnalysisResult,
    TextSentimentInput,
    SentimentAnalysisResult,
    StudentEngagementSummary,
    SessionAnalyticsOverview,
    FacialWindowAnalytics,
    StudentFacialWindowAnalytics,
    SessionFacialSummary,
)
from app.services.analytics_service import analytics_service

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB max payload size


def get_window_bounds(
    session_start: datetime, target_time: Optional[datetime] = None
) -> Tuple[datetime, datetime]:
    """
    Compute 5-minute window bounds [window_start, window_end] for a target time relative to session start.
    """
    target = target_time or datetime.now(timezone.utc)
    if session_start.tzinfo is None:
        session_start = session_start.replace(tzinfo=timezone.utc)
    if target.tzinfo is None:
        target = target.replace(tzinfo=timezone.utc)

    elapsed_seconds = max(0.0, (target - session_start).total_seconds())
    window_index = int(elapsed_seconds // 300)
    w_start = session_start + timedelta(seconds=window_index * 300)
    w_end = w_start + timedelta(seconds=300)
    return w_start, w_end


def _decode_base64_image(image_base64: str) -> Optional[np.ndarray]:
    """
    Safely decode a base64-encoded image string into an OpenCV BGR numpy array.
    Supports data URI prefixes (e.g. data:image/jpeg;base64,...).
    """
    if not image_base64 or not isinstance(image_base64, str):
        return None

    try:
        # Strip data URI header if present
        if "," in image_base64:
            image_base64 = image_base64.split(",", 1)[1]

        image_bytes = base64.b64decode(image_base64)
        if len(image_bytes) > MAX_IMAGE_SIZE_BYTES or len(image_bytes) == 0:
            return None

        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        return img
    except Exception:
        return None


def _verify_session_access(
    db: Session, session_id: uuid.UUID, current_user: User
) -> ClassSession:
    """
    Verify that the session exists and that current_user has authorization
    (either as the teacher owner of the classroom or an enrolled/participating student).
    """
    session = db.scalar(
        select(ClassSession)
        .options(joinedload(ClassSession.classroom))
        .where(ClassSession.id == session_id)
    )
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Class session not found."
        )

    if current_user.role == UserRole.TEACHER:
        if not current_user.teacher_profile or session.classroom.teacher_id != current_user.teacher_profile.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not authorized to access analytics for this session."
            )
    elif current_user.role == UserRole.STUDENT:
        if not current_user.student_profile:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Student profile required to access session analytics."
            )
        
        # Verify student is enrolled/participant or has an attendance record for this session
        is_participant = db.scalar(
            select(SessionParticipant).where(
                SessionParticipant.session_id == session_id,
                SessionParticipant.user_id == current_user.id,
            )
        )
        has_attendance = db.scalar(
            select(AttendanceRecord).where(
                AttendanceRecord.session_id == session_id,
                AttendanceRecord.student_id == current_user.student_profile.id,
            )
        )
        if not is_participant and not has_attendance:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not authorized to access analytics for this session."
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized role."
        )

    return session


@router.post("/sample-frame", response_model=FacialAnalysisResult)
def analyze_classroom_frame(
    data: FacialFrameInput,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Analyze a classroom video frame sample for facial pose, attentiveness, and distraction events.
    Persists interval analytics in PostgreSQL.
    """
    session = _verify_session_access(db, data.session_id, current_user)

    # Resolve student_id
    if current_user.role == UserRole.STUDENT:
        if not current_user.student_profile:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Student profile required for frame sampling."
            )
        target_student_id = current_user.student_profile.id
    else:
        if not data.student_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="student_id is required when teacher submits a frame."
            )
        target_student_id = data.student_id

    # Decode and process image
    frame_array = _decode_base64_image(data.image_base64)

    # Save exact captured frame to debug/ directory for visual diagnosis
    if frame_array is not None and frame_array.size > 0:
        try:
            import cv2
            debug_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "debug"))
            os.makedirs(debug_dir, exist_ok=True)
            if data.slot and ("sample" in data.slot.lower() or "1" in data.slot or "2" in data.slot or "3" in data.slot):
                filename = f"{data.slot}.jpg"
            else:
                c = getattr(analyze_classroom_frame, "_frame_counter", 1)
                filename = f"sample-{c}.jpg"
                analyze_classroom_frame._frame_counter = (c % 3) + 1
            file_path = os.path.join(debug_dir, filename)
            cv2.imwrite(file_path, frame_array)
            logger.info(f"[DIAGNOSTIC FRAME SAVE] Saved raw captured frame to {file_path} (shape: {frame_array.shape})")
        except Exception as save_err:
            logger.warning(f"[DIAGNOSTIC FRAME SAVE ERROR] Could not save frame: {save_err}")

    analysis_res = analytics_service.process_facial_frame(frame_array)

    # Persist FacialAnalysis record
    now = data.timestamp or datetime.now(timezone.utc)
    head_pose_str = analysis_res.head_pose.orientation if analysis_res.head_pose else "frontal"

    fa_record = FacialAnalysis(
        session_id=session.id,
        student_id=target_student_id,
        sampled_at=now,
        dominant_emotion=analysis_res.dominant_emotion,
        attentiveness_score=analysis_res.attentiveness_score,
        head_pose=head_pose_str,
        emotion_probabilities=analysis_res.emotion_probabilities,
    )
    db.add(fa_record)

    # Persist DistractionEvent record if distraction detected
    if analysis_res.is_distracted:
        distraction_record = DistractionEvent(
            session_id=session.id,
            student_id=target_student_id,
            event_type=analysis_res.distraction_type or "inattentive",
            duration_seconds=5.0,
            timestamp=now,
        )
        db.add(distraction_record)

    # Update or insert EngagementMetric
    attentiveness_sub = analysis_res.attentiveness_score * 100.0
    comp_score = analytics_service.calculate_composite_engagement(
        attentiveness_subscore=attentiveness_sub
    )

    eng_record = EngagementMetric(
        session_id=session.id,
        student_id=target_student_id,
        engagement_score=comp_score,
        attentiveness_subscore=attentiveness_sub,
        timestamp=now,
    )
    db.add(eng_record)

    db.commit()

    # Diagnostic logging
    raw_dom = getattr(analysis_res, 'raw_dominant', analysis_res.dominant_emotion)
    bbox = getattr(analysis_res, 'face_bbox', 'N/A')
    crop_dim = getattr(analysis_res, 'crop_dimensions', 'N/A')
    is_unc = (analysis_res.dominant_emotion == 'uncertain')

    print(f"\n==================== [DIAGNOSTIC SAMPLE FRAME] ====================", flush=True)
    print(f"1. Timestamp: {now.isoformat()}", flush=True)
    print(f"2. Face Detected: {analysis_res.face_detected}", flush=True)
    print(f"3. Bounding Box: {bbox} | Crop Dimensions: {crop_dim}", flush=True)
    print(f"4. FERPlus Raw Probabilities: {analysis_res.emotion_probabilities}", flush=True)
    print(f"5. Top Predicted Raw Class: {raw_dom}", flush=True)
    print(f"6. Top Prediction Confidence: {analysis_res.confidence}", flush=True)
    print(f"7. App Dominant Emotion: {analysis_res.dominant_emotion}", flush=True)
    print(f"8. Marked Uncertain: {is_unc}", flush=True)
    print(f"9. Persisted to facial_analyses: True", flush=True)
    print(f"10. DB Stored emotion_probabilities: {fa_record.emotion_probabilities}", flush=True)
    print(f"===================================================================\n", flush=True)

    return analysis_res


@router.post("/sentiment", response_model=SentimentAnalysisResult)
def analyze_text_sentiment(
    data: TextSentimentInput,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Analyze student chat message or transcript snippet for sentiment and question intent.
    Persists analysis record in PostgreSQL.
    """
    session = _verify_session_access(db, data.session_id, current_user)

    target_user_id = current_user.id if current_user.role == UserRole.STUDENT else (data.user_id or current_user.id)

    # Run sentiment analysis
    analysis_res = analytics_service.process_text_sentiment(data.text, language=data.language)

    now = data.timestamp or datetime.now(timezone.utc)
    sentiment_record = SentimentAnalysis(
        session_id=session.id,
        user_id=target_user_id,
        sentiment_score=analysis_res.sentiment_score,
        text_content=analysis_res.text,
        sentiment_label=analysis_res.sentiment_label,
        created_at=now,
    )
    db.add(sentiment_record)

    # If user is a student and sentiment score is available, update their engagement metric
    if current_user.role == UserRole.STUDENT and current_user.student_profile and analysis_res.sentiment_score is not None:
        sentiment_sub = analytics_service.normalize_sentiment_to_subscore(analysis_res.sentiment_score)
        eng_record = EngagementMetric(
            session_id=session.id,
            student_id=current_user.student_profile.id,
            engagement_score=sentiment_sub,
            sentiment_subscore=sentiment_sub,
            timestamp=now,
        )
        db.add(eng_record)

    db.commit()
    return analysis_res


@router.get("/session/{session_id}/student/{student_id}", response_model=StudentEngagementSummary)
def get_student_session_analytics(
    session_id: uuid.UUID,
    student_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Retrieve engagement summary and subscores for a specific student in a class session.
    """
    session = _verify_session_access(db, session_id, current_user)

    # Authorization check: student can only view their own summary
    if current_user.role == UserRole.STUDENT:
        if not current_user.student_profile or current_user.student_profile.id != student_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Students can only view their own engagement analytics."
            )

    # Query facial analyses
    fa_records = db.scalars(
        select(FacialAnalysis)
        .where(
            FacialAnalysis.session_id == session_id,
            FacialAnalysis.student_id == student_id,
        )
    ).all()

    # Query distraction count
    distractions = db.scalars(
        select(func.count(DistractionEvent.id))
        .where(
            DistractionEvent.session_id == session_id,
            DistractionEvent.student_id == student_id,
        )
    ).one() or 0

    # Calculate average attentiveness subscore (0 to 100)
    attentiveness_sub: Optional[float] = None
    if fa_records:
        valid_scores = [r.attentiveness_score for r in fa_records if r.attentiveness_score is not None]
        if valid_scores:
            attentiveness_sub = round((sum(valid_scores) / len(valid_scores)) * 100.0, 2)

    # Query student profile and user details
    student_profile = db.scalar(
        select(StudentProfile)
        .options(joinedload(StudentProfile.user))
        .where(StudentProfile.id == student_id)
    )
    student_name = student_profile.user.full_name if (student_profile and student_profile.user) else None
    student_email = student_profile.user.email if (student_profile and student_profile.user) else None
    student_id_number = student_profile.student_id_number if student_profile else None

    # Query sentiment analyses
    sentiment_sub: Optional[float] = None
    question_count = 0

    if student_profile:
        sent_records = db.scalars(
            select(SentimentAnalysis)
            .where(
                SentimentAnalysis.session_id == session_id,
                SentimentAnalysis.user_id == student_profile.user_id,
            )
        ).all()
        if sent_records:
            scores = [r.sentiment_score for r in sent_records if r.sentiment_score is not None]
            if scores:
                avg_sent = sum(scores) / len(scores)
                sentiment_sub = analytics_service.normalize_sentiment_to_subscore(avg_sent)

            question_count = sum(1 for r in sent_records if r.sentiment_label == "confused" or (r.text_content and "?" in r.text_content))

    # Participation subscore based on sample frequency
    participation_sub: Optional[float] = None
    sample_count = len(fa_records)
    if sample_count > 0:
        participation_sub = round(min(100.0, (sample_count / 10.0) * 100.0), 2)

    # Fetch student's speech transcripts (strictly student speech, excluding teacher)
    speech_records = []
    if student_profile:
        speech_records = db.scalars(
            select(SpeechAnalysis)
            .join(SessionParticipant, SpeechAnalysis.participant_id == SessionParticipant.id)
            .where(
                SpeechAnalysis.session_id == session_id,
                SessionParticipant.user_id == student_profile.user_id,
                SessionParticipant.role == UserRole.STUDENT,
            )
            .order_by(SpeechAnalysis.sampled_at.desc())
        ).all()

    student_speech_summary = analytics_service.aggregate_student_speech_sentiment(
        records=speech_records,
        student_id=student_id,
    )

    # Aggregate facial expression observations across the session
    session_start = session.actual_start_time or session.created_at
    student_facial_summary = analytics_service.aggregate_student_session_facial_emotion(
        samples=fa_records,
        student_id=student_id,
        session_start=session_start,
    )

    # Calculate composite engagement score
    composite_score = analytics_service.calculate_composite_engagement(
        attentiveness_subscore=attentiveness_sub,
        participation_subscore=participation_sub,
        sentiment_subscore=sentiment_sub,
    )

    return StudentEngagementSummary(
        student_id=student_id,
        session_id=session_id,
        student_name=student_name,
        student_email=student_email,
        student_id_number=student_id_number,
        composite_score=composite_score,
        attentiveness_subscore=attentiveness_sub,
        participation_subscore=participation_sub,
        sentiment_subscore=sentiment_sub,
        sample_count=sample_count,
        distraction_count=distractions,
        question_count=question_count,
        speech_sentiment=student_speech_summary,
        facial_summary=student_facial_summary,
    )


@router.get("/session/{session_id}/overview", response_model=SessionAnalyticsOverview)
def get_session_analytics_overview(
    session_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Retrieve session-wide engagement analytics overview, attendance rate, total distractions,
    and individual student summaries. (TEACHER ONLY)
    """
    if current_user.role != UserRole.TEACHER or not current_user.teacher_profile:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can access session overview analytics."
        )

    session = _verify_session_access(db, session_id, current_user)

    # Fetch total attendance records for attendance rate calculation
    att_records = db.scalars(
        select(AttendanceRecord).where(AttendanceRecord.session_id == session_id)
    ).all()
    total_students = len(att_records)
    present_count = sum(1 for r in att_records if r.status in ["PRESENT", "LATE", "VERIFIED_FACE"])
    attendance_rate = round((present_count / total_students * 100.0), 2) if total_students > 0 else 0.0

    # Fetch total distractions in session
    total_distractions = db.scalar(
        select(func.count(DistractionEvent.id)).where(DistractionEvent.session_id == session_id)
    ) or 0

    # Fetch total questions in session
    sent_records = db.scalars(
        select(SentimentAnalysis).where(SentimentAnalysis.session_id == session_id)
    ).all()
    total_questions = sum(1 for r in sent_records if r.sentiment_label == "confused" or (r.text_content and "?" in r.text_content))

    # Discover all student IDs that participated in this session:
    # 1. Session participants with STUDENT role
    part_student_ids = db.scalars(
        select(StudentProfile.id)
        .join(User, StudentProfile.user_id == User.id)
        .join(SessionParticipant, SessionParticipant.user_id == User.id)
        .where(
            SessionParticipant.session_id == session_id,
            SessionParticipant.role == UserRole.STUDENT,
        )
    ).all()

    # 2. Students with attendance records in this session
    att_student_ids = db.scalars(
        select(AttendanceRecord.student_id).where(AttendanceRecord.session_id == session_id)
    ).all()

    # 3. Students with facial analysis samples in this session
    fa_student_ids = db.scalars(
        select(FacialAnalysis.student_id).where(FacialAnalysis.session_id == session_id)
    ).all()

    # 4. Students with speech analysis records in this session (joined through SessionParticipant)
    speech_student_ids = db.scalars(
        select(StudentProfile.id)
        .join(User, StudentProfile.user_id == User.id)
        .join(SessionParticipant, SessionParticipant.user_id == User.id)
        .join(SpeechAnalysis, SpeechAnalysis.participant_id == SessionParticipant.id)
        .where(
            SpeechAnalysis.session_id == session_id,
            SessionParticipant.role == UserRole.STUDENT,
        )
    ).all()

    # Deterministic deduplicated list of participating students
    participating_student_ids = list(dict.fromkeys(
        list(part_student_ids) + list(att_student_ids) + list(fa_student_ids) + list(speech_student_ids)
    ))

    # Fetch individual student engagement summaries
    student_summaries: List[StudentEngagementSummary] = []
    engagement_scores: List[float] = []

    for s_id in participating_student_ids:
        summary = get_student_session_analytics(
            session_id=session_id,
            student_id=s_id,
            current_user=current_user,
            db=db,
        )
        student_summaries.append(summary)
        if summary.composite_score is not None:
            engagement_scores.append(summary.composite_score)

    avg_engagement = round(sum(engagement_scores) / len(engagement_scores), 2) if engagement_scores else 0.0

    # Upsert ClassReport record
    existing_report = db.scalar(select(ClassReport).where(ClassReport.session_id == session_id))
    summary_text = (
        f"Session '{session.title}' conducted with {attendance_rate}% attendance rate. "
        f"Average class engagement score: {avg_engagement}%. Total distractions logged: {total_distractions}."
    )
    if existing_report:
        existing_report.average_engagement = avg_engagement
        existing_report.total_distractions = total_distractions
        existing_report.summary_text = summary_text
    else:
        new_report = ClassReport(
            session_id=session_id,
            summary_text=summary_text,
            average_engagement=avg_engagement,
            total_distractions=total_distractions,
        )
        db.add(new_report)

    db.commit()

    # Fetch all speech records for STUDENTS in this session (excluding teacher speech)
    classroom_speech_records = db.scalars(
        select(SpeechAnalysis)
        .join(SessionParticipant, SpeechAnalysis.participant_id == SessionParticipant.id)
        .where(
            SpeechAnalysis.session_id == session_id,
            SessionParticipant.role == UserRole.STUDENT,
        )
        .order_by(SpeechAnalysis.sampled_at.desc())
    ).all()

    classroom_speech_summary = analytics_service.aggregate_classroom_speech_sentiment(
        session_id=session_id,
        records=classroom_speech_records,
    )

    return SessionAnalyticsOverview(
        session_id=session_id,
        average_engagement=avg_engagement,
        attendance_rate=attendance_rate,
        total_distractions=total_distractions,
        total_questions=total_questions,
        student_summaries=student_summaries,
        classroom_speech_sentiment=classroom_speech_summary,
    )


@router.get("/session/{session_id}/facial-window", response_model=FacialWindowAnalytics)
def get_classroom_facial_window_analytics(
    session_id: uuid.UUID,
    window_time: Optional[datetime] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Retrieve 5-minute window classroom facial expression analytics.
    (TEACHER ONLY for classroom-wide aggregation)
    """
    if current_user.role != UserRole.TEACHER or not current_user.teacher_profile:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can access classroom-wide facial expression analytics."
        )
    session = _verify_session_access(db, session_id, current_user)

    session_start = session.actual_start_time or session.created_at
    target_time = window_time
    if target_time is None and (session.status == SessionStatus.COMPLETED or session.actual_end_time):
        target_time = session.actual_end_time or session_start
    w_start, w_end = get_window_bounds(session_start, target_time)

    participants = db.scalars(
        select(SessionParticipant.user_id).where(SessionParticipant.session_id == session_id)
    ).all()
    att_student_ids = db.scalars(
        select(AttendanceRecord.student_id).where(AttendanceRecord.session_id == session_id)
    ).all()

    student_profiles = db.scalars(
        select(StudentProfile).where(
            (StudentProfile.id.in_(att_student_ids)) | (StudentProfile.user_id.in_(participants))
        )
    ).all()

    student_results = []
    for sp in student_profiles:
        samples = db.scalars(
            select(FacialAnalysis).where(
                FacialAnalysis.session_id == session_id,
                FacialAnalysis.student_id == sp.id,
                FacialAnalysis.sampled_at >= w_start,
                FacialAnalysis.sampled_at < w_end,
            )
        ).all()
        stu_res = analytics_service.aggregate_student_window_facial_emotion(samples)
        student_results.append(stu_res)

    class_res = analytics_service.aggregate_classroom_window_facial_emotion(student_results)

    return FacialWindowAnalytics(
        window_start=w_start,
        window_end=w_end,
        dominant_expression=class_res["dominant_expression"],
        expression_distribution=class_res["expression_distribution"],
        students_analyzed=class_res["total_students"],
        students_with_valid_expression=class_res["students_with_valid_expression"],
        students_with_insufficient_data=class_res["students_with_insufficient_data"],
    )


@router.get("/session/{session_id}/student/{student_id}/facial-window", response_model=StudentFacialWindowAnalytics)
def get_student_facial_window_analytics(
    session_id: uuid.UUID,
    student_id: uuid.UUID,
    window_time: Optional[datetime] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Retrieve 5-minute window personal facial expression analytics for a specific student.
    Students may access ONLY their own student_id.
    """
    session = _verify_session_access(db, session_id, current_user)

    if current_user.role == UserRole.STUDENT:
        if not current_user.student_profile or current_user.student_profile.id != student_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Students can only view their own facial analytics."
            )

    session_start = session.actual_start_time or session.created_at
    target_time = window_time
    if target_time is None and (session.status == SessionStatus.COMPLETED or session.actual_end_time):
        target_time = session.actual_end_time or session_start
    w_start, w_end = get_window_bounds(session_start, target_time)

    samples = db.scalars(
        select(FacialAnalysis).where(
            FacialAnalysis.session_id == session_id,
            FacialAnalysis.student_id == student_id,
            FacialAnalysis.sampled_at >= w_start,
            FacialAnalysis.sampled_at < w_end,
        )
    ).all()

    stu_res = analytics_service.aggregate_student_window_facial_emotion(samples)

    return StudentFacialWindowAnalytics(
        window_start=w_start,
        window_end=w_end,
        student_id=student_id,
        dominant_expression=stu_res["dominant_expression"],
        confidence=stu_res["confidence"],
        sample_count=stu_res["sample_count"],
        valid_sample_count=stu_res["valid_sample_count"],
        expression_probabilities=stu_res["expression_probabilities"],
    )


@router.get("/session/{session_id}/facial-summary", response_model=SessionFacialSummary)
def get_session_facial_summary(
    session_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Retrieve session-wide facial expression summary aggregated across 5-minute windows.
    """
    session = _verify_session_access(db, session_id, current_user)

    session_start = session.actual_start_time or session.created_at
    session_end = session.actual_end_time or datetime.now(timezone.utc)

    total_seconds = max(300.0, (session_end - session_start).total_seconds())
    num_windows = int(math.ceil(total_seconds / 300.0))

    participants = db.scalars(
        select(SessionParticipant.user_id).where(SessionParticipant.session_id == session_id)
    ).all()
    att_student_ids = db.scalars(
        select(AttendanceRecord.student_id).where(AttendanceRecord.session_id == session_id)
    ).all()
    student_profiles = db.scalars(
        select(StudentProfile).where(
            (StudentProfile.id.in_(att_student_ids)) | (StudentProfile.user_id.in_(participants))
        )
    ).all()

    window_results = []
    for i in range(num_windows):
        w_start = session_start + timedelta(seconds=i * 300)
        w_end = w_start + timedelta(seconds=300)

        student_results = []
        for sp in student_profiles:
            samples = db.scalars(
                select(FacialAnalysis).where(
                    FacialAnalysis.session_id == session_id,
                    FacialAnalysis.student_id == sp.id,
                    FacialAnalysis.sampled_at >= w_start,
                    FacialAnalysis.sampled_at < w_end,
                )
            ).all()
            stu_res = analytics_service.aggregate_student_window_facial_emotion(samples)
            student_results.append(stu_res)

        class_res = analytics_service.aggregate_classroom_window_facial_emotion(student_results)
        window_results.append(class_res)

    session_res = analytics_service.aggregate_session_facial_emotion(window_results)

    return SessionFacialSummary(
        session_id=session_id,
        dominant_expression=session_res["dominant_expression"],
        expression_distribution=session_res["expression_distribution"],
        total_windows=session_res["total_windows"],
        valid_windows=session_res["valid_windows"],
    )
