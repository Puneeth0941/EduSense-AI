import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import select

from app.core.deps import get_db, get_current_user, require_role
from app.models.user import User
from app.models.classroom import Classroom
from app.models.enums import UserRole
from app.schemas.classroom import ClassroomCreateSchema, ClassroomResponseSchema

router = APIRouter()


@router.post("/", response_model=ClassroomResponseSchema, status_code=status.HTTP_201_CREATED)
def create_classroom(
    data: ClassroomCreateSchema,
    current_user: User = Depends(require_role([UserRole.TEACHER])),
    db: Session = Depends(get_db),
):
    """Create a new classroom. Restricted to TEACHER role."""
    if not current_user.teacher_profile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Teacher profile missing for this account.",
        )
    
    room_uuid = uuid.uuid4()
    livekit_room_name = f"classroom_{room_uuid}"
    
    classroom = Classroom(
        title=data.title,
        description=data.description,
        course_code=data.course_code,
        teacher_id=current_user.teacher_profile.id,
        livekit_room_name=livekit_room_name,
        is_active=True,
    )
    db.add(classroom)
    db.commit()
    db.refresh(classroom)
    
    res = ClassroomResponseSchema.model_validate(classroom)
    res.teacher_name = current_user.full_name
    return res


@router.get("/", response_model=List[ClassroomResponseSchema])
def list_classrooms(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List classrooms accessible to current user."""
    if current_user.role == UserRole.TEACHER and current_user.teacher_profile:
        # Teachers see their owned classrooms
        classrooms = (
            db.scalars(
                select(Classroom)
                .where(Classroom.teacher_id == current_user.teacher_profile.id)
                .order_by(Classroom.created_at.desc())
            ).all()
        )
    else:
        # Students see all active classrooms in the system (no enrollment table in Phase 1 schema)
        classrooms = (
            db.scalars(
                select(Classroom)
                .options(joinedload(Classroom.teacher))
                .where(Classroom.is_active == True)
                .order_by(Classroom.created_at.desc())
            ).all()
        )
    
    result = []
    for c in classrooms:
        item = ClassroomResponseSchema.model_validate(c)
        if c.teacher and c.teacher.user:
            item.teacher_name = c.teacher.user.full_name
        elif current_user.role == UserRole.TEACHER:
            item.teacher_name = current_user.full_name
        result.append(item)
    return result


@router.get("/{classroom_id}", response_model=ClassroomResponseSchema)
def get_classroom_detail(
    classroom_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get classroom details by ID."""
    classroom = db.scalar(
        select(Classroom)
        .options(joinedload(Classroom.teacher))
        .where(Classroom.id == classroom_id)
    )
    if not classroom:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Classroom not found.",
        )
    
    item = ClassroomResponseSchema.model_validate(classroom)
    if classroom.teacher and classroom.teacher.user:
        item.teacher_name = classroom.teacher.user.full_name
    return item
