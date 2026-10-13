"""
Analytics Service for EduSense AI.

Orchestrates facial emotion/pose analysis, text sentiment analysis,
distraction logging, and composite multimodal engagement score calculation.
"""

import sys
import os
import re
from typing import Dict, Any, List, Optional
from uuid import UUID

# Ensure project root is on sys.path to locate top-level 'ai' module
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from ai.facial_emotion import FacialEmotionAnalyzer
from ai.sentiment_analyzer import TextSentimentAnalyzer

from app.schemas.analytics import (
    FacialAnalysisResult,
    SentimentAnalysisResult,
    StudentEngagementSummary,
    StudentSpeechSentimentSummary,
    ClassroomSpeechSentimentSummary,
    RecentTranscriptSnippet,
    StudentFacialSummary,
)


class AnalyticsService:
    """
    Service for calculating multimodal engagement metrics and orchestrating AI analysis.
    """

    def __init__(
        self,
        weight_attentiveness: float = 0.60,
        weight_participation: float = 0.25,
        weight_sentiment: float = 0.15,
    ):
        # Configurable formula weights
        self.w_attentiveness = weight_attentiveness
        self.w_participation = weight_participation
        self.w_sentiment = weight_sentiment

        # Initialize isolated AI analyzer engines
        self.facial_analyzer = FacialEmotionAnalyzer()
        self.sentiment_analyzer = TextSentimentAnalyzer()

    def process_facial_frame(self, frame_bytes_or_array: Any) -> FacialAnalysisResult:
        """
        Process a classroom video frame using the facial emotion analyzer.
        """
        res = self.facial_analyzer.analyze_frame(frame_bytes_or_array)
        return FacialAnalysisResult(**res)

    def process_text_sentiment(
        self, text: str, language: Optional[str] = "en"
    ) -> SentimentAnalysisResult:
        """
        Process classroom chat or transcript text using the sentiment analyzer.
        """
        res = self.sentiment_analyzer.analyze_text(text, language=language or "en")
        return SentimentAnalysisResult(**res)

    def calculate_composite_engagement(
        self,
        attentiveness_subscore: Optional[float] = None,  # 0 to 100
        participation_subscore: Optional[float] = None,  # 0 to 100
        sentiment_subscore: Optional[float] = None,      # 0 to 100
    ) -> Optional[float]:
        """
        Calculate composite student engagement score (0 to 100%).

        Handles unavailable signals gracefully without treating missing signals as zero:
        re-normalizes available weights dynamically. Returns None if no signals exist.
        """
        available_signals: List[tuple[float, float]] = []

        if attentiveness_subscore is not None:
            # Clamp to [0, 100]
            val = max(0.0, min(100.0, float(attentiveness_subscore)))
            available_signals.append((val, self.w_attentiveness))

        if participation_subscore is not None:
            val = max(0.0, min(100.0, float(participation_subscore)))
            available_signals.append((val, self.w_participation))

        if sentiment_subscore is not None:
            val = max(0.0, min(100.0, float(sentiment_subscore)))
            available_signals.append((val, self.w_sentiment))

        if not available_signals:
            return None

        # Dynamically re-normalize weights for present signals only
        total_weight = sum(weight for _, weight in available_signals)
        if total_weight <= 0:
            return None

        weighted_score_sum = sum(score * weight for score, weight in available_signals)
        composite = weighted_score_sum / total_weight
        return round(float(composite), 2)

    def normalize_sentiment_to_subscore(self, sentiment_score: float) -> float:
        """
        Normalize sentiment score [-1.0, +1.0] to a [0.0, 100.0] subscore.
        -1.0 maps to 0.0, 0.0 maps to 50.0, +1.0 maps to 100.0.
        """
        clamped = max(-1.0, min(1.0, float(sentiment_score)))
        return round(((clamped + 1.0) / 2.0) * 100.0, 2)

    def aggregate_student_window_facial_emotion(
        self, samples: List[Any], confidence_threshold: float = 0.20
    ) -> Dict[str, Any]:
        """
        Aggregate 3 (or available) facial-analysis samples for a single student in a 5-minute window.
        Uses probability-based averaging across valid samples.
        Ignores uncertain or invalid observations.
        If all samples are invalid/uncertain, returns dominant_expression = 'insufficient_data'.
        """
        allowed_emotions = ["neutral", "happy", "sad", "angry", "fear"]
        valid_samples = []

        for s in samples:
            dom = getattr(s, "dominant_emotion", None) if not isinstance(s, dict) else s.get("dominant_emotion")
            probs = getattr(s, "emotion_probabilities", None) if not isinstance(s, dict) else s.get("emotion_probabilities")

            if not dom or dom in ["unknown", "invalid_input", "no_face_detected", "uncertain"]:
                continue
            if dom not in allowed_emotions:
                continue

            valid_samples.append((dom, probs or {}))

        if not valid_samples:
            return {
                "dominant_expression": "insufficient_data",
                "confidence": 0.0,
                "sample_count": len(samples),
                "valid_sample_count": 0,
                "expression_probabilities": {em: 0.0 for em in allowed_emotions},
            }

        sum_probs = {em: 0.0 for em in allowed_emotions}
        for dom, probs in valid_samples:
            if probs and isinstance(probs, dict):
                for em in allowed_emotions:
                    sum_probs[em] += float(probs.get(em, 0.0))
            else:
                sum_probs[dom] += 1.0

        n_valid = len(valid_samples)
        avg_probs = {em: round(sum_probs[em] / n_valid, 4) for em in allowed_emotions}
        top_emotion = max(allowed_emotions, key=lambda em: avg_probs[em])
        top_prob = avg_probs[top_emotion]

        if top_prob <= 0.0:
            top_emotion = "insufficient_data"

        return {
            "dominant_expression": top_emotion,
            "confidence": top_prob,
            "sample_count": len(samples),
            "valid_sample_count": n_valid,
            "expression_probabilities": avg_probs,
        }

    def aggregate_classroom_window_facial_emotion(
        self, student_window_results: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Aggregate student 5-minute window results into a single classroom 5-minute result.
        Each student with a valid expression contributes EXACTLY ONE vote to the classroom window.
        """
        allowed_emotions = ["neutral", "happy", "sad", "angry", "fear"]
        total_students = len(student_window_results)
        valid_votes = {em: 0 for em in allowed_emotions}
        students_with_valid = 0
        students_insufficient = 0

        for res in student_window_results:
            dom = res.get("dominant_expression")
            if dom in allowed_emotions:
                valid_votes[dom] += 1
                students_with_valid += 1
            else:
                students_insufficient += 1

        expression_distribution = {}
        for em in allowed_emotions:
            if students_with_valid > 0:
                expression_distribution[em] = round(valid_votes[em] / students_with_valid, 4)
            else:
                expression_distribution[em] = 0.0

        dominant_classroom = "insufficient_data"
        if students_with_valid > 0:
            dominant_classroom = max(allowed_emotions, key=lambda em: valid_votes[em])

        return {
            "dominant_expression": dominant_classroom,
            "expression_distribution": expression_distribution,
            "total_students": total_students,
            "students_with_valid_expression": students_with_valid,
            "students_with_insufficient_data": students_insufficient,
        }

    def aggregate_session_facial_emotion(
        self, window_classroom_results: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Aggregate 5-minute window results across an entire session with equal weighting per window.
        """
        allowed_emotions = ["neutral", "happy", "sad", "angry", "fear"]
        valid_windows = [w for w in window_classroom_results if w.get("dominant_expression") in allowed_emotions]
        total_windows = len(window_classroom_results)

        if not valid_windows:
            return {
                "dominant_expression": "insufficient_data",
                "expression_distribution": {em: 0.0 for em in allowed_emotions},
                "total_windows": total_windows,
                "valid_windows": 0,
            }

        sum_dist = {em: 0.0 for em in allowed_emotions}
        for w in valid_windows:
            dist = w.get("expression_distribution", {})
            for em in allowed_emotions:
                sum_dist[em] += float(dist.get(em, 0.0))

        n_valid_w = len(valid_windows)
        avg_session_dist = {em: round(sum_dist[em] / n_valid_w, 4) for em in allowed_emotions}
        session_dominant = max(allowed_emotions, key=lambda em: avg_session_dist[em])

        return {
            "dominant_expression": session_dominant,
            "expression_distribution": avg_session_dist,
            "total_windows": total_windows,
            "valid_windows": n_valid_w,
        }

    def aggregate_student_session_facial_emotion(
        self, samples: List[Any], student_id: UUID, session_start: Optional[Any] = None
    ) -> StudentFacialSummary:
        """
        Aggregate facial-analysis samples for a student across an entire session.
        Calculates dominant expression, probability distribution, valid samples count,
        valid 5-minute windows count, average attentiveness score, and head-pose orientation.
        Returns explicit 'insufficient_data' if samples are missing or invalid.
        """
        allowed_emotions = ["neutral", "happy", "sad", "angry", "fear"]
        if not samples:
            return StudentFacialSummary(
                student_id=student_id,
                dominant_expression="insufficient_data",
                expression_distribution={em: 0.0 for em in allowed_emotions},
                total_samples=0,
                valid_samples=0,
                valid_windows=0,
                attentiveness_score=None,
                head_pose_orientation=None,
                status="insufficient_data",
            )

        valid_samples = []
        valid_windows = set()
        attentiveness_scores = []
        head_poses = []

        for s in samples:
            dom = getattr(s, "dominant_emotion", None) if not isinstance(s, dict) else s.get("dominant_emotion")
            probs = getattr(s, "emotion_probabilities", None) if not isinstance(s, dict) else s.get("emotion_probabilities")
            att = getattr(s, "attentiveness_score", None) if not isinstance(s, dict) else s.get("attentiveness_score")
            pose = getattr(s, "head_pose", None) if not isinstance(s, dict) else s.get("head_pose")
            sampled_at = getattr(s, "sampled_at", None) if not isinstance(s, dict) else s.get("sampled_at")

            # Check validity
            if not dom or dom in ["unknown", "invalid_input", "no_face_detected", "uncertain"]:
                continue
            if dom not in allowed_emotions:
                continue

            valid_samples.append((dom, probs or {}))

            if att is not None:
                attentiveness_scores.append(float(att))

            if pose:
                head_poses.append(str(pose))

            if sampled_at:
                if session_start:
                    try:
                        s_time = sampled_at
                        start_time = session_start
                        if s_time.tzinfo is None and start_time.tzinfo is not None:
                            s_time = s_time.replace(tzinfo=start_time.tzinfo)
                        elif s_time.tzinfo is not None and start_time.tzinfo is None:
                            start_time = start_time.replace(tzinfo=s_time.tzinfo)
                        diff = max(0.0, (s_time - start_time).total_seconds())
                        w_idx = int(diff // 300)
                        valid_windows.add(w_idx)
                    except Exception:
                        valid_windows.add(str(sampled_at)[:16])
                else:
                    valid_windows.add(str(sampled_at)[:16])

        if not valid_samples:
            return StudentFacialSummary(
                student_id=student_id,
                dominant_expression="insufficient_data",
                expression_distribution={em: 0.0 for em in allowed_emotions},
                total_samples=len(samples),
                valid_samples=0,
                valid_windows=0,
                attentiveness_score=None,
                head_pose_orientation=None,
                status="insufficient_data",
            )

        sum_probs = {em: 0.0 for em in allowed_emotions}
        for dom, probs in valid_samples:
            if probs and isinstance(probs, dict):
                for em in allowed_emotions:
                    sum_probs[em] += float(probs.get(em, 0.0))
            else:
                sum_probs[dom] += 1.0

        n_valid = len(valid_samples)
        avg_probs = {em: round(sum_probs[em] / n_valid, 4) for em in allowed_emotions}
        top_emotion = max(allowed_emotions, key=lambda em: avg_probs[em])
        if avg_probs[top_emotion] <= 0.0:
            top_emotion = "insufficient_data"

        avg_att = None
        if attentiveness_scores:
            avg_att = round((sum(attentiveness_scores) / len(attentiveness_scores)) * 100.0, 1)

        most_common_pose = None
        if head_poses:
            from collections import Counter
            most_common_pose = Counter(head_poses).most_common(1)[0][0]

        return StudentFacialSummary(
            student_id=student_id,
            dominant_expression=top_emotion,
            expression_distribution=avg_probs,
            total_samples=len(samples),
            valid_samples=n_valid,
            valid_windows=max(1, len(valid_windows)),
            attentiveness_score=avg_att,
            head_pose_orientation=most_common_pose,
            status="analyzed",
        )

    def aggregate_student_speech_sentiment(
        self, records: List[Any], student_id: UUID
    ) -> StudentSpeechSentimentSummary:
        """
        Aggregate speech transcript sentiment records for an individual student.
        Calculates valid percentages excluding unsupported languages.
        """
        if not records:
            return StudentSpeechSentimentSummary(
                student_id=student_id,
                total_segments=0,
                valid_analyzed_segments=0,
                dominant_status="no_transcripts",
            )

        positive_count = 0
        negative_count = 0
        neutral_count = 0
        confused_count = 0
        unsupported_count = 0
        lang_counts: Dict[str, int] = {}
        snippets: List[RecentTranscriptSnippet] = []

        # Sort by sampled_at descending
        sorted_records = sorted(records, key=lambda r: getattr(r, "sampled_at", None) or 0, reverse=True)

        for r in sorted_records:
            text = (getattr(r, "transcript_text", "") or "").strip()
            emotion = (getattr(r, "speech_emotion", "") or "").strip().lower()

            # Script/language detection
            is_kn = bool(re.search(r'[\u0C80-\u0CFF]', text))
            is_hi = bool(re.search(r'[\u0900-\u097F]', text))
            rec_lang = "kn" if is_kn else ("hi" if is_hi else "en")
            lang_counts[rec_lang] = lang_counts.get(rec_lang, 0) + 1

            if emotion == "unsupported_language" or rec_lang in ["kn", "hi"]:
                unsupported_count += 1
            elif emotion == "positive":
                positive_count += 1
            elif emotion == "negative":
                negative_count += 1
            elif emotion == "confused":
                confused_count += 1
            elif emotion == "neutral":
                neutral_count += 1
            else:
                if rec_lang == "en":
                    neutral_count += 1
                else:
                    unsupported_count += 1

            if len(snippets) < 3:
                snippets.append(
                    RecentTranscriptSnippet(
                        id=r.id,
                        timestamp=r.sampled_at,
                        transcript_text=text,
                        language=rec_lang,
                        sentiment_label=emotion or ("unsupported_language" if rec_lang != "en" else "neutral"),
                    )
                )

        valid_segments = positive_count + negative_count + neutral_count + confused_count
        dominant_language = max(lang_counts.keys(), key=lambda k: lang_counts[k]) if lang_counts else "en"

        if valid_segments > 0:
            pos_pct = round((positive_count / valid_segments) * 100.0, 1)
            neg_pct = round((negative_count / valid_segments) * 100.0, 1)
            neu_pct = round((neutral_count / valid_segments) * 100.0, 1)
            conf_pct = round((confused_count / valid_segments) * 100.0, 1)

            counts = {
                "positive": positive_count,
                "negative": negative_count,
                "neutral": neutral_count,
                "confused": confused_count,
            }
            dominant_sentiment = max(counts.keys(), key=lambda k: counts[k])
            dominant_status = "analyzed"
        else:
            pos_pct = neg_pct = neu_pct = conf_pct = 0.0
            dominant_sentiment = None
            dominant_status = "unsupported_language" if unsupported_count > 0 else "insufficient_data"

        return StudentSpeechSentimentSummary(
            student_id=student_id,
            total_segments=len(records),
            valid_analyzed_segments=valid_segments,
            unsupported_language_segments=unsupported_count,
            positive_count=positive_count,
            negative_count=negative_count,
            neutral_count=neutral_count,
            confused_count=confused_count,
            positive_percentage=pos_pct,
            negative_percentage=neg_pct,
            neutral_percentage=neu_pct,
            confused_percentage=conf_pct,
            dominant_sentiment=dominant_sentiment,
            dominant_status=dominant_status,
            dominant_language=dominant_language,
            recent_snippets=snippets,
        )

    def aggregate_classroom_speech_sentiment(
        self, session_id: UUID, records: List[Any]
    ) -> ClassroomSpeechSentimentSummary:
        """
        Aggregate student speech transcripts into a session-wide speech sentiment summary.
        Excludes teacher speech and unsupported languages from percentages.
        """
        if not records:
            return ClassroomSpeechSentimentSummary(
                session_id=session_id,
                total_student_transcripts=0,
                valid_analyzed_transcripts=0,
                status="no_transcripts",
            )

        positive_count = 0
        negative_count = 0
        neutral_count = 0
        confused_count = 0
        unsupported_count = 0

        for r in records:
            text = (getattr(r, "transcript_text", "") or "").strip()
            emotion = (getattr(r, "speech_emotion", "") or "").strip().lower()

            is_kn = bool(re.search(r'[\u0C80-\u0CFF]', text))
            is_hi = bool(re.search(r'[\u0900-\u097F]', text))
            rec_lang = "kn" if is_kn else ("hi" if is_hi else "en")

            if emotion == "unsupported_language" or rec_lang in ["kn", "hi"]:
                unsupported_count += 1
            elif emotion == "positive":
                positive_count += 1
            elif emotion == "negative":
                negative_count += 1
            elif emotion == "confused":
                confused_count += 1
            elif emotion == "neutral":
                neutral_count += 1
            else:
                if rec_lang == "en":
                    neutral_count += 1
                else:
                    unsupported_count += 1

        valid_count = positive_count + negative_count + neutral_count + confused_count
        if valid_count > 0:
            pos_pct = round((positive_count / valid_count) * 100.0, 1)
            neg_pct = round((negative_count / valid_count) * 100.0, 1)
            neu_pct = round((neutral_count / valid_count) * 100.0, 1)
            conf_pct = round((confused_count / valid_count) * 100.0, 1)

            counts = {
                "positive": positive_count,
                "negative": negative_count,
                "neutral": neutral_count,
                "confused": confused_count,
            }
            dominant = max(counts.keys(), key=lambda k: counts[k])
            status = "active"
        else:
            pos_pct = neg_pct = neu_pct = conf_pct = 0.0
            dominant = None
            status = "unsupported_language" if unsupported_count > 0 else "insufficient_data"

        return ClassroomSpeechSentimentSummary(
            session_id=session_id,
            total_student_transcripts=len(records),
            valid_analyzed_transcripts=valid_count,
            unsupported_language_transcripts=unsupported_count,
            positive_count=positive_count,
            negative_count=negative_count,
            neutral_count=neutral_count,
            confused_count=confused_count,
            positive_percentage=pos_pct,
            negative_percentage=neg_pct,
            neutral_percentage=neu_pct,
            confused_percentage=conf_pct,
            dominant_sentiment=dominant,
            status=status,
        )


# Instantiate default service instance
analytics_service = AnalyticsService()
