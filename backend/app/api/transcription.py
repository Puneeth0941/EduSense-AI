"""
FastAPI Router for Whisper AI Speech-to-Text Transcription in EduSense AI.
"""

import base64
import uuid
import logging
from typing import Optional, List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import select, desc

from app.core.deps import get_db, get_current_user
from app.models.user import User
from app.models.classroom import Classroom
from app.models.session import ClassSession, SessionParticipant
from app.models.stubs import SpeechAnalysis, AttendanceRecord
from app.models.enums import UserRole
from app.schemas.transcription import (
    TranscriptionResponse,
    AudioSnippetInput,
    LanguageOption,
    SessionTranscriptItem,
    TextSentimentRequest,
)
from app.schemas.analytics import SentimentAnalysisResult
from app.services.transcription_service import transcription_service
from app.services.analytics_service import analytics_service

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_AUDIO_SIZE_BYTES = 25 * 1024 * 1024  # 25 MB max audio upload


def _verify_session_access(
    db: Session, session_id: uuid.UUID, current_user: User
) -> ClassSession:
    """
    Verify that the session exists and current user has authorization.
    """
    session = db.scalar(
        select(ClassSession)
        .options(joinedload(ClassSession.classroom))
        .where(ClassSession.id == session_id)
    )
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Class session not found."
        )

    if current_user.role == UserRole.TEACHER:
        if not current_user.teacher_profile or session.classroom.teacher_id != current_user.teacher_profile.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not authorized to access transcription for this session."
            )
    elif current_user.role == UserRole.STUDENT:
        if not current_user.student_profile:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Student profile required to access session transcription."
            )
        is_participant = db.scalar(
            select(SessionParticipant).where(
                SessionParticipant.session_id == session_id,
                SessionParticipant.user_id == current_user.id,
            )
        )
        has_attendance = db.scalar(
            select(AttendanceRecord).where(
                AttendanceRecord.session_id == session_id,
                AttendanceRecord.student_id == current_user.student_profile.id,
            )
        )
        if not is_participant and not has_attendance:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not authorized to access transcription for this session."
            )
    return session


import re


@router.get("/languages", response_model=List[LanguageOption])
def get_supported_transcription_languages():
    """
    Returns supported transcription languages (Auto, English, Kannada, Hindi).
    """
    return transcription_service.get_supported_languages()


@router.post("/audio", response_model=TranscriptionResponse)
async def transcribe_audio_file(
    file: UploadFile = File(..., description="Audio file (WAV, WebM, MP3, OGG, FLAC, M4A)"),
    session_id: Optional[uuid.UUID] = Form(None, description="Optional active session UUID"),
    language: Optional[str] = Form("auto", description="Target language ('auto', 'en', 'kn', 'hi')"),
    analyze_sentiment: bool = Form(True, description="Whether to analyze sentiment and questions"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Transcribe uploaded audio file using Whisper AI.
    Validates file format and size, runs Whisper inference, and optionally enriches with sentiment.
    """
    session = None
    if session_id:
        session = _verify_session_access(db, session_id, current_user)

    # Read and validate audio payload
    audio_bytes = await file.read()
    if not audio_bytes or len(audio_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded audio file is empty."
        )

    if len(audio_bytes) > MAX_AUDIO_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Audio file exceeds maximum size of {MAX_AUDIO_SIZE_BYTES // (1024 * 1024)}MB."
        )

    # Perform transcription
    result = transcription_service.transcribe_audio(
        audio_input=audio_bytes,
        language=language,
        analyze_sentiment=analyze_sentiment,
        session=session,
        current_user=current_user,
        db=db,
    )

    return result


@router.post("/snippet", response_model=TranscriptionResponse)
def transcribe_audio_snippet(
    data: AudioSnippetInput,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Transcribe live classroom audio snippet received as base64 string.
    Designed for real-time periodic classroom speech transcription.
    """
    session = None
    if data.session_id:
        session = _verify_session_access(db, data.session_id, current_user)

    if not data.audio_base64 or not isinstance(data.audio_base64, str):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or empty audio_base64 payload."
        )

    try:
        raw_b64 = data.audio_base64
        if "," in raw_b64:
            raw_b64 = raw_b64.split(",", 1)[1]
        audio_bytes = base64.b64decode(raw_b64)
    except Exception as b64_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to decode base64 audio: {b64_err}"
        )

    if len(audio_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Decoded audio is empty."
        )

    if len(audio_bytes) > MAX_AUDIO_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Audio payload exceeds maximum allowed size."
        )

    analyze_sent = data.analyze_sentiment
    if data.enrich_sentiment is not None:
        analyze_sent = data.enrich_sentiment

    result = transcription_service.transcribe_audio(
        audio_input=audio_bytes,
        language=data.language,
        analyze_sentiment=analyze_sent,
        session=session,
        current_user=current_user,
        db=db,
    )

    return result


@router.get("/session/{session_id}/history", response_model=List[SessionTranscriptItem])
def get_session_transcripts(
    session_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Retrieve historic speech transcripts recorded for a classroom session.
    """
    _verify_session_access(db, session_id, current_user)

    rows = db.execute(
        select(SpeechAnalysis, SessionParticipant, User)
        .outerjoin(SessionParticipant, SpeechAnalysis.participant_id == SessionParticipant.id)
        .outerjoin(User, SessionParticipant.user_id == User.id)
        .where(SpeechAnalysis.session_id == session_id)
        .order_by(desc(SpeechAnalysis.sampled_at))
        .limit(50)
    ).all()

    items: List[SessionTranscriptItem] = []
    for sa, sp, u in rows:
        speaker_name = u.full_name if u else "Unknown"
        role_str = sp.role.value if sp else None
        text_content = sa.transcript_text or ""
        is_kn = bool(re.search(r'[\u0C80-\u0CFF]', text_content))
        is_hi = bool(re.search(r'[\u0900-\u097F]', text_content))
        lang_code = "kn" if is_kn else ("hi" if is_hi else "en")
        items.append(
            SessionTranscriptItem(
                id=sa.id,
                session_id=sa.session_id,
                participant_id=sa.participant_id,
                speaker_name=speaker_name,
                role=role_str,
                speaker_role=role_str,
                sampled_at=sa.sampled_at,
                created_at=sa.sampled_at,
                transcript_text=text_content,
                text=text_content,
                language=lang_code,
                sentiment_label=sa.speech_emotion,
            )
        )

    return items


@router.post("/analyze-text", response_model=SentimentAnalysisResult)
def analyze_transcript_text(
    data: TextSentimentRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Directly analyze text sentiment and educational intent for a transcript.
    Enables students and teachers to review, edit, and rerun sentiment analysis without re-uploading audio.
    """
    if not data.text or not data.text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Transcript text cannot be empty."
        )
    return analytics_service.process_text_sentiment(
        text=data.text.strip(),
        language=data.language or "auto",
    )

