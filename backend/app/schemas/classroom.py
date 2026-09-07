import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class ClassroomCreateSchema(BaseModel):
    title: str = Field(..., min_length=2, max_length=255)
    description: Optional[str] = None
    course_code: str = Field(..., min_length=2, max_length=50)


class ClassroomResponseSchema(BaseModel):
    id: uuid.UUID
    title: str
    description: Optional[str] = None
    course_code: str
    teacher_id: uuid.UUID
    teacher_name: Optional[str] = None
    livekit_room_name: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True
