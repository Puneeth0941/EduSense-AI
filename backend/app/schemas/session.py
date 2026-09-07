import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field
from app.models.enums import SessionStatus, UserRole


class ClassSessionCreateSchema(BaseModel):
    title: str = Field(..., min_length=2, max_length=255)
    scheduled_start_time: Optional[datetime] = None
    scheduled_end_time: Optional[datetime] = None


class ClassSessionResponseSchema(BaseModel):
    id: uuid.UUID
    classroom_id: uuid.UUID
    title: str
    status: SessionStatus
    scheduled_start_time: datetime
    scheduled_end_time: datetime
    actual_start_time: Optional[datetime] = None
    actual_end_time: Optional[datetime] = None
    livekit_room_name: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class JoinSessionResponseSchema(BaseModel):
    token: str
    server_url: str
    session_id: uuid.UUID
    participant_identity: str
    participant_name: str
    role: UserRole
