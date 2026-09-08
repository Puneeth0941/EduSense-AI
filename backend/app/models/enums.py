import enum


class UserRole(str, enum.Enum):
    TEACHER = "TEACHER"
    STUDENT = "STUDENT"
    ADMIN = "ADMIN"


class SessionStatus(str, enum.Enum):
    SCHEDULED = "SCHEDULED"
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class AttendanceStatus(str, enum.Enum):
    PRESENT = "PRESENT"
    ABSENT = "ABSENT"
    LATE = "LATE"
    UNVERIFIED = "UNVERIFIED"

