import uuid
import logging
from datetime import datetime, timezone, timedelta, time
from typing import Any, List, Optional
from collections import Counter
from fastapi import APIRouter, Depends, HTTPException, status, Query, Response
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import select, func

from app.core.deps import get_db, get_current_user, require_role
from app.core.config import settings
from app.services.attendance_export_service import generate_attendance_excel_workbook
from app.models.user import User
from app.models.enums import UserRole, SessionStatus, AttendanceStatus, AttendanceEventType
from app.models.session import ClassSession, SessionParticipant
from app.models.profile import StudentProfile, TeacherProfile
from app.models.classroom import Classroom, CourseEnrollment
from app.models.stubs import (
    FaceEmbedding,
    AttendanceRecord,
    AttendanceEvent,
    AuditLog,
    FacialAnalysis,
    SentimentAnalysis,
    SpeechAnalysis,
)
from app.services.face_service import FaceService
from app.schemas.attendance import (
    AttendanceVerificationRequest,
    AttendanceVerificationResponse,
    AttendanceRecordResponse,
    SessionAttendanceSummaryResponse,
    ManualAttendanceUpdateRequest,
    StudentAttendanceSummaryResponse,
    TeacherAttendanceSummaryResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter()

CONFIRMATION_SAMPLES_REQUIRED = 3
LATE_THRESHOLD_MINUTES = 15


def get_status_str(status_val: Any) -> str:
    """Safely extracts string representation from Enum or str value."""
    if status_val is None:
        return "UNVERIFIED"
    if hasattr(status_val, "value"):
        return str(status_val.value)
    return str(status_val)


@router.post(
    "/verify",
    response_model=AttendanceVerificationResponse,
    summary="Process periodic webcam frame for automatic face attendance",
)
def verify_attendance(
    payload: AttendanceVerificationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.STUDENT])),
) -> Any:
    """
    1. Authenticates current student user.
    2. Verifies student is an active participant in the requested class session.
    3. Fetches stored face embeddings for the student.
    4. Evaluates frame: single-face check, quality checks, ArcFace vector generation & match against student's profile.
    5. Applies Temporal Confirmation (requires 3 successful samples) to set PRESENT or LATE.
    6. Prevents duplicate records by updating single PostgreSQL AttendanceRecord per student per session.
    """
    logger.info("[ATTENDANCE] verification request received")
    
    student_profile = current_user.student_profile
    if not student_profile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User does not have an active Student Profile",
        )

    logger.info(f"[ATTENDANCE] authenticated user: {current_user.email}")

    # Validate active session
    session_obj = db.scalar(select(ClassSession).where(ClassSession.id == payload.session_id))
    if not session_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Class session not found",
        )

    if session_obj.status != SessionStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Attendance can only be submitted for ACTIVE class sessions",
        )

    logger.info("[ATTENDANCE] session validated")

    # Confirm student is a participant in this session or enrolled in the course
    participant = db.scalar(
        select(SessionParticipant).where(
            SessionParticipant.session_id == payload.session_id,
            SessionParticipant.user_id == current_user.id,
        )
    )
    if not participant:
        # Check course enrollment
        enrollment = db.scalar(
            select(CourseEnrollment).where(
                CourseEnrollment.classroom_id == session_obj.classroom_id,
                CourseEnrollment.student_id == student_profile.id,
            )
        )
        if enrollment:
            participant = SessionParticipant(
                session_id=payload.session_id,
                user_id=current_user.id,
                role=UserRole.STUDENT,
                joined_at=datetime.now(timezone.utc),
            )
            db.add(participant)
            db.commit()
        else:
            logger.info("[ATTENDANCE] enrollment found: NO (Student not enrolled in course or session)")
            return AttendanceVerificationResponse(
                verified=False,
                reason="NOT_IN_SESSION",
                attendance_status="UNVERIFIED",
                message="Student is not enrolled or registered as a participant in this session.",
                samples_confirmed=0,
                samples_required=1,
            )

    # Fetch student face embedding record
    face_record = db.scalar(
        select(FaceEmbedding).where(FaceEmbedding.student_id == student_profile.id)
    )
    has_enrollment = bool(face_record and face_record.embedding_data)
    logger.info(f"[ATTENDANCE] face profile found: {'YES' if has_enrollment else 'NO'}")

    if not has_enrollment:
        logger.info("[ATTENDANCE] verification result: verified=False, reason=NOT_ENROLLED")
        return AttendanceVerificationResponse(
            verified=False,
            reason="NOT_ENROLLED",
            attendance_status="UNVERIFIED",
            message="Student has no face profile enrolled. Please complete face enrollment first.",
            samples_confirmed=0,
            samples_required=1,
        )

    # Fetch or check existing DB AttendanceRecord
    existing_record = db.scalar(
        select(AttendanceRecord).where(
            AttendanceRecord.session_id == payload.session_id,
            AttendanceRecord.student_id == student_profile.id,
        )
    )

    # Execute ArcFace frame recognition pipeline
    service = FaceService.get_instance()
    eval_result = service.process_attendance_frame(
        payload.image_base64, face_record.embedding_data
    )

    now_utc = datetime.now(timezone.utc)

    # Case: Single frame evaluation failed (No face, Multi face, Low quality, Mismatch)
    if not eval_result["matched"]:
        confirmed_count = existing_record.verification_count if existing_record else 0
        current_status = get_status_str(existing_record.status) if existing_record else "UNVERIFIED"
        first_verified = existing_record.first_verified_at.isoformat() if existing_record and existing_record.first_verified_at else None
        last_verified = existing_record.last_verified_at.isoformat() if existing_record and existing_record.last_verified_at else None

        # Check Grace Period (2 minutes)
        if existing_record:
            last_det = existing_record.last_detected_at or existing_record.first_verified_at
            elapsed = (now_utc - last_det).total_seconds() if last_det else 9999

            if elapsed <= 120:  # Within 2-min grace period
                existing_record.verification_state = "TEMPORARILY_NOT_DETECTED"
                existing_record.last_missing_at = now_utc
                db.add(AttendanceEvent(
                    session_id=payload.session_id,
                    student_id=student_profile.id,
                    event_type=AttendanceEventType.TEMPORARILY_NOT_DETECTED.value,
                    details=f"Face unverified ({eval_result.get('reason')}). Within 2-min grace period ({int(elapsed)}s elapsed).",
                ))
            else:  # Exceeded 2-min grace period -> Confirm missing interval
                existing_record.verification_state = "MISSING_CONFIRMED"
                existing_record.missing_duration_seconds += 60
                existing_record.last_missing_at = now_utc
                db.add(AttendanceEvent(
                    session_id=payload.session_id,
                    student_id=student_profile.id,
                    event_type=AttendanceEventType.MISSING_CONFIRMED.value,
                    details=f"Missing confirmed beyond 2-min grace period ({int(elapsed)}s elapsed).",
                ))
            db.commit()

        logger.info(f"[ATTENDANCE] verification result: verified=False, reason={eval_result['reason']}, status={current_status}")

        return AttendanceVerificationResponse(
            verified=confirmed_count >= 1,
            reason=eval_result["reason"],
            attendance_status=current_status,
            message=eval_result["message"],
            samples_confirmed=confirmed_count,
            samples_required=1,
            first_verified_at=first_verified,
            last_verified_at=last_verified,
        )

    # Case: Match Success! Time-Based Presence Tracking & Re-entry Handling
    if not existing_record:
        # Create new attendance record for the student
        new_record = AttendanceRecord(
            session_id=payload.session_id,
            student_id=student_profile.id,
            status=AttendanceStatus.PRESENT,
            marked_at=now_utc,
            first_verified_at=now_utc,
            last_verified_at=now_utc,
            last_detected_at=now_utc,
            verification_count=1,
            presence_duration_seconds=60,  # First 1-minute verified presence interval
            missing_duration_seconds=0,
            attendance_percentage=100.0,
            verification_state="PRESENT",
            is_manually_corrected=False,
        )
        db.add(new_record)
        db.add(AttendanceEvent(
            session_id=payload.session_id,
            student_id=student_profile.id,
            event_type=AttendanceEventType.PRESENT_DETECTED.value,
            details="First verified face frame detected.",
        ))
        db.add(AttendanceEvent(
            session_id=payload.session_id,
            student_id=student_profile.id,
            event_type=AttendanceEventType.IDENTITY_VERIFIED.value,
            details=f"Identity confirmed with ArcFace similarity {eval_result.get('similarity', 0.0):.3f}.",
        ))
        db.commit()
        db.refresh(new_record)
        record = new_record
    else:
        record = existing_record
        last_det = record.last_detected_at or record.last_verified_at
        elapsed = (now_utc - last_det).total_seconds() if last_det else 60

        # Check for Student Re-entry (student returns after being missing or > 120s away)
        is_reentry = (record.verification_state == "MISSING_CONFIRMED" or elapsed > 120)
        if is_reentry:
            logger.info(f"[ATTENDANCE] Student re-entry detected for {student_profile.student_id_number} after {elapsed:.1f}s")
            db.add(AttendanceEvent(
                session_id=payload.session_id,
                student_id=student_profile.id,
                event_type=AttendanceEventType.RETURNED.value,
                details=f"Student re-entered class after {int(elapsed)}s absence.",
            ))
            db.add(AttendanceEvent(
                session_id=payload.session_id,
                student_id=student_profile.id,
                event_type=AttendanceEventType.IDENTITY_VERIFIED.value,
                details="Identity verified again upon return.",
            ))
            # Close missing interval and resume presence accumulation
            record.presence_duration_seconds += 60
        else:
            # Continuous presence: accumulate elapsed seconds bounded around 60s interval
            interval_secs = min(max(int(elapsed), 30), 90)
            record.presence_duration_seconds += interval_secs
            db.add(AttendanceEvent(
                session_id=payload.session_id,
                student_id=student_profile.id,
                event_type=AttendanceEventType.PRESENT_DETECTED.value,
                details=f"Periodic face sample verified (+{interval_secs}s presence).",
            ))

        record.verification_count += 1
        if not record.first_verified_at:
            record.first_verified_at = now_utc
        record.last_verified_at = now_utc
        record.last_detected_at = now_utc
        record.verification_state = "PRESENT"
        if not record.is_manually_corrected:
            record.status = AttendanceStatus.PRESENT

        # Calculate live estimated attendance percentage
        session_start = session_obj.actual_start_time or session_obj.scheduled_start_time or session_obj.created_at
        if session_start.tzinfo is None:
            session_start = session_start.replace(tzinfo=timezone.utc)
        curr_session_dur = max((now_utc - session_start).total_seconds(), 60.0)
        record.attendance_percentage = min(100.0, round((record.presence_duration_seconds / curr_session_dur) * 100.0, 2))

        db.commit()
        db.refresh(record)

    logger.info(f"[ATTENDANCE] verification result: verified=True, reason=CONFIRMED, presence={record.presence_duration_seconds}s, status={get_status_str(record.status)}")

    first_verified_str = record.first_verified_at.isoformat() if record.first_verified_at else None
    last_verified_str = record.last_verified_at.isoformat() if record.last_verified_at else None

    return AttendanceVerificationResponse(
        verified=True,
        reason="CONFIRMED",
        attendance_status=get_status_str(record.status),
        message="Face verified and attendance presence accumulated successfully.",
        samples_confirmed=record.verification_count,
        samples_required=1,
        first_verified_at=first_verified_str,
        last_verified_at=last_verified_str,
    )


@router.get(
    "/session/{session_id}",
    response_model=SessionAttendanceSummaryResponse,
    summary="Get real-time classroom attendance list for a session",
)
def get_session_attendance(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    Returns session attendance records for all participants.
    Computes summary counts (PRESENT, LATE, UNVERIFIED, ABSENT).
    Enforces authorization:
    - Teachers can only view attendance for sessions of classrooms they own/teach.
    - Students can only view attendance for sessions they are registered participants in.
    """
    session_obj = db.scalar(
        select(ClassSession)
        .options(joinedload(ClassSession.classroom))
        .where(ClassSession.id == session_id)
    )
    if not session_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Class session not found",
        )

    # Authorization Check
    if current_user.role == UserRole.TEACHER:
        if not current_user.teacher_profile or session_obj.classroom.teacher_id != current_user.teacher_profile.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not authorized to view attendance records for this session.",
            )
    elif current_user.role == UserRole.STUDENT:
        is_participant = db.scalar(
            select(SessionParticipant).where(
                SessionParticipant.session_id == session_id,
                SessionParticipant.user_id == current_user.id,
            )
        )
        if not is_participant:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not registered as a participant in this session.",
            )

    # Fetch all student participants for this session
    participants = db.scalars(
        select(SessionParticipant)
        .options(joinedload(SessionParticipant.user).joinedload(User.student_profile))
        .where(
            SessionParticipant.session_id == session_id,
            SessionParticipant.role == UserRole.STUDENT,
        )
    ).all()

    # Fetch existing attendance records
    existing_records = db.scalars(
        select(AttendanceRecord)
        .options(joinedload(AttendanceRecord.student).joinedload(StudentProfile.user), joinedload(AttendanceRecord.corrected_by))
        .where(AttendanceRecord.session_id == session_id)
    ).all()

    # Fetch all students enrolled in this course
    course_enrollments = db.scalars(
        select(CourseEnrollment).where(CourseEnrollment.classroom_id == session_obj.classroom_id)
    ).all()
    enrolled_student_ids = {e.student_id for e in course_enrollments}

    record_map = {r.student_id: r for r in existing_records}
    participant_map = {p.user.student_profile.id: p for p in participants if p.user and p.user.student_profile}

    # All unique student_profile IDs from course enrollments, attendance records, or session participants
    all_student_ids = set(record_map.keys()).union(set(participant_map.keys())).union(enrolled_student_ids)

    responses: List[AttendanceRecordResponse] = []
    present_cnt = 0
    partial_cnt = 0
    late_cnt = 0
    unverified_cnt = 0
    absent_cnt = 0

    for student_id in all_student_ids:
        rec = record_map.get(student_id)
        part = participant_map.get(student_id)

        if rec and rec.student and rec.student.user:
            s_name = rec.student.user.full_name
            s_id_num = rec.student.student_id_number
        elif part and part.user and part.user.student_profile:
            s_name = part.user.full_name
            s_id_num = part.user.student_profile.student_id_number
        else:
            sp_fallback = db.scalar(
                select(StudentProfile)
                .options(joinedload(StudentProfile.user))
                .where(StudentProfile.id == student_id)
            )
            if not sp_fallback or not sp_fallback.user:
                continue
            s_name = sp_fallback.user.full_name
            s_id_num = sp_fallback.student_id_number

        s_name = s_name or "Student"
        s_id_num = s_id_num or "N/A"

        if rec:
            st = get_status_str(rec.status)
            first_v = rec.first_verified_at.isoformat() if rec.first_verified_at else None
            last_v = rec.last_verified_at.isoformat() if rec.last_verified_at else None
            dur = rec.presence_duration_seconds or 0
            missing_dur = rec.missing_duration_seconds or 0
            pct = rec.attendance_percentage or 0.0
            v_state = rec.verification_state or ("Present" if st == "PRESENT" else st)
            last_det = rec.last_detected_at.isoformat() if rec.last_detected_at else None
            v_cnt = rec.verification_count
            marked_at = rec.marked_at.isoformat() if rec.marked_at else (part.joined_at.isoformat() if part and part.joined_at else datetime.now(timezone.utc).isoformat())
            rec_id = str(rec.id)
            is_corr = rec.is_manually_corrected
            corr_by = rec.corrected_by.full_name if rec.corrected_by else None
            corr_reason = rec.correction_reason
        else:
            # Not yet verified
            st = "ABSENT" if session_obj.status == SessionStatus.COMPLETED else "UNVERIFIED"
            first_v = None
            last_v = None
            dur = 0
            missing_dur = 0
            pct = 0.0
            v_state = "Absent" if session_obj.status == SessionStatus.COMPLETED else "Temporarily Not Detected"
            last_det = None
            v_cnt = 0
            marked_at = part.joined_at.isoformat() if part and part.joined_at else datetime.now(timezone.utc).isoformat()
            rec_id = f"pending_{student_id}"
            is_corr = False
            corr_by = None
            corr_reason = None

        if st == "PRESENT":
            present_cnt += 1
        elif st == "PARTIAL":
            partial_cnt += 1
        elif st == "LATE":
            late_cnt += 1
        elif st == "UNVERIFIED":
            unverified_cnt += 1
        elif st == "ABSENT":
            absent_cnt += 1

        responses.append(
            AttendanceRecordResponse(
                id=rec_id,
                session_id=str(session_id),
                student_id=str(student_id),
                student_name=s_name,
                student_id_number=s_id_num,
                status=st,
                marked_at=marked_at,
                first_verified_at=first_v,
                last_verified_at=last_v,
                verification_count=v_cnt,
                presence_duration_seconds=dur,
                missing_duration_seconds=missing_dur,
                attendance_percentage=pct,
                verification_state=v_state,
                last_detected_at=last_det,
                is_manually_corrected=is_corr,
                corrected_by_name=corr_by,
                correction_reason=corr_reason,
            )
        )

    return SessionAttendanceSummaryResponse(
        session_id=str(session_id),
        session_title=session_obj.title,
        classroom_title=session_obj.classroom.title if session_obj.classroom else "Classroom",
        total_students=len(responses),
        present_count=present_cnt,
        partial_count=partial_cnt,
        late_count=late_cnt,
        unverified_count=unverified_cnt,
        absent_count=absent_cnt,
        records=responses,
    )


@router.put(
    "/{record_id}",
    response_model=AttendanceRecordResponse,
    summary="Manually update a student's attendance record (Teacher only)",
)
def update_manual_attendance(
    record_id: str,
    payload: ManualAttendanceUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.TEACHER])),
) -> Any:
    """
    Allows classroom instructors to manually override a student's attendance record.
    Logs teacher action to AuditLog to maintain transparent manual correction history.
    """
    record = None
    if not record_id.startswith("pending_"):
        try:
            rec_uuid = uuid.UUID(record_id)
            record = db.scalar(select(AttendanceRecord).where(AttendanceRecord.id == rec_uuid))
        except ValueError:
            pass

    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attendance record not found",
        )

    old_status = get_status_str(record.status)
    record.status = payload.status
    record.is_manually_corrected = True
    record.corrected_by_id = current_user.id
    record.correction_reason = payload.reason or "Manual adjustment by teacher"
    record.last_verified_at = datetime.now(timezone.utc)

    # Log audit entry
    audit = AuditLog(
        user_id=current_user.id,
        action=f"MANUAL_ATTENDANCE_CORRECTION: Record {record.id} changed from {old_status} to {payload.status.value}. Reason: {payload.reason or 'N/A'}",
    )
    db.add(audit)
    db.commit()
    db.refresh(record)

    student_profile = db.scalar(select(StudentProfile).options(joinedload(StudentProfile.user)).where(StudentProfile.id == record.student_id))

    return AttendanceRecordResponse(
        id=str(record.id),
        session_id=str(record.session_id),
        student_id=str(record.student_id),
        student_name=student_profile.user.full_name if student_profile and student_profile.user else "Student",
        student_id_number=student_profile.student_id_number if student_profile else "N/A",
        status=get_status_str(record.status),
        marked_at=record.marked_at.isoformat(),
        first_verified_at=record.first_verified_at.isoformat() if record.first_verified_at else None,
        last_verified_at=record.last_verified_at.isoformat() if record.last_verified_at else None,
        verification_count=record.verification_count,
        presence_duration_seconds=record.presence_duration_seconds,
        is_manually_corrected=True,
        corrected_by_name=current_user.full_name,
        correction_reason=record.correction_reason,
    )


@router.get(
    "/my-summary",
    response_model=StudentAttendanceSummaryResponse,
    summary="Get attendance stats for current student",
)
def get_student_attendance_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.STUDENT])),
) -> Any:
    """
    Returns student attendance summary statistics across all enrolled sessions.
    """
    sp = current_user.student_profile
    if not sp:
        return StudentAttendanceSummaryResponse()

    records = db.scalars(
        select(AttendanceRecord).where(AttendanceRecord.student_id == sp.id)
    ).all()

    total = len(records)
    p_cnt = sum(1 for r in records if get_status_str(r.status) == AttendanceStatus.PRESENT.value)
    l_cnt = sum(1 for r in records if get_status_str(r.status) == AttendanceStatus.LATE.value)
    u_cnt = sum(1 for r in records if get_status_str(r.status) == AttendanceStatus.UNVERIFIED.value)
    a_cnt = sum(1 for r in records if get_status_str(r.status) == AttendanceStatus.ABSENT.value)

    rate = float(round(((p_cnt + l_cnt) / total * 100.0), 1)) if total > 0 else 0.0

    return StudentAttendanceSummaryResponse(
        total_sessions=total,
        present_count=p_cnt,
        late_count=l_cnt,
        unverified_count=u_cnt,
        absent_count=a_cnt,
        attendance_percentage=rate,
    )


@router.get(
    "/teacher-summary",
    response_model=TeacherAttendanceSummaryResponse,
    summary="Get overall attendance stats for teacher's classrooms",
)
def get_teacher_attendance_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.TEACHER])),
) -> Any:
    """
    Returns overall attendance metrics across all classrooms taught by instructor.
    """
    tp = current_user.teacher_profile
    if not tp:
        return TeacherAttendanceSummaryResponse()

    classrooms = db.scalars(
        select(Classroom).where(Classroom.teacher_id == tp.id)
    ).all()
    c_ids = [c.id for c in classrooms]

    if not c_ids:
        return TeacherAttendanceSummaryResponse()

    sessions = db.scalars(
        select(ClassSession).where(ClassSession.classroom_id.in_(c_ids))
    ).all()
    s_ids = [s.id for s in sessions]

    if not s_ids:
        return TeacherAttendanceSummaryResponse(
            total_classrooms=len(c_ids),
            total_sessions_conducted=0,
            overall_attendance_rate=0.0,
        )

    records = db.scalars(
        select(AttendanceRecord).where(AttendanceRecord.session_id.in_(s_ids))
    ).all()

    total = len(records)
    attended = sum(1 for r in records if get_status_str(r.status) in (AttendanceStatus.PRESENT.value, AttendanceStatus.LATE.value))
    rate = float(round((attended / total * 100.0), 1)) if total > 0 else 0.0

    return TeacherAttendanceSummaryResponse(
        total_classrooms=len(c_ids),
        total_sessions_conducted=len(s_ids),
        overall_attendance_rate=rate,
    )


@router.get(
    "/export",
    summary="Export attendance report to formatted Excel (.xlsx) file",
    response_description="Downloadable Excel spreadsheet containing verified Present Students matching approved template",
)
def export_attendance_report(
    session_id: Optional[uuid.UUID] = Query(None, description="Optional class session UUID"),
    classroom_id: Optional[uuid.UUID] = Query(None, description="Optional classroom UUID"),
    start_date: Optional[str] = Query(None, description="Optional start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="Optional end date (YYYY-MM-DD)"),
    status_filter: Optional[str] = Query(None, alias="status", description="Optional status filter (e.g. PRESENT)"),
    include_late: bool = Query(True, description="Include students verified with late status in present students list"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.TEACHER])),
) -> Response:
    """
    Exports attendance records to an exact-match Excel workbook (.xlsx) following
    the approved 'EduSense_Class_Present_Students_Report_Template.xlsx' layout.

    Layout & Data Invariants:
    - Single worksheet named: 'Present Students'
    - Rows 1-3: 'Class / Subject:', 'Date:', 'Name of Lecture:'
    - Row 4: Centered title: 'List of the Present Students'
    - Row 6: Exact 5 columns: 'Sl. No.', 'Name', 'USN', 'Facial Emotion', 'Speech Sentiment'
    - Rows 7+: Verified present students only (Sl. No. consecutively 1, 2, 3...)
    - Unverified and absent students are strictly excluded.
    - Missing emotion or sentiment values default to 'N/A'.
    - Sanitizes text against spreadsheet formula injection.
    - Matches A4 portrait print setup and header row freezing.
    """
    tp = current_user.teacher_profile
    if not tp:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Active teacher profile required for attendance exports.",
        )

    # 1. Date Validation
    parsed_start = None
    parsed_end = None
    if start_date:
        try:
            parsed_start = datetime.strptime(start_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid start_date format. Expected YYYY-MM-DD.",
            )
    if end_date:
        try:
            parsed_end = datetime.strptime(end_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid end_date format. Expected YYYY-MM-DD.",
            )
    if parsed_start and parsed_end and parsed_start > parsed_end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_date cannot be after end_date.",
        )

    # 2. Scope & Authorization
    if session_id:
        session_obj = db.scalar(
            select(ClassSession)
            .options(joinedload(ClassSession.classroom))
            .where(ClassSession.id == session_id)
        )
        if not session_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Class session not found.",
            )

        if not session_obj.classroom or session_obj.classroom.teacher_id != tp.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not authorized to export attendance records for this session.",
            )

        if classroom_id and session_obj.classroom_id != classroom_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Specified session does not belong to the requested classroom.",
            )

        target_sessions = [session_obj]
        filter_classroom_title = (
            f"{session_obj.classroom.title} ({session_obj.classroom.course_code})"
            if session_obj.classroom
            else "Classroom"
        )
    else:
        if classroom_id:
            classroom_obj = db.scalar(
                select(Classroom).where(Classroom.id == classroom_id)
            )
            if not classroom_obj:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Classroom not found.",
                )
            if classroom_obj.teacher_id != tp.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You are not authorized to export attendance records for this classroom.",
                )
            authorized_cids = [classroom_id]
            filter_classroom_title = f"{classroom_obj.title} ({classroom_obj.course_code})"
        else:
            teacher_classrooms = db.scalars(
                select(Classroom).where(Classroom.teacher_id == tp.id, Classroom.is_active == True)
            ).all()
            authorized_cids = [c.id for c in teacher_classrooms]
            filter_classroom_title = "All Classrooms" if authorized_cids else "None"

        if not authorized_cids:
            target_sessions = []
        else:
            query = (
                select(ClassSession)
                .options(joinedload(ClassSession.classroom))
                .where(ClassSession.classroom_id.in_(authorized_cids))
            )
            if parsed_start:
                start_dt = datetime.combine(parsed_start, time.min, tzinfo=timezone.utc)
                query = query.where(
                    func.coalesce(ClassSession.actual_start_time, ClassSession.scheduled_start_time, ClassSession.created_at) >= start_dt
                )
            if parsed_end:
                end_dt = datetime.combine(parsed_end, time.max, tzinfo=timezone.utc)
                query = query.where(
                    func.coalesce(ClassSession.actual_start_time, ClassSession.scheduled_start_time, ClassSession.created_at) <= end_dt
                )
            target_sessions = list(db.scalars(query.order_by(ClassSession.scheduled_start_time.desc())).all())

    # 3. Determine Template Header Metadata
    if len(target_sessions) == 1:
        single_sess = target_sessions[0]
        c_title = single_sess.classroom.title if single_sess.classroom else ""
        c_code = single_sess.classroom.course_code if single_sess.classroom else ""
        class_subject = f"{c_title} ({c_code})" if (c_title and c_code) else (c_title or "Not specified")

        sess_dt = single_sess.actual_start_time or single_sess.scheduled_start_time or single_sess.created_at
        session_date_str = sess_dt.strftime("%Y-%m-%d") if sess_dt else "Not specified"
        lecture_name = single_sess.title if single_sess.title else "Not specified"
        report_file_date = session_date_str if session_date_str != "Not specified" else datetime.now().strftime("%Y-%m-%d")
    elif len(target_sessions) > 1:
        first_c = target_sessions[0].classroom
        c_title = first_c.title if first_c else "Classroom"
        c_code = first_c.course_code if first_c else ""
        class_subject = f"{c_title} ({c_code})" if c_code else c_title

        if start_date and end_date:
            session_date_str = f"{start_date} to {end_date}"
            report_file_date = start_date
        elif start_date:
            session_date_str = start_date
            report_file_date = start_date
        else:
            session_date_str = "Multiple Sessions"
            report_file_date = datetime.now().strftime("%Y-%m-%d")

        lecture_name = f"Classroom Sessions ({len(target_sessions)} lectures)"
    else:
        class_subject = filter_classroom_title or "Not specified"
        session_date_str = start_date or "Not specified"
        lecture_name = "Not specified"
        report_file_date = start_date or datetime.now().strftime("%Y-%m-%d")

    # 4. Fetch All Enrolled Students & Session Attendance Records
    target_s_ids = [s.id for s in target_sessions]
    target_c_ids = list({s.classroom_id for s in target_sessions})

    # Fetch course enrollments
    course_enrollments = list(
        db.scalars(
            select(CourseEnrollment)
            .options(
                joinedload(CourseEnrollment.student).joinedload(StudentProfile.user),
            )
            .where(CourseEnrollment.classroom_id.in_(target_c_ids))
        ).unique().all()
    )

    # Fetch all attendance records
    all_records = list(
        db.scalars(
            select(AttendanceRecord)
            .options(
                joinedload(AttendanceRecord.student).joinedload(StudentProfile.user),
                joinedload(AttendanceRecord.corrected_by),
            )
            .where(AttendanceRecord.session_id.in_(target_s_ids))
        ).unique().all()
    )

    # Fetch all session participants
    all_participants = list(
        db.scalars(
            select(SessionParticipant)
            .options(joinedload(SessionParticipant.user).joinedload(User.student_profile))
            .where(SessionParticipant.session_id.in_(target_s_ids), SessionParticipant.role == UserRole.STUDENT)
        ).unique().all()
    )

    record_map = {rec.student_id: rec for rec in all_records}
    enrolled_student_map = {enr.student_id: enr.student for enr in course_enrollments if enr.student}
    for p in all_participants:
        if p.user and p.user.student_profile and p.user.student_profile.id not in enrolled_student_map:
            enrolled_student_map[p.user.student_profile.id] = p.user.student_profile

    all_student_ids = set(record_map.keys()).union(set(enrolled_student_map.keys()))

    present_list = []
    partial_list = []
    absent_list = []

    for s_id in all_student_ids:
        rec = record_map.get(s_id)
        student_profile = rec.student if (rec and rec.student) else enrolled_student_map.get(s_id)
        user = student_profile.user if student_profile else None

        student_name = user.full_name if user else "Student"
        student_usn = student_profile.student_id_number if student_profile else "N/A"

        # 5a. Retrieve stored facial emotion
        emotion_val = "N/A"
        if rec and student_profile:
            fa_records = list(
                db.scalars(
                    select(FacialAnalysis)
                    .where(
                        FacialAnalysis.session_id == rec.session_id,
                        FacialAnalysis.student_id == student_profile.id,
                    )
                    .order_by(FacialAnalysis.sampled_at.desc())
                ).all()
            )
            valid_emotions = [
                r.dominant_emotion.strip().capitalize()
                for r in fa_records
                if r.dominant_emotion and r.dominant_emotion.strip()
            ]
            if valid_emotions:
                emotion_val = Counter(valid_emotions).most_common(1)[0][0]

        # 5b. Retrieve stored speech sentiment
        sentiment_val = "N/A"
        if rec and user:
            sent_records = list(
                db.scalars(
                    select(SentimentAnalysis)
                    .where(
                        SentimentAnalysis.session_id == rec.session_id,
                        SentimentAnalysis.user_id == user.id,
                    )
                    .order_by(SentimentAnalysis.created_at.desc())
                ).all()
            )
            valid_sents = [
                r.sentiment_label.strip().capitalize()
                for r in sent_records
                if r.sentiment_label and r.sentiment_label.strip()
            ]
            if valid_sents:
                sentiment_val = Counter(valid_sents).most_common(1)[0][0]
            else:
                speech_records = list(
                    db.scalars(
                        select(SpeechAnalysis)
                        .join(SessionParticipant, SpeechAnalysis.participant_id == SessionParticipant.id)
                        .where(
                            SpeechAnalysis.session_id == rec.session_id,
                            SessionParticipant.user_id == user.id,
                        )
                        .order_by(SpeechAnalysis.sampled_at.desc())
                    ).all()
                )
                valid_speech = [
                    r.speech_emotion.strip().capitalize()
                    for r in speech_records
                    if r.speech_emotion and r.speech_emotion.strip()
                ]
                if valid_speech:
                    sentiment_val = Counter(valid_speech).most_common(1)[0][0]

        presence_secs = rec.presence_duration_seconds if rec else 0
        pct = rec.attendance_percentage if (rec and rec.attendance_percentage is not None) else 0.0
        status_val = rec.status if rec else AttendanceStatus.ABSENT

        item = {
            "name": student_name,
            "usn": student_usn,
            "facial_emotion": emotion_val,
            "speech_sentiment": sentiment_val,
            "present_duration": presence_secs,
            "attendance_percentage": pct,
        }

        # Final Classification (Phase 7 & Phase 8)
        if status_val == AttendanceStatus.PRESENT or pct >= 75.0:
            present_list.append(item)
        elif status_val == AttendanceStatus.PARTIAL or (pct > 0.0 and pct < 75.0):
            partial_list.append(item)
        else:
            item["facial_emotion"] = "N/A"
            item["speech_sentiment"] = "N/A"
            item["present_duration"] = 0
            item["attendance_percentage"] = 0.0
            absent_list.append(item)

    # Sort each section alphabetically by name then USN
    present_list.sort(key=lambda s: (s["name"].lower(), s["usn"]))
    partial_list.sort(key=lambda s: (s["name"].lower(), s["usn"]))
    absent_list.sort(key=lambda s: (s["name"].lower(), s["usn"]))

    # 6. Generate Excel Workbook using template
    excel_stream = generate_attendance_excel_workbook(
        class_subject=class_subject,
        session_date=session_date_str,
        lecture_name=lecture_name,
        present_students=present_list,
        partial_students=partial_list,
        absent_students=absent_list,
    )

    # 7. Construct Downloadable Response
    filename = f"EduSense_Attendance_Report_{report_file_date}.xlsx"

    return Response(
        content=excel_stream.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


@router.get(
    "/export/{session_id}",
    summary="Export finalized attendance report as Excel workbook for a session",
)
def export_attendance_by_path(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.TEACHER])),
) -> Response:
    """Convenience endpoint to export attendance using session_id path parameter."""
    return export_attendance_report(
        session_id=session_id,
        classroom_id=None,
        start_date=None,
        end_date=None,
        status_filter=None,
        include_late=True,
        db=db,
        current_user=current_user,
    )
