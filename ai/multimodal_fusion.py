"""
Multimodal Emotion Fusion for EduSense AI.

Combines visual facial expression predictions (camera) and acoustic speech emotion predictions (microphone)
using mathematically principled weighted late fusion:

    P_final = w_face * P_face + w_speech * P_speech

Features:
- Configurable, normalized weights (w_face + w_speech = 1.0).
- Consistent emotion class space (neutral, happy, sad, angry, fear).
- Single-modality graceful fallback when one channel is missing or uncalibrated.
- Conflict detection when strong opposing signals occur (e.g. happy face vs angry speech).
- Never fabricates synthetic predictions or hardcoded results.
"""

import logging
from typing import Dict, Any, Optional, Tuple, List

logger = logging.getLogger(__name__)

# Canonical shared emotion classes for late fusion
FUSION_CLASSES = ["neutral", "happy", "sad", "angry", "fear"]


class MultimodalEmotionFusion:
    """
    Implements weighted late fusion of facial expression and speech emotion probability distributions.
    """

    def __init__(self, w_face: float = 0.65, w_speech: float = 0.35):
        total_w = w_face + w_speech
        if total_w <= 0:
            self.w_face = 0.50
            self.w_speech = 0.50
        else:
            self.w_face = w_face / total_w
            self.w_speech = w_speech / total_w

    def fuse(
        self,
        face_probabilities: Optional[Dict[str, float]] = None,
        speech_probabilities: Optional[Dict[str, float]] = None,
        face_confidence: float = 0.0,
        speech_confidence: float = 0.0,
    ) -> Dict[str, Any]:
        """
        Execute late fusion over face and speech probability distributions.

        Returns structured result with:
        - dominant_emotion: top combined emotion or single modality emotion
        - fused_probabilities: mapped probability distribution
        - confidence: combined confidence score
        - modality: "bimodal", "face_only", "speech_only", or "none"
        - conflict_detected: bool indicating whether high-confidence predictions diverged
        - conflict_reason: descriptive message if conflict was found
        """
        # Validate availability of face probabilities
        has_face = bool(
            face_probabilities
            and isinstance(face_probabilities, dict)
            and any(face_probabilities.get(em, 0.0) > 0 for em in FUSION_CLASSES)
        )

        # Validate availability of speech probabilities
        has_speech = bool(
            speech_probabilities
            and isinstance(speech_probabilities, dict)
            and any(speech_probabilities.get(em, 0.0) > 0 for em in FUSION_CLASSES)
        )

        # Case 1: Neither modality available
        if not has_face and not has_speech:
            return {
                "dominant_emotion": "insufficient_data",
                "fused_probabilities": {em: 0.0 for em in FUSION_CLASSES},
                "confidence": 0.0,
                "modality": "none",
                "conflict_detected": False,
                "conflict_reason": None,
                "weights_used": {"face": 0.0, "speech": 0.0},
            }

        # Case 2: Face only available
        if has_face and not has_speech:
            norm_face = self._normalize_distribution(face_probabilities or {})
            top_em = max(FUSION_CLASSES, key=lambda em: norm_face[em])
            return {
                "dominant_emotion": top_em,
                "fused_probabilities": norm_face,
                "confidence": round(float(face_confidence or norm_face[top_em]), 3),
                "modality": "face_only",
                "conflict_detected": False,
                "conflict_reason": None,
                "weights_used": {"face": 1.0, "speech": 0.0},
            }

        # Case 3: Speech only available
        if has_speech and not has_face:
            norm_speech = self._normalize_distribution(speech_probabilities or {})
            top_em = max(FUSION_CLASSES, key=lambda em: norm_speech[em])
            return {
                "dominant_emotion": top_em,
                "fused_probabilities": norm_speech,
                "confidence": round(float(speech_confidence or norm_speech[top_em]), 3),
                "modality": "speech_only",
                "conflict_detected": False,
                "conflict_reason": None,
                "weights_used": {"face": 0.0, "speech": 1.0},
            }

        # Case 4: Both modalities present -> True Late Fusion
        norm_face = self._normalize_distribution(face_probabilities or {})
        norm_speech = self._normalize_distribution(speech_probabilities or {})

        top_face = max(FUSION_CLASSES, key=lambda em: norm_face[em])
        top_speech = max(FUSION_CLASSES, key=lambda em: norm_speech[em])

        fused_probs = {}
        for em in FUSION_CLASSES:
            val = (self.w_face * norm_face[em]) + (self.w_speech * norm_speech[em])
            fused_probs[em] = round(val, 4)

        top_em = max(FUSION_CLASSES, key=lambda em: fused_probs[em])
        combined_conf = round(float(fused_probs[top_em]), 3)

        # Conflict Detection:
        # If face and speech top predictions diverge AND both exhibit high individual confidence (> 0.50)
        conflict_detected = False
        conflict_reason = None
        if top_face != top_speech and norm_face[top_face] >= 0.50 and norm_speech[top_speech] >= 0.50:
            conflict_detected = True
            conflict_reason = (
                f"Diverging signals: facial visual pattern indicates '{top_face}' ({round(norm_face[top_face]*100)}%), "
                f"whereas vocal acoustic model indicates '{top_speech}' ({round(norm_speech[top_speech]*100)}%)."
            )
            logger.info("[MULTIMODAL FUSION CONFLICT] %s", conflict_reason)

        return {
            "dominant_emotion": top_em,
            "fused_probabilities": fused_probs,
            "confidence": combined_conf,
            "modality": "bimodal",
            "conflict_detected": conflict_detected,
            "conflict_reason": conflict_reason,
            "weights_used": {"face": self.w_face, "speech": self.w_speech},
        }

    @staticmethod
    def _normalize_distribution(probs: Dict[str, float]) -> Dict[str, float]:
        """Ensures probabilities over FUSION_CLASSES sum to 1.0."""
        filtered = {em: max(0.0, float(probs.get(em, 0.0))) for em in FUSION_CLASSES}
        total = sum(filtered.values())
        if total > 0:
            return {em: round(val / total, 4) for em, val in filtered.items()}
        return {em: 0.0 for em in FUSION_CLASSES}


multimodal_fusion = MultimodalEmotionFusion()
