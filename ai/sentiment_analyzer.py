"""
Text Sentiment & Intent Analyzer for EduSense AI.

This module provides rule-based text sentiment scoring (VADER algorithm implementation)
and heuristic question & confusion intent detection for classroom chat messages and speech snippets.

Limitations:
- VADER / Rule-based lexicon works best for English short text and classroom chat messages.
- Does not capture domain-specific sarcasm or complex multi-lingual context.
"""

import re
import math
from typing import Dict, Any, List


class TextSentimentAnalyzer:
    """
    Analyzes classroom text messages for sentiment score (-1.0 to +1.0),
    sentiment label, and specific intents (question / confusion).
    """

    # Lexicon dictionary for valence scores of common classroom sentiment words
    BETA_LEXICON = {
        # Positive / Engaged words
        "great": 2.0, "good": 1.9, "excellent": 3.0, "awesome": 2.8,
        "clear": 1.8, "understand": 1.5, "understood": 1.8, "helpful": 2.0,
        "thanks": 1.5, "thank": 1.5, "like": 1.2, "enjoy": 1.8, "love": 2.5,
        "perfect": 2.2, "gotit": 1.5, "interesting": 1.6, "brilliant": 2.5,
        "easy": 1.5, "solved": 1.6, "nice": 1.4, "glad": 1.5, "informative": 1.7,
        "well": 1.2, "appreciated": 1.8, "super": 2.0, "satisfying": 1.6,

        # Confusion / Negative words
        "confused": -2.0, "confusing": -2.1, "hard": -1.2, "difficult": -1.5,
        "lost": -2.0, "unclear": -1.8, "bad": -1.5, "poor": -1.7,
        "wrong": -1.5, "stuck": -1.8, "cannot": -1.0, "dont understand": -2.2,
        "boring": -2.0, "slow": -1.0, "fast": -0.8, "help": -1.0, "doubt": -0.8,
        "fail": -1.8, "failed": -1.8, "terrible": -2.5, "awful": -2.5,
        "complicated": -1.4, "tough": -1.2, "struggling": -1.8, "error": -1.4,
    }

    # Negation words that invert sentiment
    NEGATIONS = {"not", "no", "never", "n't", "don't", "doesn't", "didn't", "cannot", "cant"}

    # Question indicator words
    QUESTION_WORDS = {"what", "why", "how", "when", "where", "who", "which", "can", "could", "would", "is", "are"}

    # Confusion indicator terms
    CONFUSION_TERMS = {
        "confused", "confusing", "don't understand", "dont understand",
        "cannot understand", "cant understand", "completely lost", "unclear",
        "hard to follow", "having trouble", "struggling"
    }

    def analyze_text(self, text: str, language: str = "en") -> Dict[str, Any]:
        """
        Analyze an input text string.

        Validates input and returns normalized compound score [-1.0, +1.0],
        sentiment label ('positive', 'neutral', 'negative', or 'unsupported_language'),
        and question intent metadata.
        """
        if text is None or not isinstance(text, str) or not text.strip():
            return {
                "valid_input": False,
                "text": text if isinstance(text, str) else "",
                "sentiment_score": None,
                "sentiment_label": "neutral",
                "is_question": False,
                "is_confusion": False,
                "confidence": 0.0,
                "language": (language or "en").strip().lower(),
                "language_supported": True if (language or "en").strip().lower() in ["en", "english", "auto"] else False,
                "status": "insufficient_data",
                "note": "Input text is empty or missing.",
            }

        cleaned_text = text.strip()
        norm_lang = (language or "en").strip().lower()

        # Check for Kannada or Hindi scripts or explicit language codes
        is_kannada = bool(re.search(r'[\u0C80-\u0CFF]', cleaned_text))
        is_hindi = bool(re.search(r'[\u0900-\u097F]', cleaned_text))

        if norm_lang in ["kn", "kannada"] or is_kannada or norm_lang in ["hi", "hindi"] or is_hindi:
            detected_code = "kn" if (norm_lang in ["kn", "kannada"] or is_kannada) else "hi"
            return {
                "valid_input": True,
                "text": cleaned_text,
                "sentiment_score": None,
                "sentiment_label": "unsupported_language",
                "is_question": "?" in cleaned_text,
                "is_confusion": False,
                "confidence": None,
                "language": detected_code,
                "language_supported": False,
                "status": "unsupported_language",
                "note": f"Rule-based text sentiment analysis is verified for English. Sentiment for '{detected_code}' is unsupported.",
            }

        lower_text = cleaned_text.lower()
        tokens = re.findall(r"\b\w+\b", lower_text)

        if not tokens:
            return {
                "valid_input": False,
                "text": cleaned_text,
                "sentiment_score": None,
                "sentiment_label": "neutral",
                "is_question": False,
                "is_confusion": False,
                "confidence": 0.0,
                "language": "en",
                "language_supported": True,
                "status": "insufficient_data",
                "note": "No word tokens found in input text.",
            }

        # Calculate sentiment score using Lexicon valence + negations
        total_valence = 0.0
        words_scored = 0

        for i, word in enumerate(tokens):
            if word in self.BETA_LEXICON:
                valence = self.BETA_LEXICON[word]

                # Check if preceding word is a negation
                if i > 0 and tokens[i-1] in self.NEGATIONS:
                    valence = -valence * 0.8

                total_valence += valence
                words_scored += 1

        # Calculate compound score using VADER-like normalization formula: s / sqrt(s^2 + alpha)
        if words_scored > 0:
            alpha = 15.0
            compound = total_valence / math.sqrt(total_valence ** 2 + alpha)
        else:
            compound = 0.0

        # Heuristic intent detection
        is_question = "?" in cleaned_text or (len(tokens) > 0 and tokens[0] in self.QUESTION_WORDS)
        is_confusion = any(term in lower_text for term in self.CONFUSION_TERMS)

        # Categorize strictly into supported 3-class sentiment labels: positive, negative, neutral
        if compound >= 0.05:
            sentiment_label = "positive"
        elif compound <= -0.05:
            sentiment_label = "negative"
        elif is_confusion and not is_question:
            sentiment_label = "negative"
        else:
            sentiment_label = "neutral"

        # Confidence calibrated based on token coverage and compound certainty
        if words_scored > 0:
            confidence = round(min(0.95, 0.60 + 0.35 * abs(compound)), 2)
        elif is_question or is_confusion:
            confidence = 0.70
        else:
            confidence = 0.75  # Factual statement classified as neutral

        return {
            "valid_input": True,
            "text": cleaned_text,
            "sentiment_score": round(float(compound), 3),
            "sentiment_label": sentiment_label,
            "is_question": is_question,
            "is_confusion": is_confusion,
            "confidence": confidence,
            "language": "en",
            "language_supported": True,
            "status": "analyzed",
        }


sentiment_analyzer = TextSentimentAnalyzer()

