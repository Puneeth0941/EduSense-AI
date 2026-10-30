import uuid
from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Text, Boolean, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base


class Classroom(Base):
    __tablename__ = "classrooms"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    course_code: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    teacher_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("teacher_profiles.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    livekit_room_name: Mapped[str] = mapped_column(
        String(255), unique=True, index=True, nullable=False
    )
    department: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    semester: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    teacher: Mapped["TeacherProfile"] = relationship(
        "TeacherProfile", back_populates="classrooms"
    )
    sessions: Mapped[List["ClassSession"]] = relationship(
        "ClassSession", back_populates="classroom", cascade="all, delete-orphan"
    )
    enrollments: Mapped[List["CourseEnrollment"]] = relationship(
        "CourseEnrollment", back_populates="classroom", cascade="all, delete-orphan"
    )


class CourseEnrollment(Base):
    __tablename__ = "course_enrollments"
    __table_args__ = (
        UniqueConstraint("classroom_id", "student_id", name="uq_course_enrollment"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    classroom_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("classrooms.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("student_profiles.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    enrolled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    classroom: Mapped["Classroom"] = relationship("Classroom", back_populates="enrollments")
    student: Mapped["StudentProfile"] = relationship("StudentProfile", back_populates="enrollments")

