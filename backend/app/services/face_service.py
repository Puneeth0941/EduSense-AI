import io
import base64
import logging
import numpy as np
import cv2
from PIL import Image
from typing import List, Dict, Any, Tuple, Optional
import insightface
from insightface.app import FaceAnalysis

from app.core.config import settings

logger = logging.getLogger(__name__)


def sanitize_native_types(obj: Any) -> Any:
    """
    Recursively converts NumPy scalars and arrays to native Python types (int, float, bool, list, dict)
    to prevent Pydantic serialization errors.
    """
    if obj is None:
        return None
    if isinstance(obj, (np.bool_, bool)):
        return bool(obj)
    if isinstance(obj, (np.integer, int)):
        return int(obj)
    if isinstance(obj, (np.floating, float)):
        return float(obj)
    if isinstance(obj, np.ndarray):
        return [sanitize_native_types(x) for x in obj.tolist()]
    if isinstance(obj, dict):
        return {str(k): sanitize_native_types(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [sanitize_native_types(x) for x in obj]
    return obj


class FaceService:
    _instance: Optional["FaceService"] = None

    def __init__(self):
        logger.info(f"Initializing FaceService singleton with model pack '{settings.FACE_MODEL_PACK}'...")
        try:
            # Initialize InsightFace with SCRFD face detector and ArcFace MobileFaceNet recognition model
            self.app = FaceAnalysis(
                name=settings.FACE_MODEL_PACK,
                allowed_modules=['detection', 'recognition'],
                providers=['CPUExecutionProvider']
            )
            # det_size=(640, 640) for fast robust detection
            self.app.prepare(ctx_id=0, det_size=(640, 640))
            logger.info("FaceService InsightFace models (SCRFD + ArcFace) initialized successfully.")
        except Exception as e:
            logger.error(f"Failed to initialize InsightFace models: {e}")
            raise RuntimeError(f"Face AI Service initialization failure: {e}")

    @classmethod
    def get_instance(cls) -> "FaceService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def decode_base64_image(self, base64_str: str) -> np.ndarray:
        """
        Decodes base64 string (with or without data URI header) into an OpenCV BGR uint8 image matrix.
        """
        if ',' in base64_str:
            base64_str = base64_str.split(',', 1)[1]
        
        try:
            img_bytes = base64.b64decode(base64_str)
            pil_img = Image.open(io.BytesIO(img_bytes)).convert('RGB')
            # Convert RGB (PIL) to BGR (OpenCV)
            bgr_img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
            return bgr_img
        except Exception as e:
            logger.error(f"Error decoding base64 image: {e}")
            raise ValueError("Invalid image encoding")

    def detect_faces(self, image: np.ndarray) -> List[Any]:
        """
        Detects faces in BGR image using SCRFD detector via InsightFace.
        """
        return self.app.get(image)

    def calculate_blur(self, face_crop: np.ndarray) -> float:
        """
        Calculates Laplacian variance as a blur metric.
        Higher values mean sharper images. Lower values indicate blurriness.
        """
        if face_crop.size == 0:
            return 0.0
        gray = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
        return float(cv2.Laplacian(gray, cv2.CV_64F).var())

    def check_face_quality(
        self, image: np.ndarray, face: Any
    ) -> Tuple[bool, str, Dict[str, Any]]:
        """
        Performs quality checks on a detected single face:
        - Face bounding box dimensions >= MIN_FACE_SIZE
        - Blur check via Laplacian variance >= BLUR_THRESHOLD
        - Exposure/Lighting check
        - Spatial positioning & feedback
        """
        h, w, _ = image.shape
        bbox = face.bbox.astype(int)  # [x1, y1, x2, y2]
        x1, y1, x2, y2 = [int(v) for v in bbox]
        
        face_w = int(x2 - x1)
        face_h = int(y2 - y1)

        # Check face size
        if face_w < settings.FACE_MIN_SIZE or face_h < settings.FACE_MIN_SIZE:
            return False, "Face too small. Move closer to the camera.", {
                "face_width": int(face_w),
                "face_height": int(face_h),
            }

        # Crop face for blur and brightness check
        pad_x = int(face_w * 0.1)
        pad_y = int(face_h * 0.1)
        crop_x1 = max(0, x1 - pad_x)
        crop_y1 = max(0, y1 - pad_y)
        crop_x2 = min(w, x2 + pad_x)
        crop_y2 = min(h, y2 + pad_y)
        face_crop = image[crop_y1:crop_y2, crop_x1:crop_x2]

        # Blur check
        blur_score = float(self.calculate_blur(face_crop))
        if blur_score < settings.FACE_BLUR_THRESHOLD:
            return False, "Image too blurry. Hold steady.", {
                "blur_score": float(round(blur_score, 2)),
            }

        # Lighting check
        gray_crop = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
        avg_brightness = float(np.mean(gray_crop))
        if avg_brightness < 40:
            return False, "Too dark. Please increase light.", {
                "brightness": float(round(avg_brightness, 2))
            }
        if avg_brightness > 235:
            return False, "Too bright/glared. Adjust light.", {
                "brightness": float(round(avg_brightness, 2))
            }

        # Positioning feedback (relative to center)
        face_center_x = float(x1 + x2) / 2.0
        face_center_y = float(y1 + y2) / 2.0
        img_center_x = float(w) / 2.0
        img_center_y = float(h) / 2.0

        offset_x = float((face_center_x - img_center_x) / w)
        offset_y = float((face_center_y - img_center_y) / h)

        feedback = "Good quality — capture"
        if offset_x < -0.18:
            feedback = "Move slightly right"
        elif offset_x > 0.18:
            feedback = "Move slightly left"
        elif offset_y < -0.18:
            feedback = "Move slightly down"
        elif offset_y > 0.18:
            feedback = "Move slightly up"

        quality_details = {
            "face_width": int(face_w),
            "face_height": int(face_h),
            "blur_score": float(round(blur_score, 2)),
            "brightness": float(round(avg_brightness, 2)),
        }

        return True, feedback, sanitize_native_types(quality_details)

    def generate_embedding(self, face: Any) -> List[float]:
        """
        Extracts 512-dim ArcFace embedding from detected face and returns normalized float list.
        """
        raw_embedding = face.embedding
        if raw_embedding is None:
            raise ValueError("Could not compute ArcFace embedding for face frame")
        
        # L2 Normalization
        norm = float(np.linalg.norm(raw_embedding))
        if norm > 0:
            normalized_vec = raw_embedding / norm
        else:
            normalized_vec = raw_embedding
            
        return [float(x) for x in normalized_vec]

    def process_frame(
        self, base64_image: str
    ) -> Dict[str, Any]:
        """
        Main pipeline function for processing a single enrollment frame:
        1. Decode base64 image
        2. Detect faces using SCRFD
        3. Validate single face constraint (0 -> REJECT, >1 -> REJECT)
        4. Perform quality checks (size, blur, lighting)
        5. Generate normalized ArcFace 512-dim embedding
        """
        image = self.decode_base64_image(base64_image)
        faces = self.detect_faces(image)
        num_faces = int(len(faces))

        if num_faces == 0:
            return sanitize_native_types({
                "passed": False,
                "num_faces": 0,
                "message": "Position your face inside the frame",
                "embedding": None,
                "quality_details": None,
            })

        if num_faces > 1:
            return sanitize_native_types({
                "passed": False,
                "num_faces": num_faces,
                "message": "Only one face should be visible during enrollment",
                "embedding": None,
                "quality_details": None,
            })

        target_face = faces[0]
        passed_quality, message, details = self.check_face_quality(image, target_face)

        if not passed_quality:
            return sanitize_native_types({
                "passed": False,
                "num_faces": 1,
                "message": message,
                "embedding": None,
                "quality_details": details,
            })

        embedding = self.generate_embedding(target_face)

        return sanitize_native_types({
            "passed": True,
            "num_faces": 1,
            "message": message,
            "embedding": embedding,
            "quality_details": details,
        })

    def verify_consistency(self, embeddings: List[List[float]]) -> Tuple[bool, float]:
        """
        Calculates pairwise cosine similarity across all sample embeddings.
        Returns True if average similarity >= FACE_CONSISTENCY_THRESHOLD.
        """
        if len(embeddings) < 2:
            return True, 1.0

        matrix = np.array(embeddings, dtype=np.float32)
        # Calculate pairwise cosine similarity matrix
        sim_matrix = np.dot(matrix, matrix.T)

        n = len(embeddings)
        similarities = []
        for i in range(n):
            for j in range(i + 1, n):
                similarities.append(float(sim_matrix[i, j]))

        avg_similarity = float(np.mean(similarities))
        passed = bool(avg_similarity >= settings.FACE_CONSISTENCY_THRESHOLD)
        return passed, float(round(avg_similarity, 4))

    def compute_mean_embedding(self, embeddings: List[List[float]]) -> List[float]:
        """
        Computes mean normalized embedding vector across sample vectors.
        """
        matrix = np.array(embeddings, dtype=np.float32)
        mean_vec = np.mean(matrix, axis=0)
        norm = float(np.linalg.norm(mean_vec))
        if norm > 0:
            mean_vec = mean_vec / norm
        return [float(x) for x in mean_vec]

    def compare_embeddings(
        self, embedding1: List[float], embedding2: List[float]
    ) -> Tuple[float, bool]:
        """
        Compares two normalized 512-dim ArcFace embeddings using Cosine Similarity.
        Returns (similarity_score, is_match).
        """
        vec1 = np.array(embedding1, dtype=np.float32)
        vec2 = np.array(embedding2, dtype=np.float32)
        
        sim = float(np.dot(vec1, vec2))
        is_match = bool(sim >= settings.FACE_RECOGNITION_SIMILARITY_THRESHOLD)
        return float(round(sim, 4)), is_match

    def verify_face_against_enrolled(
        self, base64_image: str, enrolled_data: Dict[str, Any], student_identity: str = "current_student"
    ) -> Dict[str, Any]:
        """
        Performs new-face verification against stored student face profile:
        1. Decode base64 image.
        2. Detect faces using SCRFD. Require exactly 1 face.
        3. Perform face quality checks (size, blur, lighting, exposure).
        4. Generate new ArcFace 512-dim embedding.
        5. Compare against stored mean embedding and sample embeddings using cosine similarity.
        6. Determine match using configured threshold (FACE_RECOGNITION_SIMILARITY_THRESHOLD).
        7. Return sanitized response with verified flag, identity, and similarity score.
        """
        image = self.decode_base64_image(base64_image)
        faces = self.detect_faces(image)
        num_faces = int(len(faces))

        if num_faces == 0:
            return sanitize_native_types({
                "verified": False,
                "identity": None,
                "similarity": 0.0,
                "message": "No face detected in camera frame. Position your face in view.",
                "quality_details": None,
            })

        if num_faces > 1:
            return sanitize_native_types({
                "verified": False,
                "identity": None,
                "similarity": 0.0,
                "message": "Multiple faces detected. Verification requires exactly one face.",
                "quality_details": None,
            })

        target_face = faces[0]
        passed_quality, message, details = self.check_face_quality(image, target_face)

        if not passed_quality:
            return sanitize_native_types({
                "verified": False,
                "identity": None,
                "similarity": 0.0,
                "message": f"Quality check failed: {message}",
                "quality_details": details,
            })

        # Generate new ArcFace 512D embedding for the fresh image
        new_embedding = self.generate_embedding(target_face)
        new_vec = np.array(new_embedding, dtype=np.float32)

        # Extract stored embeddings
        mean_emb = enrolled_data.get("mean_embedding")
        sample_embs = enrolled_data.get("sample_embeddings", [])

        similarities = []

        if mean_emb:
            sim_mean = float(np.dot(new_vec, np.array(mean_emb, dtype=np.float32)))
            similarities.append(sim_mean)

        if sample_embs:
            for s_emb in sample_embs:
                sim_s = float(np.dot(new_vec, np.array(s_emb, dtype=np.float32)))
                similarities.append(sim_s)

        if not similarities:
            return sanitize_native_types({
                "verified": False,
                "identity": None,
                "similarity": 0.0,
                "message": "Enrolled face data is missing valid embedding vectors.",
                "quality_details": details,
            })

        # Highest cosine similarity score achieved across mean vector and stored sample vectors
        max_similarity = float(max(similarities))
        similarity_score = float(round(max_similarity, 4))
        threshold = settings.FACE_RECOGNITION_SIMILARITY_THRESHOLD

        is_match = bool(similarity_score >= threshold)

        if is_match:
            return sanitize_native_types({
                "verified": True,
                "identity": student_identity,
                "similarity": similarity_score,
                "message": "Face verified successfully",
                "quality_details": details,
            })
        else:
            return sanitize_native_types({
                "verified": False,
                "identity": None,
                "similarity": similarity_score,
                "message": "Face does not match the enrolled profile",
                "quality_details": details,
            })

    def process_attendance_frame(
        self, base64_image: str, enrolled_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Processes a sampled camera frame for classroom attendance verification:
        1. Decode base64 frame.
        2. Detect faces. Require exactly 1 face.
           - 0 faces -> FACE_NOT_DETECTED
           - 2+ faces -> MULTIPLE_FACES_DETECTED
        3. Quality check (size, blur, exposure) -> LOW_QUALITY if fails.
        4. Generate new ArcFace 512D embedding.
        5. Compare against enrolled embeddings using cosine similarity threshold.
           - Below threshold -> FACE_MISMATCH
           - Above threshold -> MATCH_SUCCESS
        """
        try:
            image = self.decode_base64_image(base64_image)
            h, w, _ = image.shape
        except Exception:
            return sanitize_native_types({
                "matched": False,
                "reason": "IMAGE_DECODE_ERROR",
                "similarity": 0.0,
                "message": "Invalid frame encoding.",
                "image_width": 0,
                "image_height": 0,
                "num_faces": 0,
                "quality_pass": False,
                "embedding_generated": False,
            })

        faces = self.detect_faces(image)
        num_faces = int(len(faces))

        if num_faces == 0:
            return sanitize_native_types({
                "matched": False,
                "reason": "FACE_NOT_DETECTED",
                "similarity": 0.0,
                "message": "No face detected. Please position your face in view.",
                "image_width": w,
                "image_height": h,
                "num_faces": 0,
                "quality_pass": False,
                "embedding_generated": False,
            })

        if num_faces > 1:
            return sanitize_native_types({
                "matched": False,
                "reason": "MULTIPLE_FACES_DETECTED",
                "similarity": 0.0,
                "message": "Multiple faces detected in camera frame.",
                "image_width": w,
                "image_height": h,
                "num_faces": num_faces,
                "quality_pass": False,
                "embedding_generated": False,
            })

        target_face = faces[0]
        passed_quality, message, details = self.check_face_quality(image, target_face)

        if not passed_quality:
            return sanitize_native_types({
                "matched": False,
                "reason": "LOW_QUALITY",
                "similarity": 0.0,
                "message": f"Quality check failed: {message}",
                "image_width": w,
                "image_height": h,
                "num_faces": 1,
                "quality_pass": False,
                "embedding_generated": False,
            })

        # Generate new ArcFace 512D embedding
        new_embedding = self.generate_embedding(target_face)
        new_vec = np.array(new_embedding, dtype=np.float32)

        mean_emb = enrolled_data.get("mean_embedding")
        sample_embs = enrolled_data.get("sample_embeddings", [])

        similarities = []
        if mean_emb:
            sim_mean = float(np.dot(new_vec, np.array(mean_emb, dtype=np.float32)))
            similarities.append(sim_mean)
        if sample_embs:
            for s_emb in sample_embs:
                sim_s = float(np.dot(new_vec, np.array(s_emb, dtype=np.float32)))
                similarities.append(sim_s)

        if not similarities:
            return sanitize_native_types({
                "matched": False,
                "reason": "NOT_ENROLLED",
                "similarity": 0.0,
                "message": "No face enrollment vectors found for student.",
                "image_width": w,
                "image_height": h,
                "num_faces": 1,
                "quality_pass": True,
                "embedding_generated": True,
            })

        max_similarity = float(max(similarities))
        similarity_score = float(round(max_similarity, 4))
        threshold = settings.FACE_RECOGNITION_SIMILARITY_THRESHOLD

        if similarity_score >= threshold:
            return sanitize_native_types({
                "matched": True,
                "reason": "MATCH_SUCCESS",
                "similarity": similarity_score,
                "message": "Face match verified.",
                "image_width": w,
                "image_height": h,
                "num_faces": 1,
                "quality_pass": True,
                "embedding_generated": True,
            })
        else:
            return sanitize_native_types({
                "matched": False,
                "reason": "FACE_MISMATCH",
                "similarity": similarity_score,
                "message": "Face does not match the enrolled student profile.",
                "image_width": w,
                "image_height": h,
                "num_faces": 1,
                "quality_pass": True,
                "embedding_generated": True,
            })



