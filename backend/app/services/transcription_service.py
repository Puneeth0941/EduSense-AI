"""
Transcription Service for EduSense AI.

Orchestrates Whisper AI speech-to-text, text-sentiment analysis integration,
and optional database persistence in speech_analyses.
"""

import sys
import os
import logging
from typing import Dict, Any, Optional, Union, BinaryIO
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import select

# Ensure project root is on sys.path
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from ai.speech_transcriber import speech_transcriber, SUPPORTED_LANGUAGES, SpeechTranscriber
from app.services.analytics_service import analytics_service
from app.models.user import User
from app.models.session import ClassSession, SessionParticipant
from app.models.stubs import SpeechAnalysis, SentimentAnalysis, EngagementMetric
from app.models.enums import UserRole
from app.schemas.transcription import (
    TranscriptionResponse,
    TranscriptSegment,
    LanguageOption,
)
from app.schemas.analytics import SentimentAnalysisResult

logger = logging.getLogger(__name__)


class TranscriptionService:
    """
    Service coordinating Whisper AI speech recognition and sentiment scoring.
    """

    def __init__(self, transcriber: Optional[SpeechTranscriber] = None):
        self.transcriber = transcriber or speech_transcriber

    def get_supported_languages(self) -> list[LanguageOption]:
        """Returns list of supported transcription languages."""
        return [
            LanguageOption(code=code, name=name)
            for code, name in SUPPORTED_LANGUAGES.items()
        ]

    def transcribe_audio(
        self,
        audio_input: Union[bytes, BinaryIO, str],
        language: Optional[str] = "auto",
        analyze_sentiment: bool = True,
        session: Optional[ClassSession] = None,
        current_user: Optional[User] = None,
        db: Optional[Session] = None,
    ) -> TranscriptionResponse:
        """
        Transcribes speech audio, optionally evaluates text sentiment,
        and optionally persists to PostgreSQL speech_analyses.
        """
        raw_res = self.transcriber.transcribe(audio_input, language=language)

        valid_input = raw_res.get("valid_input", False)
        transcript_text = raw_res.get("text", "")
        detected_lang = raw_res.get("language")
        lang_prob = raw_res.get("language_probability")
        duration = raw_res.get("duration_seconds", 0.0)
        raw_segments = raw_res.get("segments", [])
        error_msg = raw_res.get("error")
        quality_status = raw_res.get("quality_status", "reliable")
        is_low_confidence = raw_res.get("is_low_confidence", False)

        segments = [
            TranscriptSegment(start=s["start"], end=s["end"], text=s["text"])
            for s in raw_segments
        ]

        sentiment_res: Optional[SentimentAnalysisResult] = None
        if analyze_sentiment and transcript_text.strip():
            try:
                sentiment_res = analytics_service.process_text_sentiment(
                    transcript_text, language=detected_lang
                )
            except Exception as sent_err:
                logger.warning(f"[SENTIMENT ENRICHMENT ERROR] Sentiment analysis failed on transcript: {sent_err}")

        persisted = False
        saved_analysis_id: Optional[Any] = None

        if session and current_user and db and transcript_text.strip():
            try:
                # Find or create verified participant record for this user in session
                participant = db.scalar(
                    select(SessionParticipant).where(
                        SessionParticipant.session_id == session.id,
                        SessionParticipant.user_id == current_user.id,
                    )
                )

                now = datetime.now(timezone.utc)
                clean_text = transcript_text.strip()

                if not participant:
                    participant = SessionParticipant(
                        session_id=session.id,
                        user_id=current_user.id,
                        role=current_user.role,
                        joined_at=now,
                    )
                    db.add(participant)
                    db.flush()

                # Phase 4 Idempotency / Deduplication:
                # Check if exact same transcript was recorded for this participant within a 12-second window
                window_start = now - timedelta(seconds=12)
                existing_speech = db.scalar(
                    select(SpeechAnalysis).where(
                        SpeechAnalysis.session_id == session.id,
                        SpeechAnalysis.participant_id == participant.id,
                        SpeechAnalysis.transcript_text == clean_text,
                        SpeechAnalysis.sampled_at >= window_start,
                    ).order_by(SpeechAnalysis.sampled_at.desc())
                )

                if existing_speech:
                    logger.info(
                        f"[SPEECH DEDUP] Skipping duplicate transcript for participant {participant.id} within 8s window."
                    )
                    existing_sent = db.scalar(
                        select(SentimentAnalysis).where(
                            SentimentAnalysis.session_id == session.id,
                            SentimentAnalysis.user_id == current_user.id,
                            SentimentAnalysis.created_at >= window_start,
                        ).order_by(SentimentAnalysis.created_at.desc())
                    )
                    return TranscriptionResponse(
                        valid_input=valid_input,
                        text=clean_text,
                        language=detected_lang,
                        language_probability=lang_prob,
                        duration_seconds=duration,
                        duration=duration,
                        segments=segments,
                        sentiment=sentiment_res,
                        session_id=session.id,
                        persisted=True,
                        analysis_id=existing_speech.id,
                        sentiment_label=existing_speech.speech_emotion,
                        sentiment_score=existing_sent.sentiment_score if existing_sent else None,
                        is_question=sentiment_res.is_question if sentiment_res else False,
                        is_confusion=sentiment_res.is_confusion if sentiment_res else False,
                        quality_status=quality_status,
                        is_low_confidence=is_low_confidence,
                        error=error_msg,
                    )

                # Atomic persistence of transcript, sentiment, and engagement records
                speech_entry = SpeechAnalysis(
                    session_id=session.id,
                    participant_id=participant.id,
                    transcript_text=clean_text,
                    speech_emotion=sentiment_res.sentiment_label if sentiment_res else None,
                    sampled_at=now,
                )
                db.add(speech_entry)

                if sentiment_res:
                    sent_entry = SentimentAnalysis(
                        session_id=session.id,
                        user_id=current_user.id,
                        sentiment_score=sentiment_res.sentiment_score,
                        text_content=f"[Speech] {clean_text}",
                        sentiment_label=sentiment_res.sentiment_label,
                        created_at=now,
                    )
                    db.add(sent_entry)

                    # Update student engagement metric only for students (not teachers)
                    if current_user.role == UserRole.STUDENT and current_user.student_profile:
                        sentiment_sub: Optional[float] = None
                        if sentiment_res.sentiment_score is not None:
                            sentiment_sub = analytics_service.normalize_sentiment_to_subscore(
                                sentiment_res.sentiment_score
                            )

                        composite = analytics_service.calculate_composite_engagement(
                            participation_subscore=85.0,  # Active verbal participation
                            sentiment_subscore=sentiment_sub,
                        )

                        eng_metric = EngagementMetric(
                            session_id=session.id,
                            student_id=current_user.student_profile.id,
                            engagement_score=composite,
                            sentiment_subscore=sentiment_sub,
                            participation_subscore=85.0,
                            timestamp=now,
                        )
                        db.add(eng_metric)

                db.commit()
                persisted = True
                saved_analysis_id = speech_entry.id
                logger.info(
                    f"[SPEECH TRANSCRIPTION PERSIST] Saved speech transcript for user {current_user.id} in session {session.id}."
                )
            except Exception as db_err:
                db.rollback()
                logger.error(f"[SPEECH DB SAVE ERROR] Could not persist transcript record: {db_err}")

        return TranscriptionResponse(
            valid_input=valid_input,
            text=transcript_text,
            language=detected_lang,
            language_probability=lang_prob,
            duration_seconds=duration,
            duration=duration,
            segments=segments,
            sentiment=sentiment_res,
            session_id=session.id if session else None,
            persisted=persisted,
            analysis_id=saved_analysis_id,
            sentiment_label=sentiment_res.sentiment_label if sentiment_res else None,
            sentiment_score=sentiment_res.sentiment_score if sentiment_res else None,
            is_question=sentiment_res.is_question if sentiment_res else False,
            is_confusion=sentiment_res.is_confusion if sentiment_res else False,
            quality_status=quality_status,
            is_low_confidence=is_low_confidence,
            error=error_msg,
        )


# Default singleton instance
transcription_service = TranscriptionService()
