import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


class ClassroomCreateSchema(BaseModel):
    title: str = Field(..., min_length=2, max_length=255, description="Course name / title")
    description: Optional[str] = None
    course_code: str = Field(..., min_length=2, max_length=50, description="Unique course code")
    department: Optional[str] = Field(None, max_length=100, description="Department (e.g. Computer Science)")
    semester: Optional[str] = Field(None, max_length=50, description="Semester (e.g. 5th Semester)")


class ClassroomResponseSchema(BaseModel):
    id: uuid.UUID
    title: str
    description: Optional[str] = None
    course_code: str
    teacher_id: uuid.UUID
    teacher_name: Optional[str] = None
    department: Optional[str] = None
    semester: Optional[str] = None
    livekit_room_name: str
    is_active: bool
    created_at: datetime
    enrolled_student_count: int = 0
    is_enrolled: Optional[bool] = False

    model_config = ConfigDict(from_attributes=True)


class EnrollStudentSchema(BaseModel):
    student_id: Optional[uuid.UUID] = Field(None, description="UUID of StudentProfile")
    student_id_number: Optional[str] = Field(None, description="USN or Student ID number")


class JoinCourseSchema(BaseModel):
    course_code: str = Field(..., min_length=2, max_length=50, description="Course code to join")


class EnrolledStudentResponseSchema(BaseModel):
    enrollment_id: uuid.UUID
    student_id: uuid.UUID
    user_id: uuid.UUID
    full_name: str
    email: str
    student_id_number: str
    department: Optional[str] = None
    enrollment_year: Optional[int] = None
    enrolled_at: datetime
    has_face_enrolled: bool = False

    model_config = ConfigDict(from_attributes=True)


class RegisteredStudentResponseSchema(BaseModel):
    student_id: uuid.UUID
    user_id: uuid.UUID
    full_name: str
    email: str
    student_id_number: str
    department: Optional[str] = None
    enrollment_year: Optional[int] = None
    has_face_enrolled: bool = False

    model_config = ConfigDict(from_attributes=True)
