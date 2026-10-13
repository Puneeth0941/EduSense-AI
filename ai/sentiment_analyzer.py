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

        # Confusion / Negative words
        "confused": -2.0, "confusing": -2.1, "hard": -1.2, "difficult": -1.5,
        "lost": -2.0, "unclear": -1.8, "bad": -1.5, "poor": -1.7,
        "wrong": -1.5, "stuck": -1.8, "cannot": -1.0, "dont understand": -2.2,
        "boring": -2.0, "slow": -1.0, "fast": -0.8, "help": -1.0, "doubt": -0.8,
    }

    # Negation words that invert sentiment
    NEGATIONS = {"not", "no", "never", "n't", "don't", "doesn't", "didn't", "cannot", "cant"}

    # Question indicator words
    QUESTION_WORDS = {"what", "why", "how", "when", "where", "who", "which", "can", "could", "would", "is", "are"}

    # Confusion indicator terms
    CONFUSION_TERMS = {
        "confused", "don't understand", "dont understand", "lost", "unclear",
        "repeat", "explain", "what does", "hard to follow", "can you clarify", "doubt"
    }

    def analyze_text(self, text: str, language: str = "en") -> Dict[str, Any]:
        """
        Analyze an input text string.

        Validates input and returns normalized compound score [-1.0, +1.0],
        sentiment label ('positive', 'neutral', 'negative', 'confused', or 'unsupported_language'),
        and question intent metadata.
        """
        if text is None or not isinstance(text, str) or not text.strip():
            return {
                "valid_input": False,
                "text": text if isinstance(text, str) else "",
                "sentiment_score": 0.0,
                "sentiment_label": "neutral",
                "is_question": False,
                "is_confusion": False,
                "confidence": 0.0,
                "language": (language or "en").strip().lower(),
                "language_supported": True if (language or "en").strip().lower() in ["en", "english", "auto"] else False,
                "status": "insufficient_data",
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
                "note": f"Rule-based text sentiment analysis is currently English-only. Sentiment for '{detected_code}' is unsupported.",
            }

        lower_text = cleaned_text.lower()
        tokens = re.findall(r"\b\w+\b", lower_text)

        if not tokens:
            return {
                "valid_input": False,
                "text": cleaned_text,
                "sentiment_score": 0.0,
                "sentiment_label": "neutral",
                "is_question": False,
                "is_confusion": False,
                "confidence": 0.0,
                "language": "en",
                "language_supported": True,
                "status": "insufficient_data",
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

        # Categorize sentiment label
        if is_confusion:
            sentiment_label = "confused"
        elif compound >= 0.05:
            sentiment_label = "positive"
        elif compound <= -0.05:
            sentiment_label = "negative"
        else:
            sentiment_label = "neutral"

        # Heuristic coverage without presenting as calibrated model probability
        heuristic_coverage = round(float(words_scored / max(len(tokens), 1)), 2) if words_scored > 0 else (0.50 if (is_question or is_confusion) else 0.0)

        return {
            "valid_input": True,
            "text": cleaned_text,
            "sentiment_score": round(float(compound), 3),
            "sentiment_label": sentiment_label,
            "is_question": is_question,
            "is_confusion": is_confusion,
            "confidence": heuristic_coverage,
            "language": "en",
            "language_supported": True,
            "status": "analyzed",
        }
