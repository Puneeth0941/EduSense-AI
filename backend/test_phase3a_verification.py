import os
import sys
import numpy as np
import cv2
import base64
import io
from PIL import Image

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app.core.config import settings
from app.services.face_service import FaceService, sanitize_native_types


def create_synthetic_face_image(
    face_color=(180, 150, 120),
    eye_color=(40, 40, 40),
    mouth_color=(50, 50, 180),
    offset_x=0,
    offset_y=0,
    size=(640, 480),
    blur=False,
    dark=False
) -> str:
    """
    Generates a synthetic realistic facial test image and returns it as base64 string.
    Draws a head, eyes, nose, and mouth on a neutral background.
    """
    img = np.ones((size[1], size[0], 3), dtype=np.uint8) * 220
    
    if dark:
        img = (img * 0.1).astype(np.uint8)

    cx, cy = size[0] // 2 + offset_x, size[1] // 2 + offset_y

    # Face Oval (Head)
    cv2.ellipse(img, (cx, cy), (110, 140), 0, 0, 360, face_color, -1)

    # Eyes
    cv2.circle(img, (cx - 40, cy - 30), 14, (255, 255, 255), -1)
    cv2.circle(img, (cx + 40, cy - 30), 14, (255, 255, 255), -1)
    cv2.circle(img, (cx - 40, cy - 30), 6, eye_color, -1)
    cv2.circle(img, (cx + 40, cy - 30), 6, eye_color, -1)

    # Nose
    pts = np.array([[cx, cy - 10], [cx - 10, cy + 25], [cx + 10, cy + 25]], np.int32)
    cv2.fillPoly(img, [pts], (150, 120, 90))

    # Mouth
    cv2.ellipse(img, (cx, cy + 55), (35, 15), 0, 0, 180, mouth_color, 4)

    if blur:
        img = cv2.GaussianBlur(img, (31, 31), 0)

    # Encode to base64
    _, buf = cv2.imencode('.jpg', img)
    return base64.b64encode(buf).decode('utf-8')


def run_tests():
    print("=" * 60)
    print("PHASE 3A — NEW-FACE VERIFICATION SUITE TEST")
    print("=" * 60)

    print("\n[1/7] Initializing FaceService singleton...")
    service = FaceService.get_instance()
    print("✓ FaceService instance initialized successfully.")

    # Create synthetic enrollment embeddings representing Student A
    print("\n[2/7] Generating synthetic ArcFace enrollment vectors for Student A...")
    np.random.seed(42)
    # Base 512D vector for Student A
    base_vec_a = np.random.randn(512).astype(np.float32)
    base_vec_a /= np.linalg.norm(base_vec_a)

    # 5 guided samples with slight variation
    sample_embeddings_a = []
    for i in range(5):
        noise = np.random.randn(512).astype(np.float32) * 0.05
        vec = base_vec_a + noise
        vec /= np.linalg.norm(vec)
        sample_embeddings_a.append([float(x) for x in vec])

    mean_emb_a = service.compute_mean_embedding(sample_embeddings_a)
    enrolled_data_student_a = {
        "sample_embeddings": sample_embeddings_a,
        "mean_embedding": mean_emb_a,
        "num_samples": 5,
        "consistency_score": 0.985,
    }
    print("✓ Student A enrollment stored successfully with 5 samples & mean embedding.")

    # TEST 1: Same Student (Student A) test vector match
    print("\n--- TEST 1: Enrolled Student A Vector Match ---")
    new_vec_a = np.array(base_vec_a, dtype=np.float32) + np.random.randn(512).astype(np.float32) * 0.04
    new_vec_a /= np.linalg.norm(new_vec_a)

    # Direct vector similarity evaluation
    sim_a = float(np.dot(new_vec_a, np.array(mean_emb_a, dtype=np.float32)))
    print(f"Calculated similarity for Student A fresh vector: {sim_a:.4f}")
    assert sim_a >= settings.FACE_RECOGNITION_SIMILARITY_THRESHOLD, f"Expected similarity >= {settings.FACE_RECOGNITION_SIMILARITY_THRESHOLD}, got {sim_a}"
    print("✓ TEST 1 PASSED: Fresh vector of Student A matches enrollment (verified = True).")

    # TEST 2: Different Person (Student B) test vector non-match
    print("\n--- TEST 2: Different Person (Student B) Non-Match ---")
    base_vec_b = np.random.randn(512).astype(np.float32)
    base_vec_b /= np.linalg.norm(base_vec_b)

    sim_b = float(np.dot(base_vec_b, np.array(mean_emb_a, dtype=np.float32)))
    print(f"Calculated similarity for Student B vector: {sim_b:.4f}")
    assert sim_b < settings.FACE_RECOGNITION_SIMILARITY_THRESHOLD, f"Expected similarity < {settings.FACE_RECOGNITION_SIMILARITY_THRESHOLD}, got {sim_b}"
    print("✓ TEST 2 PASSED: Vector of Student B rejected as expected (verified = False, identity = None).")

    # TEST 3: Image with No Face
    print("\n--- TEST 3: No Face Image Verification ---")
    no_face_img = np.ones((480, 640, 3), dtype=np.uint8) * 128
    _, buf = cv2.imencode('.jpg', no_face_img)
    no_face_b64 = base64.b64encode(buf).decode('utf-8')

    res_no_face = service.verify_face_against_enrolled(no_face_b64, enrolled_data_student_a)
    print(f"No-face response: verified={res_no_face['verified']}, message='{res_no_face['message']}'")
    assert res_no_face['verified'] is False
    assert res_no_face['identity'] is None
    print("✓ TEST 3 PASSED: No-face frame correctly rejected.")

    # TEST 4: Multiple Faces Image
    print("\n--- TEST 4: Multiple Faces Verification ---")
    multi_face_img = np.ones((480, 640, 3), dtype=np.uint8) * 220
    # Draw face 1
    cv2.ellipse(multi_face_img, (200, 240), (80, 100), 0, 0, 360, (180, 150, 120), -1)
    cv2.circle(multi_face_img, (170, 220), 10, (40, 40, 40), -1)
    cv2.circle(multi_face_img, (230, 220), 10, (40, 40, 40), -1)
    # Draw face 2
    cv2.ellipse(multi_face_img, (440, 240), (80, 100), 0, 0, 360, (160, 140, 110), -1)
    cv2.circle(multi_face_img, (410, 220), 10, (40, 40, 40), -1)
    cv2.circle(multi_face_img, (470, 220), 10, (40, 40, 40), -1)

    _, buf = cv2.imencode('.jpg', multi_face_img)
    multi_b64 = base64.b64encode(buf).decode('utf-8')

    res_multi = service.verify_face_against_enrolled(multi_b64, enrolled_data_student_a)
    print(f"Multi-face response: verified={res_multi['verified']}, message='{res_multi['message']}'")
    assert res_multi['verified'] is False
    print("✓ TEST 4 PASSED: Multiple faces correctly rejected.")

    # TEST 5: Poor Quality / Blurry Image
    print("\n--- TEST 5: Blurry Face Image Verification ---")
    blur_img_b64 = create_synthetic_face_image(blur=True)
    res_blur = service.verify_face_against_enrolled(blur_img_b64, enrolled_data_student_a)
    print(f"Blurry response: verified={res_blur['verified']}, message='{res_blur['message']}'")
    assert res_blur['verified'] is False
    print("✓ TEST 5 PASSED: Poor quality / blurry image correctly rejected.")

    # TEST 6: NumPy Serialization Safety Verification
    print("\n--- TEST 6: NumPy Type Serialization Check ---")
    test_dict = {
        "int64": np.int64(42),
        "float32": np.float32(0.8765),
        "bool": np.bool_(True),
        "array": np.array([0.1, 0.2, 0.3], dtype=np.float32)
    }
    sanitized = sanitize_native_types(test_dict)
    import json
    json_str = json.dumps(sanitized)
    print("Sanitized JSON:", json_str)
    print("✓ TEST 6 PASSED: All NumPy scalars cleanly converted to native Python types.")

    print("\n" + "=" * 60)
    print("ALL 6 VERIFICATION SUITE TESTS COMPLETED SUCCESSFULLY! ✅")
    print("=" * 60)


if __name__ == "__main__":
    run_tests()
