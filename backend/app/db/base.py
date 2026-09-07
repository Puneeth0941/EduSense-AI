# Import all the models so that Base has them registered before being
# imported by Alembic
from app.db.base_class import Base  # noqa
from app.models.user import User  # noqa
from app.models.profile import StudentProfile, TeacherProfile  # noqa
from app.models.classroom import Classroom  # noqa
from app.models.session import ClassSession, SessionParticipant  # noqa
from app.models.stubs import (  # noqa
    FaceEmbedding,
    AttendanceRecord,
    FacialAnalysis,
    SpeechAnalysis,
    SentimentAnalysis,
    DistractionEvent,
    EngagementMetric,
    ClassReport,
    AuditLog,
)
