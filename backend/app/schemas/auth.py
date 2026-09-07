import uuid
from typing import Optional
from pydantic import BaseModel, EmailStr, Field
from app.models.enums import UserRole


class TeacherRegisterSchema(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=255)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=100)
    employee_id: str = Field(..., min_length=2, max_length=100)
    department: Optional[str] = Field(None, max_length=100)
    designation: Optional[str] = Field(None, max_length=100)


class StudentRegisterSchema(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=255)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=100)
    student_id_number: str = Field(..., min_length=2, max_length=100)
    department: Optional[str] = Field(None, max_length=100)
    enrollment_year: Optional[int] = Field(None, ge=2000, le=2100)


class LoginSchema(BaseModel):
    email: EmailStr
    password: str


class TeacherProfileResponseSchema(BaseModel):
    id: uuid.UUID
    employee_id: str
    department: Optional[str] = None
    designation: Optional[str] = None

    class Config:
        from_attributes = True


class StudentProfileResponseSchema(BaseModel):
    id: uuid.UUID
    student_id_number: str
    department: Optional[str] = None
    enrollment_year: Optional[int] = None

    class Config:
        from_attributes = True


class UserResponseSchema(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: UserRole
    is_active: bool
    teacher_profile: Optional[TeacherProfileResponseSchema] = None
    student_profile: Optional[StudentProfileResponseSchema] = None

    class Config:
        from_attributes = True


class TokenResponseSchema(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponseSchema
