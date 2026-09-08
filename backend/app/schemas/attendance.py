import uuid
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from app.models.enums import AttendanceStatus


class AttendanceVerificationRequest(BaseModel):
    session_id: uuid.UUID = Field(..., description="ID of active class session")
    image_base64: str = Field(..., description="Base64 encoded webcam image sample frame")


class AttendanceVerificationResponse(BaseModel):
    verified: bool = Field(..., description="True if attendance is confirmed")
    reason: str = Field(
        ...,
        description="Reason code: CONFIRMED, PENDING_TEMPORAL, FACE_NOT_DETECTED, MULTIPLE_FACES_DETECTED, LOW_QUALITY, FACE_MISMATCH, NOT_ENROLLED, NOT_IN_SESSION"
    )
    attendance_status: str = Field(..., description="Attendance status: PRESENT, LATE, UNVERIFIED")
    message: str = Field(..., description="User feedback message")
    samples_confirmed: int = Field(0, description="Number of verified matching samples captured so far")
    samples_required: int = Field(3, description="Total consecutive matching samples required for confirmation")
    first_verified_at: Optional[str] = Field(None, description="ISO timestamp of first successful face verification")
    last_verified_at: Optional[str] = Field(None, description="ISO timestamp of most recent face verification")


class AttendanceRecordResponse(BaseModel):
    id: str = Field(..., description="Attendance record UUID")
    session_id: str = Field(..., description="Class session UUID")
    student_id: str = Field(..., description="Student profile UUID")
    student_name: str = Field(..., description="Student full name")
    student_id_number: str = Field(..., description="Student roll / ID number")
    status: str = Field(..., description="Current status: PRESENT, LATE, UNVERIFIED, ABSENT")
    marked_at: str = Field(..., description="ISO timestamp when record was marked/created")
    first_verified_at: Optional[str] = Field(None, description="ISO timestamp of first verified sample")
    last_verified_at: Optional[str] = Field(None, description="ISO timestamp of latest verified sample")
    verification_count: int = Field(0, description="Total verified face samples")
    presence_duration_seconds: int = Field(0, description="Verified presence duration in seconds")
    is_manually_corrected: bool = Field(False, description="True if status was manually updated by instructor")
    corrected_by_name: Optional[str] = Field(None, description="Name of instructor who modified status")
    correction_reason: Optional[str] = Field(None, description="Reason for manual correction")


class SessionAttendanceSummaryResponse(BaseModel):
    session_id: str = Field(..., description="Session UUID")
    session_title: str = Field(..., description="Session title")
    classroom_title: str = Field(..., description="Classroom title")
    total_students: int = Field(..., description="Total participants registered")
    present_count: int = Field(0, description="Number of PRESENT students")
    late_count: int = Field(0, description="Number of LATE students")
    unverified_count: int = Field(0, description="Number of UNVERIFIED / pending students")
    absent_count: int = Field(0, description="Number of ABSENT students")
    records: List[AttendanceRecordResponse] = Field(default_factory=list, description="List of participant attendance records")


class ManualAttendanceUpdateRequest(BaseModel):
    status: AttendanceStatus = Field(..., description="New attendance status: PRESENT, LATE, ABSENT, UNVERIFIED")
    reason: Optional[str] = Field(None, description="Reason for manual adjustment")


class StudentAttendanceSummaryResponse(BaseModel):
    total_sessions: int = Field(0, description="Total class sessions enrolled")
    present_count: int = Field(0, description="Sessions marked PRESENT")
    late_count: int = Field(0, description="Sessions marked LATE")
    unverified_count: int = Field(0, description="Sessions UNVERIFIED / in progress")
    absent_count: int = Field(0, description="Sessions marked ABSENT")
    attendance_percentage: float = Field(0.0, description="Percentage of attended (PRESENT + LATE) sessions")


class TeacherAttendanceSummaryResponse(BaseModel):
    total_classrooms: int = Field(0, description="Total classrooms owned")
    total_sessions_conducted: int = Field(0, description="Total active/completed sessions")
    overall_attendance_rate: float = Field(0.0, description="Average student attendance rate across sessions")
