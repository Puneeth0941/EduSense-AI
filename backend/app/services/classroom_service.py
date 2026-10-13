import uuid
import logging
from typing import List
from sqlalchemy import select, or_, and_, not_
from sqlalchemy.orm import Session, joinedload

from app.models.classroom import Classroom
from app.models.session import ClassSession, SessionParticipant
from app.models.profile import TeacherProfile, StudentProfile
from app.models.stubs import AttendanceRecord
from app.models.user import User
from app.models.enums import UserRole

logger = logging.getLogger(__name__)


def get_authorized_classrooms(db: Session, user: User) -> List[Classroom]:
    """
    Returns list of active classrooms accessible to the given user based on
    role, owned classrooms (for teachers), or institutional department membership,
    attendance records, and session participation (for students).
    Filters out synthetic test runner teacher accounts.
    """
    if user.role == UserRole.TEACHER:
        if not user.teacher_profile:
            return []
        return list(
            db.scalars(
                select(Classroom)
                .options(joinedload(Classroom.teacher).joinedload(TeacherProfile.user))
                .where(
                    Classroom.teacher_id == user.teacher_profile.id,
                    Classroom.is_active == True,
                )
                .order_by(Classroom.created_at.desc())
            ).unique().all()
        )

    student_profile = user.student_profile
    dept = student_profile.department if student_profile else None

    conds = []
    # 1. Participated in sessions of this classroom
    conds.append(
        Classroom.id.in_(
            select(ClassSession.classroom_id)
            .join(SessionParticipant, SessionParticipant.session_id == ClassSession.id)
            .where(SessionParticipant.user_id == user.id)
        )
    )

    # 2. Has attendance records in this classroom
    if student_profile:
        conds.append(
            Classroom.id.in_(
                select(ClassSession.classroom_id)
                .join(AttendanceRecord, AttendanceRecord.session_id == ClassSession.id)
                .where(AttendanceRecord.student_id == student_profile.id)
            )
        )

    # 3. Department matching (institutional teachers in student's department)
    if dept:
        conds.append(Classroom.teacher.has(TeacherProfile.department.ilike(dept)))

    if not conds:
        return []

    return list(
        db.scalars(
            select(Classroom)
            .options(joinedload(Classroom.teacher).joinedload(TeacherProfile.user))
            .where(
                Classroom.is_active == True,
                not_(Classroom.teacher.has(TeacherProfile.user.has(User.email.like("teacher_speech_%@edusense.ai")))),
                or_(*conds),
            )
            .order_by(Classroom.created_at.desc())
        ).unique().all()
    )


def get_authorized_classroom_ids(db: Session, user: User) -> List[uuid.UUID]:
    """Helper returning list of classroom UUIDs the user is authorized to access."""
    classrooms = get_authorized_classrooms(db, user)
    return [c.id for c in classrooms]
