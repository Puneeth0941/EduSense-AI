"""
Pydantic Schemas for EduSense AI Engagement Analytics.
"""

from uuid import UUID
from datetime import datetime
from typing import Optional, Dict, List, Any
from pydantic import BaseModel, Field


class HeadPoseInfo(BaseModel):
    pitch: float = 0.0
    yaw: float = 0.0
    roll: float = 0.0
    orientation: str = "frontal"


class FacialFrameInput(BaseModel):
    session_id: UUID
    student_id: Optional[UUID] = None
    image_base64: Optional[str] = None
    timestamp: Optional[datetime] = None
    slot: Optional[str] = None




class FacialAnalysisResult(BaseModel):
    valid_input: bool = True
    face_detected: bool = False
    attentiveness_score: float = Field(default=0.0, ge=0.0, le=1.0)
    head_pose: HeadPoseInfo = Field(default_factory=HeadPoseInfo)
    dominant_emotion: str = "uncertain"
    raw_dominant: Optional[str] = None
    emotion_probabilities: Dict[str, float] = Field(default_factory=dict)
    raw_emotion_probabilities: Dict[str, float] = Field(default_factory=dict)
    emotion_model_loaded: bool = False
    emotion_backend: Optional[str] = None  # "emotiefflib", "ferplus", or "none"
    is_distracted: bool = False
    distraction_type: Optional[str] = None
    confidence: float = 0.0
    prediction_status: str = "valid_prediction"  # valid_prediction, low_confidence, no_face, poor_image_quality, ambiguous_face, model_error, insufficient_data
    quality_status: str = "good"  # good, poor_lighting, blurry, invalid_input
    inference_latency_ms: Optional[float] = None


class TextSentimentInput(BaseModel):
    session_id: UUID
    user_id: Optional[UUID] = None
    text: str
    language: Optional[str] = "en"
    timestamp: Optional[datetime] = None


class SentimentAnalysisResult(BaseModel):
    valid_input: bool = True
    text: str = ""
    sentiment_score: Optional[float] = Field(default=None, description="Valence score -1.0 to 1.0 or None if unsupported")
    sentiment_label: str = "neutral"
    is_question: bool = False
    is_confusion: bool = False
    confidence: Optional[float] = None
    language: Optional[str] = "en"
    language_supported: bool = True
    status: Optional[str] = None
    note: Optional[str] = None


class RecentTranscriptSnippet(BaseModel):
    id: UUID
    timestamp: datetime
    transcript_text: str
    language: Optional[str] = None
    sentiment_label: Optional[str] = None
    sentiment_score: Optional[float] = None


class StudentSpeechSentimentSummary(BaseModel):
    student_id: UUID
    total_segments: int = 0
    valid_analyzed_segments: int = 0
    unsupported_language_segments: int = 0
    positive_count: int = 0
    negative_count: int = 0
    neutral_count: int = 0
    confused_count: int = 0
    positive_percentage: float = 0.0
    negative_percentage: float = 0.0
    neutral_percentage: float = 0.0
    confused_percentage: float = 0.0
    dominant_sentiment: Optional[str] = None
    dominant_status: str = "insufficient_data"
    dominant_language: Optional[str] = None
    recent_snippets: List[RecentTranscriptSnippet] = Field(default_factory=list)


class ClassroomSpeechSentimentSummary(BaseModel):
    session_id: UUID
    total_student_transcripts: int = 0
    valid_analyzed_transcripts: int = 0
    unsupported_language_transcripts: int = 0
    positive_count: int = 0
    negative_count: int = 0
    neutral_count: int = 0
    confused_count: int = 0
    positive_percentage: float = 0.0
    negative_percentage: float = 0.0
    neutral_percentage: float = 0.0
    confused_percentage: float = 0.0
    dominant_sentiment: Optional[str] = None
    status: str = "insufficient_data"


class StudentFacialSummary(BaseModel):
    student_id: UUID
    dominant_expression: str = "insufficient_data"
    expression_distribution: Dict[str, float] = Field(default_factory=dict)
    total_samples: int = 0
    valid_samples: int = 0
    valid_windows: int = 0
    attentiveness_score: Optional[float] = None
    head_pose_orientation: Optional[str] = None
    status: str = "insufficient_data"  # "analyzed" or "insufficient_data"


class StudentEngagementSummary(BaseModel):
    student_id: UUID
    session_id: UUID
    student_name: Optional[str] = None
    student_email: Optional[str] = None
    student_id_number: Optional[str] = None
    composite_score: Optional[float] = Field(default=None, description="0 to 100 normalized score or None if no data")
    attentiveness_subscore: Optional[float] = Field(default=None, description="0 to 100 subscore")
    participation_subscore: Optional[float] = Field(default=None, description="0 to 100 subscore")
    sentiment_subscore: Optional[float] = Field(default=None, description="0 to 100 subscore")
    sample_count: int = 0
    distraction_count: int = 0
    question_count: int = 0
    speech_sentiment: Optional[StudentSpeechSentimentSummary] = None
    facial_summary: Optional[StudentFacialSummary] = None


class SessionAnalyticsOverview(BaseModel):
    session_id: UUID
    average_engagement: float = 0.0
    attendance_rate: float = 0.0
    total_distractions: int = 0
    total_questions: int = 0
    student_summaries: List[StudentEngagementSummary] = Field(default_factory=list)
    classroom_speech_sentiment: Optional[ClassroomSpeechSentimentSummary] = None


class FacialWindowAnalytics(BaseModel):
    window_start: datetime
    window_end: datetime
    dominant_expression: str = "insufficient_data"
    expression_distribution: Dict[str, float] = Field(default_factory=dict)
    students_analyzed: int = 0
    students_with_valid_expression: int = 0
    students_with_insufficient_data: int = 0


class StudentFacialWindowAnalytics(BaseModel):
    window_start: datetime
    window_end: datetime
    student_id: UUID
    dominant_expression: str = "insufficient_data"
    confidence: float = 0.0
    sample_count: int = 0
    valid_sample_count: int = 0
    expression_probabilities: Dict[str, float] = Field(default_factory=dict)


class SessionFacialSummary(BaseModel):
    session_id: UUID
    dominant_expression: str = "insufficient_data"
    expression_distribution: Dict[str, float] = Field(default_factory=dict)
    total_windows: int = 0
    valid_windows: int = 0
