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

FERPlus ONNX fallback details:
- Input: Grayscale image, resized to 64x64, float32 NCHW [1,1,64,64]
- Output: 8 class labels: neutral, happy, surprise, sad, angry, disgust, fear, contempt
- Backend: ONNX Runtime (CPU)

Emotion mapping to EduSense 5-class allowed set {"neutral", "happy", "sad", "angry", "fear"}:
  Happiness -> happy | Neutral -> neutral | Sadness -> sad
  Anger -> angry | Fear -> fear
  Contempt, Disgust, Surprise -> "uncertain" (preserved in raw_dominant and raw_emotion_probabilities)

Student attribution contract:
- Each analyze_frame() call MUST receive a single student's camera frame.
- Teacher video frames MUST NOT be passed here.
- Multiple students MUST NOT be mixed in one call.
"""

import os
import math
import time
import logging
import numpy as np
import cv2
from typing import Dict, Any, Optional, Tuple, List

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
EMOTIEFFLIB_NAME_TO_IDX = {v: k for k, v in EMOTIEFFLIB_CLASSES.items()}

# EmotiEffLib label -> EduSense label (None = outside allowed 5-class set)
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

# Calibration optimal temperature learned on held-out validation data
CALIBRATION_TEMPERATURE = 0.9922

# Primary model selection: default to 'ferplus' based on benchmark evidence (83.1% acc vs 58.0% vgaf)
_DEFAULT_BACKEND = os.environ.get("FACIAL_EMOTION_BACKEND", "ferplus").lower()


class FacialEmotionAnalyzer:
    """
    Analyzes facial frames for expression recognition, head pose, and attentiveness.

    Primary backend   : FERPlus ONNX (emotion-ferplus.onnx, 8-class, CPU)
    Fallback backend  : EmotiEffLib (enet_b0_8_best_vgaf / afew, ONNX, CPU)
    """

    def __init__(
        self,
        emotion_model_path: Optional[str] = None,
        confidence_threshold: float = 0.50,
        force_ferplus: Optional[bool] = None,
    ):
        self.confidence_threshold = confidence_threshold
        self.emotion_model_loaded = False
        self.backend = "none"
        self._emotiefflib = None
        self._ferplus_session = None
        self._ferplus_input_name = None

        if emotion_model_path is not None:
            # Caller specified an explicit FERPlus ONNX model path
            self._init_ferplus(emotion_model_path)
        elif force_ferplus is True:
            # Caller explicitly forced FERPlus
            self._init_ferplus()
        elif force_ferplus is False:
            # Caller explicitly forced EmotiEffLib
            self._init_emotiefflib()
        elif _DEFAULT_BACKEND == "ferplus":
            self._init_ferplus()
            if not self.emotion_model_loaded:
                self._init_emotiefflib()
        else:
            self._init_emotiefflib()
            if not self.emotion_model_loaded:
                self._init_ferplus()

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
        Analyze a single video frame for a student.
        Validates input, checks image quality, detects/aligns faces, estimates head pose,
        computes attentiveness, and executes emotion inference.
        """
        start_time = time.perf_counter()

        # 1. Input validation
        if frame is None or not isinstance(frame, np.ndarray) or frame.size == 0:
            return self._build_empty_response(
                valid_input=False,
                prediction_status="invalid_input",
                quality_status="invalid_input",
                distraction_type="invalid_input",
            )

        # Normalize channel formats
        if frame.ndim == 2:
            gray = frame
            frame_bgr = cv2.cvtColor(frame, cv2.COLOR_GRAY2BGR)
        elif frame.ndim == 3 and frame.shape[2] == 4:
            frame_bgr = cv2.cvtColor(frame, cv2.COLOR_BGRA2BGR)
            gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
        elif frame.ndim == 3 and frame.shape[2] == 3:
            frame_bgr = frame
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        else:
            return self._build_empty_response(
                valid_input=False,
                prediction_status="invalid_input",
                quality_status="invalid_input",
                distraction_type="invalid_input",
            )

        height, width = frame_bgr.shape[:2]

        # 2. Image quality checks (lighting & blur)
        mean_brightness = float(np.mean(gray))
        laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var()) if gray.size >= 16 else 0.0

        if mean_brightness < 20.0:
            quality_status = "poor_lighting"
        elif mean_brightness > 245.0:
            quality_status = "overexposed"
        elif laplacian_var < 15.0:
            quality_status = "blurry"
        else:
            quality_status = "good"

        # 3. Face detection
        faces = self.face_cascade.detectMultiScale(
            gray, scaleFactor=1.1, minNeighbors=4, minSize=(30, 30)
        )

        if len(faces) == 0:
            status = "poor_image_quality" if quality_status in ["poor_lighting", "overexposed"] else "no_face"
            return self._build_empty_response(
                valid_input=True,
                prediction_status=status,
                quality_status=quality_status,
                distraction_type="no_face_detected",
            )

        # 4. Multi-face resolution & ambiguity check
        faces_sorted = sorted(faces, key=lambda rect: rect[2] * rect[3], reverse=True)
        primary_face = faces_sorted[0]

        if len(faces_sorted) > 1:
            second_face = faces_sorted[1]
            primary_area = primary_face[2] * primary_face[3]
            second_area = second_face[2] * second_face[3]
            area_ratio = second_area / float(primary_area) if primary_area > 0 else 0.0

            center_x = width / 2.0
            cx0 = primary_face[0] + primary_face[2] / 2.0
            cx1 = second_face[0] + second_face[2] / 2.0

            # If faces are of comparable size and neither is clearly the centered student
            if area_ratio > 0.65 and abs(cx0 - center_x) > (0.25 * width) and abs(cx1 - center_x) > (0.25 * width):
                return {
                    "valid_input": True,
                    "face_detected": True,
                    "attentiveness_score": 0.0,
                    "head_pose": {
                        "pitch": 0.0, "yaw": 0.0, "roll": 0.0,
                        "orientation": "ambiguous_face",
                    },
                    "dominant_emotion": "uncertain",
                    "raw_dominant": None,
                    "emotion_probabilities": {em: 0.0 for em in ALLOWED_EMOTIONS},
                    "raw_emotion_probabilities": {},
                    "emotion_model_loaded": self.emotion_model_loaded,
                    "emotion_backend": self.backend,
                    "is_distracted": False,
                    "distraction_type": "multiple_faces_detected",
                    "confidence": 0.0,
                    "prediction_status": "ambiguous_face",
                    "quality_status": quality_status,
                    "inference_latency_ms": round((time.perf_counter() - start_time) * 1000.0, 2),
                    "face_bbox": None,
                    "crop_dimensions": None,
                }

        x, y, w, h = primary_face
        face_roi_gray = gray[y:y + h, x:x + w]

        # 5. Head pose & attentiveness
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

        # 6. Extract square face crop with 15% margin to include chin/forehead without clipping
        pad = int(max(w, h) * 0.15)
        cx = x + w // 2
        cy = y + h // 2
        half_side = max(w, h) // 2 + pad
        crop_x1 = max(0, cx - half_side)
        crop_y1 = max(0, cy - half_side)
        crop_x2 = min(width, cx + half_side)
        crop_y2 = min(height, cy + half_side)
        face_crop_bgr = frame_bgr[crop_y1:crop_y2, crop_x1:crop_x2]

        # 7. Emotion inference
        (
            dominant_emotion,
            emotion_probabilities,
            confidence,
            raw_dominant,
            raw_probabilities,
            prediction_status,
        ) = self._run_emotion_inference(
            face_crop_bgr,
            attentiveness_score,
            is_distracted,
            pitch,
        )

        # If image quality is poor and confidence is low, reflect quality status
        if quality_status != "good" and confidence < self.confidence_threshold:
            prediction_status = "poor_image_quality"

        latency_ms = round((time.perf_counter() - start_time) * 1000.0, 2)

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
            "raw_dominant": raw_dominant,
            "emotion_probabilities": emotion_probabilities,
            "raw_emotion_probabilities": raw_probabilities,
            "emotion_model_loaded": self.emotion_model_loaded,
            "emotion_backend": self.backend,
            "is_distracted": is_distracted,
            "distraction_type": distraction_type,
            "confidence": confidence,
            "prediction_status": prediction_status,
            "quality_status": quality_status,
            "inference_latency_ms": latency_ms,
            "face_bbox": {"x": int(x), "y": int(y), "w": int(w), "h": int(h)},
            "crop_dimensions": [int(face_crop_bgr.shape[0]), int(face_crop_bgr.shape[1])],
        }

    def predict_emotion_from_face(
        self, face_image: np.ndarray
    ) -> Tuple[str, Dict[str, float], float, str, Dict[str, float], str]:
        """
        Direct inference on an already cropped face image (BGR or Grayscale).
        Returns (dominant_emotion, emotion_probabilities, confidence, raw_dominant, raw_probabilities, prediction_status).
        """
        if face_image is None or face_image.size == 0:
            return self._pose_fallback(0.0, False, 0.0)

        if face_image.ndim == 2:
            face_bgr = cv2.cvtColor(face_image, cv2.COLOR_GRAY2BGR)
        elif face_image.ndim == 3 and face_image.shape[2] == 4:
            face_bgr = cv2.cvtColor(face_image, cv2.COLOR_BGRA2BGR)
        else:
            face_bgr = face_image

        return self._run_emotion_inference(face_bgr, 1.0, False, 0.0)

    # ---------------------------------------------------------------------- #
    # Inference dispatch & model execution                                   #
    # ---------------------------------------------------------------------- #

    def _run_emotion_inference(
        self,
        face_crop_bgr: np.ndarray,
        attentiveness_score: float,
        is_distracted: bool,
        pitch: float,
    ) -> Tuple[str, Dict[str, float], float, str, Dict[str, float], str]:
        if not self.emotion_model_loaded:
            return self._pose_fallback(attentiveness_score, is_distracted, pitch)
        try:
            if self.backend == "emotiefflib":
                return self._infer_emotiefflib(face_crop_bgr)
            else:
                return self._infer_ferplus(face_crop_bgr)
        except Exception as exc:
            logger.error("Emotion inference error (%s): %s", self.backend, exc)
            return self._pose_fallback(attentiveness_score, is_distracted, pitch)

    def _infer_emotiefflib(
        self, face_bgr: np.ndarray, x: int = 0, y: int = 0, w: int = 0, h: int = 0
    ) -> Tuple[str, Dict[str, float], float, str, Dict[str, float], str]:
        """
        EmotiEffLib ONNX inference.
        Contract: RGB image -> internal resize to 224x224 & ImageNet normalization -> NCHW float32.
        Scores: 8-class softmax probabilities.
        """
        if face_bgr is None or face_bgr.size == 0:
            raise ValueError("Empty face crop passed to EmotiEffLib")

        face_rgb = cv2.cvtColor(face_bgr, cv2.COLOR_BGR2RGB)

        emotion_labels, scores = self._emotiefflib.predict_emotions(
            face_rgb, logits=False
        )

        probs_array = scores[0]

        # Full 8-class probability map
        raw_probs = {
            EMOTIEFFLIB_CLASSES[i]: round(float(probs_array[i]), 4)
            for i in range(len(probs_array))
        }

        top_idx = int(np.argmax(probs_array))
        top_prob = float(probs_array[top_idx])
        raw_dominant = EMOTIEFFLIB_CLASSES[top_idx]

        # 5-class EduSense probability map (only classes in allowed set)
        emotion_probabilities: Dict[str, float] = {}
        for emotiefflib_name, edusense_name in EMOTIEFFLIB_TO_EDUSENSE.items():
            if edusense_name is not None:
                idx = EMOTIEFFLIB_NAME_TO_IDX[emotiefflib_name]
                emotion_probabilities[edusense_name] = round(float(probs_array[idx]), 4)

        edusense_mapped = EMOTIEFFLIB_TO_EDUSENSE.get(raw_dominant)
        confidence = round(top_prob, 3)

        if top_prob < self.confidence_threshold:
            dominant_emotion = "uncertain"
            prediction_status = "low_confidence"
        elif edusense_mapped is not None:
            dominant_emotion = edusense_mapped
            prediction_status = "valid_prediction"
        else:
            # Class outside EduSense 5-class allowed set (Contempt, Disgust, Surprise)
            # NEVER assign to Neutral! Remains 'uncertain' in dominant_emotion, with raw_dominant preserved.
            dominant_emotion = "uncertain"
            prediction_status = "valid_prediction"

        return (
            dominant_emotion,
            emotion_probabilities,
            confidence,
            raw_dominant,
            raw_probs,
            prediction_status,
        )

    def _infer_ferplus(
        self, face_bgr: np.ndarray, x: int = 0, y: int = 0, w: int = 0, h: int = 0
    ) -> Tuple[str, Dict[str, float], float, str, Dict[str, float], str]:
        """
        FERPlus ONNX inference.
        Contract: grayscale 64x64 float32 NCHW [1,1,64,64].
        Scores: 8-class softmax probabilities.
        """
        if face_bgr is None or face_bgr.size == 0:
            raise ValueError("Empty face crop passed to FERPlus")

        if face_bgr.ndim == 3:
            face_gray = cv2.cvtColor(face_bgr, cv2.COLOR_BGR2GRAY)
        else:
            face_gray = face_bgr

        resized = cv2.resize(face_gray, (64, 64), interpolation=cv2.INTER_AREA)
        input_tensor = resized.astype(np.float32).reshape(1, 1, 64, 64)

        raw_outputs = self._ferplus_session.run(
            None, {self._ferplus_input_name: input_tensor}
        )
        logits = raw_outputs[0][0]
        # Calibrated softmax using optimal temperature learned on validation split
        scaled_logits = logits / CALIBRATION_TEMPERATURE
        exp_logits = np.exp(scaled_logits - np.max(scaled_logits))
        probs = exp_logits / np.sum(exp_logits)

        raw_probs = {
            em: round(float(p), 4)
            for em, p in zip(FERPLUS_CLASSES, probs)
        }
        top_idx = int(np.argmax(probs))
        raw_dominant = FERPLUS_CLASSES[top_idx]
        top_prob = float(probs[top_idx])
        confidence = round(top_prob, 3)

        # 5-class EduSense probabilities
        emotion_probabilities = {
            "neutral": round(float(raw_probs.get("neutral", 0.0)), 4),
            "happy": round(float(raw_probs.get("happy", 0.0)), 4),
            "sad": round(float(raw_probs.get("sad", 0.0)), 4),
            "angry": round(float(raw_probs.get("angry", 0.0)), 4),
            "fear": round(float(raw_probs.get("fear", 0.0)), 4),
        }

        if top_prob < self.confidence_threshold:
            dominant_emotion = "uncertain"
            prediction_status = "low_confidence"
        elif raw_dominant in ALLOWED_EMOTIONS:
            dominant_emotion = raw_dominant
            prediction_status = "valid_prediction"
        else:
            # Outside allowed set (surprise, disgust, contempt)
            dominant_emotion = "uncertain"
            prediction_status = "valid_prediction"

        return (
            dominant_emotion,
            emotion_probabilities,
            confidence,
            raw_dominant,
            raw_probs,
            prediction_status,
        )

    def _pose_fallback(
        self, attentiveness_score: float, is_distracted: bool, pitch: float
    ) -> Tuple[str, Dict[str, float], float, str, Dict[str, float], str]:
        """Fallback when no model is available or model fails. NEVER fabricates neutral."""
        dominant_emotion = "uncertain"
        emotion_probabilities = {
            "neutral": 0.0, "happy": 0.0, "sad": 0.0, "angry": 0.0, "fear": 0.0
        }
        raw_probabilities = {}
        return (
            dominant_emotion,
            emotion_probabilities,
            0.0,
            "unknown",
            raw_probabilities,
            "model_error",
        )

    def _build_empty_response(
        self,
        valid_input: bool,
        prediction_status: str,
        quality_status: str,
        distraction_type: str,
    ) -> Dict[str, Any]:
        """Generates structured empty response when input is invalid or face is absent."""
        return {
            "valid_input": valid_input,
            "face_detected": False,
            "attentiveness_score": 0.0,
            "head_pose": {
                "pitch": 0.0, "yaw": 0.0, "roll": 0.0,
                "orientation": "no_face",
            },
            "dominant_emotion": "unknown" if prediction_status == "no_face" else "uncertain",
            "raw_dominant": None,
            "emotion_probabilities": {em: 0.0 for em in ALLOWED_EMOTIONS},
            "raw_emotion_probabilities": {},
            "emotion_model_loaded": self.emotion_model_loaded,
            "emotion_backend": self.backend,
            "is_distracted": True,
            "distraction_type": distraction_type,
            "confidence": 0.0,
            "prediction_status": prediction_status,
            "quality_status": quality_status,
            "inference_latency_ms": 0.0,
            "face_bbox": None,
            "crop_dimensions": None,
        }

    # ---------------------------------------------------------------------- #
    # Head pose & attentiveness                                              #
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
