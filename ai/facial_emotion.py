"""
Facial Emotion, Head-Pose, and Attentiveness Analysis Service for EduSense AI.

Primary backend: EmotiEffLib (enet_b0_8_best_vgaf, ONNX).
Fallback backend: FERPlus ONNX (emotion-ferplus.onnx).

EmotiEffLib model details:
- Input: RGB image, resized to 224x224, float32 NCHW [1,3,224,224]
- Normalization: ImageNet mean=[0.485,0.456,0.406], std=[0.229,0.224,0.225]
- Output: 8 class labels: Anger, Contempt, Disgust, Fear, Happiness,
          Neutral, Sadness, Surprise
- Backend: ONNX Runtime (CPU), no PyTorch required

Emotion mapping to EduSense allowed set {"neutral", "happy", "sad", "angry", "fear"}:
  Happiness -> happy | Neutral -> neutral | Sadness -> sad
  Anger -> angry | Fear -> fear
  Contempt, Disgust, Surprise -> "uncertain" (outside allowed set)

Fallback FERPlus ONNX is activated when:
  - FACIAL_EMOTION_BACKEND=ferplus env var is set, OR
  - EmotiEffLib fails to load/run, OR
  - emotion_model_path is passed explicitly (legacy/test mode)
"""

import os
import math
import logging
import numpy as np
import cv2
from typing import Dict, Any, Optional, Tuple

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# EmotiEffLib (enet_b0_8_best_vgaf) class definitions
# ---------------------------------------------------------------------------
EMOTIEFFLIB_MODEL_NAME = "enet_b0_8_best_vgaf"

EMOTIEFFLIB_CLASSES = {
    0: "Anger",
    1: "Contempt",
    2: "Disgust",
    3: "Fear",
    4: "Happiness",
    5: "Neutral",
    6: "Sadness",
    7: "Surprise",
}

# EmotiEffLib label -> EduSense label (None = outside allowed set)
EMOTIEFFLIB_TO_EDUSENSE = {
    "Happiness": "happy",
    "Neutral":   "neutral",
    "Sadness":   "sad",
    "Anger":     "angry",
    "Fear":      "fear",
    "Contempt":  None,
    "Disgust":   None,
    "Surprise":  None,
}

# ---------------------------------------------------------------------------
# FERPlus ONNX fallback class definitions
# ---------------------------------------------------------------------------
FERPLUS_CLASSES = [
    "neutral",
    "happy",
    "surprise",
    "sad",
    "angry",
    "disgust",
    "fear",
    "contempt",
]

ALLOWED_EMOTIONS = {"neutral", "happy", "sad", "angry", "fear"}

# Backend env var: set FACIAL_EMOTION_BACKEND=ferplus to force FERPlus
_FORCE_FERPLUS = (
    os.environ.get("FACIAL_EMOTION_BACKEND", "emotiefflib").lower() == "ferplus"
)


class FacialEmotionAnalyzer:
    """
    Analyzes facial frames for expression recognition, head pose, and attentiveness.

    Primary backend  : EmotiEffLib (enet_b0_8_best_vgaf, ONNX, CPU)
    Fallback backend : FERPlus ONNX (emotion-ferplus.onnx)

    Student attribution contract:
    - Each analyze_frame() call must receive a single-student frame.
    - Teacher frames must NOT be passed here.
    - Multiple students must NOT be mixed in one call.
    """

    def __init__(
        self,
        emotion_model_path: Optional[str] = None,
        confidence_threshold: float = 0.30,
        force_ferplus: bool = False,
    ):
        self.confidence_threshold = confidence_threshold
        self.emotion_model_loaded = False
        self.backend = "none"
        self._emotiefflib = None
        self._ferplus_session = None
        self._ferplus_input_name = None

        use_ferplus = _FORCE_FERPLUS or force_ferplus or (emotion_model_path is not None)

        if not use_ferplus:
            self._init_emotiefflib()

        # Fall through to FERPlus if EmotiEffLib did not load
        if not self.emotion_model_loaded:
            self._init_ferplus(emotion_model_path)

        self.face_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )
        self.eye_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_eye.xml"
        )

        self.model_points = np.array([
            (0.0,    0.0,    0.0),
            (0.0,  -330.0, -65.0),
            (-225.0, 170.0, -135.0),
            (225.0,  170.0, -135.0),
            (-150.0, -150.0, -125.0),
            (150.0,  -150.0, -125.0),
        ], dtype=np.float64)

    # ---------------------------------------------------------------------- #
    # Backend initialisation                                                  #
    # ---------------------------------------------------------------------- #

    def _init_emotiefflib(self) -> None:
        try:
            from emotiefflib.facial_analysis import EmotiEffLibRecognizer
            self._emotiefflib = EmotiEffLibRecognizer(
                engine="onnx",
                model_name=EMOTIEFFLIB_MODEL_NAME,
            )
            self.emotion_model_loaded = True
            self.backend = "emotiefflib"
            logger.info(
                "EmotiEffLib model '%s' (ONNX) loaded successfully.",
                EMOTIEFFLIB_MODEL_NAME,
            )
        except Exception as exc:
            logger.warning(
                "EmotiEffLib failed to load (%s). Falling back to FERPlus.", exc
            )
            self._emotiefflib = None

    def _init_ferplus(self, explicit_path: Optional[str] = None) -> None:
        onnx_path = explicit_path
        if onnx_path is None:
            default = os.path.join(
                os.path.dirname(__file__), "models", "emotion-ferplus.onnx"
            )
            if os.path.exists(default):
                onnx_path = default

        if onnx_path and os.path.exists(onnx_path):
            try:
                import onnxruntime as ort
                opts = ort.SessionOptions()
                opts.log_severity_level = 3
                self._ferplus_session = ort.InferenceSession(onnx_path, opts)
                self._ferplus_input_name = self._ferplus_session.get_inputs()[0].name
                self.emotion_model_loaded = True
                self.backend = "ferplus"
                logger.info("FERPlus ONNX fallback loaded from %s", onnx_path)
            except Exception as exc:
                logger.error(
                    "Failed to load FERPlus ONNX from %s: %s", onnx_path, exc
                )
        else:
            logger.warning(
                "No FERPlus model found at '%s'. Emotion inference disabled.",
                onnx_path,
            )

    # ---------------------------------------------------------------------- #
    # Public API                                                              #
    # ---------------------------------------------------------------------- #

    def analyze_frame(self, frame: np.ndarray) -> Dict[str, Any]:
        """
        Analyze a single BGR video frame.
        Returns dict with face detection, expression recognition, head pose,
        attentiveness score, and distraction metadata.
        """
        if frame is None or not isinstance(frame, np.ndarray) or frame.size == 0:
            return {
                "valid_input": False,
                "face_detected": False,
                "attentiveness_score": 0.0,
                "head_pose": {
                    "pitch": 0.0, "yaw": 0.0, "roll": 0.0,
                    "orientation": "no_face",
                },
                "dominant_emotion": "unknown",
                "emotion_probabilities": {},
                "emotion_model_loaded": self.emotion_model_loaded,
                "emotion_backend": self.backend,
                "is_distracted": True,
                "distraction_type": "invalid_input",
                "confidence": 0.0,
            }

        height, width = frame.shape[:2]
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        faces = self.face_cascade.detectMultiScale(
            gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60)
        )

        if len(faces) == 0:
            return {
                "valid_input": True,
                "face_detected": False,
                "attentiveness_score": 0.0,
                "head_pose": {
                    "pitch": 0.0, "yaw": 0.0, "roll": 0.0,
                    "orientation": "no_face",
                },
                "dominant_emotion": "unknown",
                "emotion_probabilities": {},
                "emotion_model_loaded": self.emotion_model_loaded,
                "emotion_backend": self.backend,
                "is_distracted": True,
                "distraction_type": "no_face_detected",
                "confidence": 0.9,
            }

        x, y, w, h = max(faces, key=lambda rect: rect[2] * rect[3])
        face_roi_gray = gray[y:y + h, x:x + w]

        pitch, yaw, roll, orientation = self._estimate_head_pose(
            x, y, w, h, width, height, face_roi_gray
        )
        attentiveness_score = self._calculate_attentiveness(pitch, yaw, roll)

        is_distracted = attentiveness_score < 0.50
        distraction_type = None
        if is_distracted:
            if abs(yaw) > 30:
                distraction_type = "looking_away"
            elif pitch < -20:
                distraction_type = "looking_down"
            elif pitch > 25:
                distraction_type = "looking_up"
            else:
                distraction_type = "inattentive"

        dominant_emotion, emotion_probabilities, confidence, raw_dominant = (
            self._run_emotion_inference(
                frame, x, y, w, h, attentiveness_score, is_distracted, pitch
            )
        )

        return {
            "valid_input": True,
            "face_detected": True,
            "attentiveness_score": round(float(attentiveness_score), 3),
            "head_pose": {
                "pitch": round(float(pitch), 2),
                "yaw": round(float(yaw), 2),
                "roll": round(float(roll), 2),
                "orientation": orientation,
            },
            "dominant_emotion": dominant_emotion,
            "emotion_probabilities": emotion_probabilities,
            "emotion_model_loaded": self.emotion_model_loaded,
            "emotion_backend": self.backend,
            "is_distracted": is_distracted,
            "distraction_type": distraction_type,
            "confidence": confidence,
            "face_bbox": {"x": int(x), "y": int(y), "w": int(w), "h": int(h)},
            "crop_dimensions": [int(h), int(w)],
            "raw_dominant": raw_dominant,
        }

    # ---------------------------------------------------------------------- #
    # Inference dispatch                                                      #
    # ---------------------------------------------------------------------- #

    def _run_emotion_inference(
        self,
        frame: np.ndarray,
        x: int, y: int, w: int, h: int,
        attentiveness_score: float,
        is_distracted: bool,
        pitch: float,
    ) -> Tuple[str, Dict[str, float], float, str]:
        if not self.emotion_model_loaded:
            return self._pose_fallback(attentiveness_score, is_distracted, pitch)
        try:
            if self.backend == "emotiefflib":
                return self._infer_emotiefflib(frame, x, y, w, h)
            else:
                return self._infer_ferplus(frame, x, y, w, h)
        except Exception as exc:
            logger.error("Emotion inference error (%s): %s", self.backend, exc)
            return self._pose_fallback(attentiveness_score, is_distracted, pitch)

    def _infer_emotiefflib(
        self, frame: np.ndarray, x: int, y: int, w: int, h: int
    ) -> Tuple[str, Dict[str, float], float, str]:
        """
        EmotiEffLib ONNX inference.
        Preprocessing (per EmotiEffLib source):
          - BGR crop -> RGB
          - resize to 224x224
          - normalize: (pixel/255 - mean[i]) / std[i]  (ImageNet)
          - NCHW float32
        EmotiEffLib handles all preprocessing internally via _preprocess().
        We pass the RGB crop as-is.
        """
        face_bgr = frame[y:y + h, x:x + w]
        if face_bgr.size == 0:
            raise ValueError("Empty face crop")
        face_rgb = cv2.cvtColor(face_bgr, cv2.COLOR_BGR2RGB)

        # predict_emotions returns (List[str], np.ndarray)
        # logits=False -> softmax probabilities
        emotion_labels, scores = self._emotiefflib.predict_emotions(
            face_rgb, logits=False
        )

        # scores shape: (1, 8) for a single image
        probs_array = scores[0]

        # Full 8-class probability map
        all_probs = {
            EMOTIEFFLIB_CLASSES[i]: float(probs_array[i])
            for i in range(len(probs_array))
        }

        emotiefflib_label = emotion_labels[0]
        raw_dominant = emotiefflib_label
        edusense_label = EMOTIEFFLIB_TO_EDUSENSE.get(emotiefflib_label)

        top_idx = int(np.argmax(probs_array))
        top_prob = float(probs_array[top_idx])

        # Build 5-class EduSense probability map (sum probabilities per mapping)
        emotion_probabilities: Dict[str, float] = {}
        for emotiefflib_name, edusense_name in EMOTIEFFLIB_TO_EDUSENSE.items():
            if edusense_name is not None:
                emotion_probabilities[edusense_name] = round(
                    emotion_probabilities.get(edusense_name, 0.0)
                    + all_probs.get(emotiefflib_name, 0.0),
                    4,
                )

        # Determine dominant EduSense emotion
        if edusense_label is not None and top_prob >= self.confidence_threshold:
            dominant_emotion = edusense_label
            confidence = round(top_prob, 3)
        elif edusense_label is None:
            # Primary class is outside EduSense set; pick best EduSense class
            best_name = max(emotion_probabilities, key=emotion_probabilities.get)
            best_prob = emotion_probabilities[best_name]
            if best_prob >= self.confidence_threshold:
                dominant_emotion = best_name
                confidence = round(best_prob, 3)
            else:
                dominant_emotion = "uncertain"
                confidence = round(top_prob, 3)
        else:
            dominant_emotion = "uncertain"
            confidence = round(top_prob, 3)

        return dominant_emotion, emotion_probabilities, confidence, raw_dominant

    def _infer_ferplus(
        self, frame: np.ndarray, x: int, y: int, w: int, h: int
    ) -> Tuple[str, Dict[str, float], float, str]:
        """
        FERPlus ONNX inference.
        Preprocessing: grayscale 64x64 float32 NCHW [1,1,64,64].
        """
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        face_roi_gray = gray[y:y + h, x:x + w]
        if face_roi_gray.size == 0:
            raise ValueError("Empty grayscale face crop")

        resized = cv2.resize(face_roi_gray, (64, 64), interpolation=cv2.INTER_AREA)
        input_tensor = resized.astype(np.float32).reshape(1, 1, 64, 64)

        raw_outputs = self._ferplus_session.run(
            None, {self._ferplus_input_name: input_tensor}
        )
        logits = raw_outputs[0][0]
        exp_logits = np.exp(logits - np.max(logits))
        probs = exp_logits / np.sum(exp_logits)

        all_probs = {
            em: round(float(p), 4)
            for em, p in zip(FERPLUS_CLASSES, probs)
        }
        top_idx = int(np.argmax(probs))
        raw_dominant = FERPLUS_CLASSES[top_idx]
        confidence = round(float(probs[top_idx]), 3)

        emotion_probabilities = {em: all_probs.get(em, 0.0) for em in ALLOWED_EMOTIONS}

        if raw_dominant in ALLOWED_EMOTIONS and confidence >= self.confidence_threshold:
            dominant_emotion = raw_dominant
        else:
            dominant_emotion = "uncertain"

        return dominant_emotion, emotion_probabilities, confidence, raw_dominant

    def _pose_fallback(
        self, attentiveness_score: float, is_distracted: bool, pitch: float
    ) -> Tuple[str, Dict[str, float], float, str]:
        """Minimal fallback when no model is available. Does not fabricate labels."""
        dominant_emotion = "neutral"
        emotion_probabilities = {
            "neutral": 1.0, "happy": 0.0, "sad": 0.0, "angry": 0.0, "fear": 0.0
        }
        return dominant_emotion, emotion_probabilities, 0.0, dominant_emotion

    # ---------------------------------------------------------------------- #
    # Head pose & attentiveness (unchanged from original)                     #
    # ---------------------------------------------------------------------- #

    def _estimate_head_pose(
        self,
        x: int, y: int, w: int, h: int,
        img_w: int, img_h: int,
        face_roi_gray: np.ndarray,
    ) -> Tuple[float, float, float, str]:
        face_cx = x + w / 2.0
        face_cy = y + h / 2.0
        center_x = img_w / 2.0
        center_y = img_h / 2.0

        yaw = ((face_cx - center_x) / (img_w / 2.0)) * 45.0
        pitch = -((face_cy - center_y) / (img_h / 2.0)) * 30.0

        eyes = self.eye_cascade.detectMultiScale(
            face_roi_gray, scaleFactor=1.1, minNeighbors=3
        )
        roll = 0.0
        if len(eyes) >= 2:
            sorted_eyes = sorted(eyes, key=lambda e: e[0])
            ex1, ey1, ew1, eh1 = sorted_eyes[0]
            ex2, ey2, ew2, eh2 = sorted_eyes[1]
            dx = (ex2 + ew2 / 2) - (ex1 + ew1 / 2)
            dy = (ey2 + eh2 / 2) - (ey1 + eh1 / 2)
            if dx != 0:
                roll = math.degrees(math.atan2(dy, dx))

        if abs(yaw) <= 15 and abs(pitch) <= 15:
            orientation = "frontal"
        elif yaw < -15:
            orientation = "turned_left"
        elif yaw > 15:
            orientation = "turned_right"
        elif pitch < -15:
            orientation = "looking_down"
        else:
            orientation = "looking_up"

        return pitch, yaw, roll, orientation

    def _calculate_attentiveness(
        self, pitch: float, yaw: float, roll: float
    ) -> float:
        total_deviation = math.sqrt(pitch ** 2 + yaw ** 2 + (roll * 0.5) ** 2)
        max_acceptable_deg = 45.0
        score = max(0.0, 1.0 - (total_deviation / max_acceptable_deg))
        return min(1.0, score)
