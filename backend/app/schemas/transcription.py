"""
Pydantic Schemas for Speech-to-Text Transcription in EduSense AI.
"""

from datetime import datetime
from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel, Field

from app.schemas.analytics import SentimentAnalysisResult


class TranscriptSegment(BaseModel):
    """Timestamped segment of transcribed speech."""
    start: float = Field(..., description="Start timestamp in seconds")
    end: float = Field(..., description="End timestamp in seconds")
    text: str = Field(..., description="Transcribed segment text")


class AudioSnippetInput(BaseModel):
    """Base64 audio input payload for in-classroom live transcription."""
    session_id: Optional[UUID] = Field(None, description="Optional class session ID")
    audio_base64: str = Field(..., description="Base64 encoded audio string (WAV, WebM, MP3)")
    format: Optional[str] = Field("webm", description="Audio format/container ('webm', 'wav', 'mp3', 'ogg')")
    mime_type: Optional[str] = Field(None, description="Audio MIME type ('audio/webm', 'audio/wav', etc.)")
    language: Optional[str] = Field("auto", description="Transcription language ('auto', 'en', 'kn', 'hi')")
    analyze_sentiment: bool = Field(True, description="Whether to analyze sentiment and intent of speech")
    enrich_sentiment: Optional[bool] = Field(None, description="Alias for analyze_sentiment from frontend")


class TranscriptionResponse(BaseModel):
    """Complete speech transcription result."""
    valid_input: bool = Field(..., description="Indicates if audio was valid and processed")
    text: str = Field(..., description="Full concatenated transcript text")
    language: Optional[str] = Field(None, description="Detected or configured language code ('en', 'kn', 'hi')")
    language_probability: Optional[float] = Field(None, description="Confidence of language detection")
    duration_seconds: Optional[float] = Field(None, description="Audio duration in seconds")
    duration: Optional[float] = Field(None, description="Alias for duration_seconds for frontend compatibility")
    segments: List[TranscriptSegment] = Field(default_factory=list, description="Timestamped segments")
    sentiment: Optional[SentimentAnalysisResult] = Field(None, description="Sentiment analysis of transcript")
    session_id: Optional[UUID] = Field(None, description="Associated class session ID")
    persisted: bool = Field(False, description="Whether transcript was persisted in database")
    error: Optional[str] = Field(None, description="Error message if transcription encountered issues")
    analysis_id: Optional[UUID] = Field(None, description="Persisted SpeechAnalysis record ID")
    sentiment_label: Optional[str] = Field(None, description="Convenience sentiment label")
    sentiment_score: Optional[float] = Field(None, description="Convenience sentiment score")
    is_question: Optional[bool] = Field(None, description="Question intent flag")
    is_confusion: Optional[bool] = Field(None, description="Confusion intent flag")
    quality_status: Optional[str] = Field("reliable", description="Speech recognition quality status ('reliable', 'low_confidence', 'silence')")
    is_low_confidence: bool = Field(False, description="Flag indicating recognition uncertainty")


class TextSentimentRequest(BaseModel):
    """Payload to analyze or re-analyze sentiment and intent directly on transcript text."""
    text: str = Field(..., description="Transcript text to analyze")
    language: Optional[str] = Field("auto", description="Language code ('auto', 'en', 'kn', 'hi')")


class LanguageOption(BaseModel):
    """Language selection metadata."""
    code: str
    name: str


class SessionTranscriptItem(BaseModel):
    """Historic session transcript entry."""
    id: UUID
    session_id: UUID
    participant_id: UUID
    speaker_name: Optional[str] = None
    role: Optional[str] = None
    speaker_role: Optional[str] = None
    sampled_at: datetime
    created_at: Optional[datetime] = None
    transcript_text: str
    text: Optional[str] = None
    language: Optional[str] = None
    sentiment_label: Optional[str] = None
    sentiment_score: Optional[float] = None
