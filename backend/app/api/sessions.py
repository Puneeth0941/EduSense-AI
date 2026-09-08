import uuid
from typing import List
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import select

from app.core.deps import get_db, get_current_user, require_role
from app.models.user import User
from app.models.classroom import Classroom
from app.models.session import ClassSession, SessionParticipant
from app.models.enums import SessionStatus, UserRole
from app.schemas.session import (
    ClassSessionCreateSchema,
    ClassSessionResponseSchema,
    JoinSessionResponseSchema,
)
from app.services.livekit_service import livekit_service

router = APIRouter()


@router.post("/classrooms/{classroom_id}/sessions", response_model=ClassSessionResponseSchema, status_code=status.HTTP_201_CREATED)
def create_session(
    classroom_id: uuid.UUID,
    data: ClassSessionCreateSchema,
    current_user: User = Depends(require_role([UserRole.TEACHER])),
    db: Session = Depends(get_db),
):
    """Create a new class session. Only the teacher who owns the classroom can create sessions."""
    classroom = db.scalar(select(Classroom).where(Classroom.id == classroom_id))
    if not classroom:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Classroom not found.")
    
    if not current_user.teacher_profile or classroom.teacher_id != current_user.teacher_profile.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the classroom teacher owner can create sessions.",
        )
    
    now = datetime.now(timezone.utc)
    start_time = data.scheduled_start_time or now
    end_time = data.scheduled_end_time or now
    
    # Auto-complete any pre-existing active or scheduled sessions for this classroom
    db.query(ClassSession).filter(
        ClassSession.classroom_id == classroom_id,
        ClassSession.status.in_([SessionStatus.ACTIVE, SessionStatus.SCHEDULED])
    ).update({
        "status": SessionStatus.COMPLETED,
        "actual_end_time": now
    }, synchronize_session=False)

    session = ClassSession(
        classroom_id=classroom_id,
        title=data.title,
        status=SessionStatus.SCHEDULED,
        scheduled_start_time=start_time,
        scheduled_end_time=end_time,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    
    res = ClassSessionResponseSchema.model_validate(session)
    res.livekit_room_name = f"edusense_{session.id}"
    return res


@router.post("/sessions/{session_id}/start", response_model=ClassSessionResponseSchema)
def start_session(
    session_id: uuid.UUID,
    current_user: User = Depends(require_role([UserRole.TEACHER])),
    db: Session = Depends(get_db),
):
    """Start a class session (transition to ACTIVE). Only classroom teacher owner."""
    session = db.scalar(select(ClassSession).options(joinedload(ClassSession.classroom)).where(ClassSession.id == session_id))
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Class session not found.")
    
    if not current_user.teacher_profile or session.classroom.teacher_id != current_user.teacher_profile.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the classroom teacher owner can start this session.")
    
    if session.status == SessionStatus.COMPLETED or session.status == SessionStatus.CANCELLED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Cannot start session in status {session.status.value}.")
    
    now = datetime.now(timezone.utc)
    
    # Auto-complete any other pre-existing active or scheduled sessions for this classroom
    db.query(ClassSession).filter(
        ClassSession.classroom_id == session.classroom_id,
        ClassSession.id != session_id,
        ClassSession.status.in_([SessionStatus.ACTIVE, SessionStatus.SCHEDULED])
    ).update({
        "status": SessionStatus.COMPLETED,
        "actual_end_time": now
    }, synchronize_session=False)

    session.status = SessionStatus.ACTIVE
    session.actual_start_time = now
    db.commit()
    db.refresh(session)
    
    res = ClassSessionResponseSchema.model_validate(session)
    res.livekit_room_name = f"edusense_{session.id}"
    return res


@router.post("/sessions/{session_id}/end", response_model=ClassSessionResponseSchema)
def end_session(
    session_id: uuid.UUID,
    current_user: User = Depends(require_role([UserRole.TEACHER])),
    db: Session = Depends(get_db),
):
    """End a class session (transition to COMPLETED). Only classroom teacher owner."""
    session = db.scalar(select(ClassSession).options(joinedload(ClassSession.classroom)).where(ClassSession.id == session_id))
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Class session not found.")
    
    if not current_user.teacher_profile or session.classroom.teacher_id != current_user.teacher_profile.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the classroom teacher owner can end this session.")
    
    session.status = SessionStatus.COMPLETED
    session.actual_end_time = datetime.now(timezone.utc)
    
    # Mark all active participants as left
    db.query(SessionParticipant).filter(
        SessionParticipant.session_id == session_id,
        SessionParticipant.left_at.is_(None)
    ).update({"left_at": datetime.now(timezone.utc)}, synchronize_session=False)
    
    db.commit()
    db.refresh(session)
    
    res = ClassSessionResponseSchema.model_validate(session)
    res.livekit_room_name = f"edusense_{session.id}"
    return res


@router.get("/sessions/recent", response_model=List[ClassSessionResponseSchema])
def get_recent_sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get recent completed class sessions accessible to current user."""
    if current_user.role == UserRole.TEACHER and current_user.teacher_profile:
        classrooms = db.scalars(
            select(Classroom).where(Classroom.teacher_id == current_user.teacher_profile.id)
        ).all()
        c_ids = [c.id for c in classrooms]
    else:
        classrooms = db.scalars(
            select(Classroom).where(Classroom.is_active == True)
        ).all()
        c_ids = [c.id for c in classrooms]

    if not c_ids:
        return []

    sessions = db.scalars(
        select(ClassSession)
        .options(joinedload(ClassSession.classroom))
        .where(
            ClassSession.classroom_id.in_(c_ids),
            ClassSession.status == SessionStatus.COMPLETED
        )
        .order_by(ClassSession.created_at.desc())
        .limit(10)
    ).all()

    result = []
    for s in sessions:
        res = ClassSessionResponseSchema.model_validate(s)
        res.livekit_room_name = f"edusense_{s.id}"
        if s.classroom:
            res.classroom_title = s.classroom.title
            res.course_code = s.classroom.course_code
        result.append(res)
    return result


@router.get("/sessions/{session_id}", response_model=ClassSessionResponseSchema)
def get_session(
    session_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get class session details."""
    session = db.scalar(
        select(ClassSession)
        .options(joinedload(ClassSession.classroom))
        .where(ClassSession.id == session_id)
    )
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Class session not found.")
    
    res = ClassSessionResponseSchema.model_validate(session)
    res.livekit_room_name = f"edusense_{session.id}"
    if session.classroom:
        res.classroom_title = session.classroom.title
        res.course_code = session.classroom.course_code
    return res


@router.get("/classrooms/{classroom_id}/active-session", response_model=ClassSessionResponseSchema)
def get_active_session_for_classroom(
    classroom_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the currently ACTIVE class session for a classroom."""
    classroom = db.scalar(select(Classroom).where(Classroom.id == classroom_id))
    if not classroom:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Classroom not found.")
    
    session = db.scalar(
        select(ClassSession)
        .options(joinedload(ClassSession.classroom))
        .where(
            ClassSession.classroom_id == classroom_id,
            ClassSession.status == SessionStatus.ACTIVE
        )
        .order_by(ClassSession.created_at.desc())
    )
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active session found for this classroom.")
    
    res = ClassSessionResponseSchema.model_validate(session)
    res.livekit_room_name = f"edusense_{session.id}"
    if session.classroom:
        res.classroom_title = session.classroom.title
        res.course_code = session.classroom.course_code
    return res



@router.post("/classrooms/{classroom_id}/sessions/{session_id}/join", response_model=JoinSessionResponseSchema)
def join_session(
    classroom_id: uuid.UUID,
    session_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Authenticate user, verify classroom & session status, update SessionParticipant,
    and generate a LiveKit AccessToken.
    """
    classroom = db.scalar(select(Classroom).where(Classroom.id == classroom_id))
    if not classroom:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Classroom not found.")
    
    session = db.scalar(select(ClassSession).where(ClassSession.id == session_id, ClassSession.classroom_id == classroom_id))
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Class session not found in this classroom.")
    
    is_teacher_owner = (
        current_user.role == UserRole.TEACHER and
        current_user.teacher_profile is not None and
        current_user.teacher_profile.id == classroom.teacher_id
    )
    
    # Auto-start session if teacher joins a SCHEDULED session
    if is_teacher_owner and session.status == SessionStatus.SCHEDULED:
        session.status = SessionStatus.ACTIVE
        session.actual_start_time = datetime.now(timezone.utc)
        db.commit()
    
    if session.status == SessionStatus.COMPLETED or session.status == SessionStatus.CANCELLED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This class session has already ended.")
    
    # Track participant in DB
    existing_participant = db.scalar(
        select(SessionParticipant).where(
            SessionParticipant.session_id == session_id,
            SessionParticipant.user_id == current_user.id
        )
    )
    
    now = datetime.now(timezone.utc)
    if existing_participant:
        existing_participant.joined_at = now
        existing_participant.left_at = None
    else:
        new_participant = SessionParticipant(
            session_id=session_id,
            user_id=current_user.id,
            role=current_user.role,
            joined_at=now,
        )
        db.add(new_participant)
    db.commit()
    
    # Generate LiveKit Token
    livekit_room_name = f"edusense_{session.id}"
    token_str, server_url, identity = livekit_service.generate_token(
        user=current_user,
        room_name=livekit_room_name,
        is_teacher=is_teacher_owner
    )
    
    return JoinSessionResponseSchema(
        token=token_str,
        server_url=server_url,
        session_id=session.id,
        participant_identity=identity,
        participant_name=current_user.full_name,
        role=current_user.role,
    )


@router.post("/sessions/{session_id}/leave", status_code=status.HTTP_200_OK)
def leave_session(
    session_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Record participant leave time."""
    participant = db.scalar(
        select(SessionParticipant).where(
            SessionParticipant.session_id == session_id,
            SessionParticipant.user_id == current_user.id
        )
    )
    if participant:
        participant.left_at = datetime.now(timezone.utc)
        db.commit()
    return {"message": "Participant leave recorded successfully"}
