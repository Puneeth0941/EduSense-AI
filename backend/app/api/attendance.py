import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import select, func

from app.core.deps import get_db, get_current_user, require_role
from app.core.config import settings
from app.models.user import User
from app.models.enums import UserRole, SessionStatus, AttendanceStatus
from app.models.session import ClassSession, SessionParticipant
from app.models.profile import StudentProfile, TeacherProfile
from app.models.classroom import Classroom
from app.models.stubs import FaceEmbedding, AttendanceRecord, AuditLog
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

    # Confirm student is a participant in this session
    participant = db.scalar(
        select(SessionParticipant).where(
            SessionParticipant.session_id == payload.session_id,
            SessionParticipant.user_id == current_user.id,
        )
    )
    if not participant:
        logger.info("[ATTENDANCE] enrollment found: NO (Student not participant)")
        logger.info("[ATTENDANCE] verification result: verified=False, reason=NOT_IN_SESSION")
        return AttendanceVerificationResponse(
            verified=False,
            reason="NOT_IN_SESSION",
            attendance_status="UNVERIFIED",
            message="Student is not registered as a participant in this session.",
            samples_confirmed=0,
            samples_required=CONFIRMATION_SAMPLES_REQUIRED,
        )

    # Fetch student face embedding record
    face_record = db.scalar(
        select(FaceEmbedding).where(FaceEmbedding.student_id == student_profile.id)
    )
    has_enrollment = bool(face_record and face_record.embedding_data)
    logger.info(f"[ATTENDANCE] enrollment found: {'YES' if has_enrollment else 'NO'}")

    if not has_enrollment:
        logger.info("[ATTENDANCE] verification result: verified=False, reason=NOT_ENROLLED")
        return AttendanceVerificationResponse(
            verified=False,
            reason="NOT_ENROLLED",
            attendance_status="UNVERIFIED",
            message="Student has no face profile enrolled. Please complete face enrollment first.",
            samples_confirmed=0,
            samples_required=CONFIRMATION_SAMPLES_REQUIRED,
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

    logger.info(f"[ATTENDANCE DEBUG] face result: {eval_result.get('reason')}")
    logger.info(f"[ATTENDANCE DEBUG] similarity: {eval_result.get('similarity', 0.0)}")
    logger.info(f"[ATTENDANCE DEBUG] threshold: {settings.FACE_RECOGNITION_SIMILARITY_THRESHOLD}")

    logger.info(f"[ATTENDANCE] image received: {eval_result.get('image_width', 0)}x{eval_result.get('image_height', 0)}")
    logger.info(f"[ATTENDANCE] face detection count: {eval_result.get('num_faces', 0)}")
    logger.info(f"[ATTENDANCE] quality check: {'PASS' if eval_result.get('quality_pass') else 'FAIL'}")
    if eval_result.get("embedding_generated"):
        logger.info("[ATTENDANCE] embedding generated")
    logger.info("[ATTENDANCE] similarity comparison completed")

    now_utc = datetime.now(timezone.utc)

    # Case: Single frame evaluation failed (No face, Multi face, Low quality, Mismatch)
    if not eval_result["matched"]:
        confirmed_count = existing_record.verification_count if existing_record else 0
        current_status = get_status_str(existing_record.status) if existing_record else "UNVERIFIED"
        first_verified = existing_record.first_verified_at.isoformat() if existing_record and existing_record.first_verified_at else None
        last_verified = existing_record.last_verified_at.isoformat() if existing_record and existing_record.last_verified_at else None
        verified_flag = confirmed_count >= CONFIRMATION_SAMPLES_REQUIRED

        logger.info(f"[ATTENDANCE] verification result: verified={verified_flag}, reason={eval_result['reason']}, status={current_status}")

        resp_fail = AttendanceVerificationResponse(
            verified=verified_flag,
            reason=eval_result["reason"],
            attendance_status=current_status,
            message=eval_result["message"],
            samples_confirmed=confirmed_count,
            samples_required=CONFIRMATION_SAMPLES_REQUIRED,
            first_verified_at=first_verified,
            last_verified_at=last_verified,
        )
        logger.info(f"[ATTENDANCE DEBUG] response: {resp_fail.model_dump_json()}")
        return resp_fail

    # Case: Match Success! Perform Temporal Confirmation & Record Update
    if not existing_record:
        # Create new record with 1 sample
        new_record = AttendanceRecord(
            session_id=payload.session_id,
            student_id=student_profile.id,
            status=AttendanceStatus.UNVERIFIED,
            marked_at=now_utc,
            first_verified_at=now_utc,
            last_verified_at=now_utc,
            verification_count=1,
            presence_duration_seconds=0,
            is_manually_corrected=False,
        )
        db.add(new_record)
        db.commit()
        db.refresh(new_record)
        record = new_record
    else:
        record = existing_record
        record.verification_count += 1
        if not record.first_verified_at:
            record.first_verified_at = now_utc
        record.last_verified_at = now_utc

        # Calculate presence duration in seconds
        if record.first_verified_at and record.last_verified_at:
            duration = int((record.last_verified_at - record.first_verified_at).total_seconds())
            record.presence_duration_seconds = max(0, duration)

    # Temporal Confirmation Check: Require 3 verified samples to transition from UNVERIFIED -> PRESENT / LATE
    rec_status_str = get_status_str(record.status)
    if record.verification_count >= CONFIRMATION_SAMPLES_REQUIRED and not record.is_manually_corrected:
        if rec_status_str in ("UNVERIFIED", "ABSENT"):
            session_start = session_obj.actual_start_time or session_obj.scheduled_start_time or session_obj.created_at
            # Make sure session_start is timezone aware
            if session_start.tzinfo is None:
                session_start = session_start.replace(tzinfo=timezone.utc)

            late_cutoff = session_start + timedelta(minutes=LATE_THRESHOLD_MINUTES)

            if record.first_verified_at <= late_cutoff:
                record.status = AttendanceStatus.PRESENT
                msg = "Attendance verified and marked PRESENT"
            else:
                record.status = AttendanceStatus.LATE
                msg = "Attendance verified and marked LATE"
        else:
            msg = f"Attendance active ({get_status_str(record.status)})"
    else:
        samples_left = CONFIRMATION_SAMPLES_REQUIRED - record.verification_count
        msg = f"Sample verified. {samples_left} more matching sample(s) required to confirm attendance."

    db.commit()
    db.refresh(record)

    logger.info(f"[ATTENDANCE] verification result: verified={record.verification_count >= CONFIRMATION_SAMPLES_REQUIRED}, reason={'CONFIRMED' if record.verification_count >= CONFIRMATION_SAMPLES_REQUIRED else 'PENDING_TEMPORAL'}, status={get_status_str(record.status)}")
    logger.info("[ATTENDANCE] attendance update completed")

    first_verified_str = record.first_verified_at.isoformat() if record.first_verified_at else None
    last_verified_str = record.last_verified_at.isoformat() if record.last_verified_at else None
    is_confirmed = record.verification_count >= CONFIRMATION_SAMPLES_REQUIRED

    resp_success = AttendanceVerificationResponse(
        verified=is_confirmed,
        reason="CONFIRMED" if is_confirmed else "PENDING_TEMPORAL",
        attendance_status=get_status_str(record.status),
        message=msg,
        samples_confirmed=record.verification_count,
        samples_required=CONFIRMATION_SAMPLES_REQUIRED,
        first_verified_at=first_verified_str,
        last_verified_at=last_verified_str,
    )
    logger.info(f"[ATTENDANCE DEBUG] response: {resp_success.model_dump_json()}")
    return resp_success


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

    record_map = {r.student_id: r for r in existing_records}

    responses: List[AttendanceRecordResponse] = []
    present_cnt = 0
    late_cnt = 0
    unverified_cnt = 0
    absent_cnt = 0

    for p in participants:
        if not p.user or not p.user.student_profile:
            continue

        sp = p.user.student_profile
        rec = record_map.get(sp.id)

        if rec:
            st = get_status_str(rec.status)
            first_v = rec.first_verified_at.isoformat() if rec.first_verified_at else None
            last_v = rec.last_verified_at.isoformat() if rec.last_verified_at else None
            dur = rec.presence_duration_seconds
            v_cnt = rec.verification_count
            marked_at = rec.marked_at.isoformat() if rec.marked_at else p.joined_at.isoformat()
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
            v_cnt = 0
            marked_at = p.joined_at.isoformat()
            rec_id = f"pending_{sp.id}"
            is_corr = False
            corr_by = None
            corr_reason = None

        if st == "PRESENT":
            present_cnt += 1
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
                student_id=str(sp.id),
                student_name=p.user.full_name,
                student_id_number=sp.student_id_number,
                status=st,
                marked_at=marked_at,
                first_verified_at=first_v,
                last_verified_at=last_v,
                verification_count=v_cnt,
                presence_duration_seconds=dur,
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
