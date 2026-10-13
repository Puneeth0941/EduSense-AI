"""
Unit tests for EduSense AI Engagement Analytics Engine.
Run with: python3 test_analytics.py
"""

import sys
import os
import numpy as np

# Ensure project root and backend modules are on sys.path
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
backend_dir = os.path.abspath(os.path.dirname(__file__))
if project_root not in sys.path:
    sys.path.insert(0, project_root)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from ai.facial_emotion import FacialEmotionAnalyzer
from ai.sentiment_analyzer import TextSentimentAnalyzer
from app.services.analytics_service import AnalyticsService, analytics_service
from app.schemas.analytics import (
    FacialAnalysisResult,
    SentimentAnalysisResult,
    StudentEngagementSummary,
)


def test_facial_emotion_analyzer():
    print("Testing FacialEmotionAnalyzer with ONNX FERPlus Model...")
    analyzer = FacialEmotionAnalyzer()

    # Verify ONNX model is loaded safely
    assert analyzer.emotion_model_loaded is True
    assert analyzer.session is not None

    # 1. Invalid / Empty input
    res_none = analyzer.analyze_frame(None)
    assert res_none["valid_input"] is False
    assert res_none["face_detected"] is False
    assert res_none["attentiveness_score"] == 0.0

    res_empty = analyzer.analyze_frame(np.array([]))
    assert res_empty["valid_input"] is False

    # 2. Synthetic black frame (No face detected)
    black_frame = np.zeros((300, 300, 3), dtype=np.uint8)
    res_no_face = analyzer.analyze_frame(black_frame)
    assert res_no_face["valid_input"] is True
    assert res_no_face["face_detected"] is False
    assert res_no_face["is_distracted"] is True
    assert res_no_face["distraction_type"] == "no_face_detected"
    assert res_no_face["emotion_model_loaded"] is True

    # 3. Synthetic face frame (Circle drawn to simulate a face)
    face_frame = np.zeros((400, 400, 3), dtype=np.uint8)
    cv2_img = cv2_draw_synthetic_face(face_frame)
    res_face = analyzer.analyze_frame(cv2_img)
    assert res_face["valid_input"] is True
    assert res_face["face_detected"] is True

    # Verify Head-Pose Analytics Preservation
    assert "pitch" in res_face["head_pose"]
    assert "yaw" in res_face["head_pose"]
    assert "roll" in res_face["head_pose"]
    assert "orientation" in res_face["head_pose"]
    assert 0.0 <= res_face["attentiveness_score"] <= 1.0

    # Verify ONNX FERPlus Expression Inference Output
    assert res_face["emotion_model_loaded"] is True
    assert res_face["dominant_emotion"] in ["neutral", "happy", "sad", "angry", "fear", "uncertain"]
    assert len(res_face["emotion_probabilities"]) == 8
    assert "neutral" in res_face["emotion_probabilities"]
    assert "happy" in res_face["emotion_probabilities"]

    # 4. Non-existent model fallback safety check (Must NOT crash, sets emotion_model_loaded=False)
    fallback_analyzer = FacialEmotionAnalyzer(emotion_model_path="non_existent_model.onnx")
    assert fallback_analyzer.emotion_model_loaded is False
    res_fallback = fallback_analyzer.analyze_frame(cv2_img)
    assert res_fallback["valid_input"] is True
    assert res_fallback["face_detected"] is True
    assert res_fallback["emotion_model_loaded"] is False

    print("✓ FacialEmotionAnalyzer tests passed successfully.")


def cv2_draw_synthetic_face(img):
    import cv2
    # Draw head outline
    cv2.circle(img, (200, 200), 80, (200, 200, 200), -1)
    # Draw eyes
    cv2.circle(img, (170, 180), 12, (0, 0, 0), -1)
    cv2.circle(img, (230, 180), 12, (0, 0, 0), -1)
    # Draw mouth
    cv2.rectangle(img, (175, 230), (225, 240), (0, 0, 0), -1)
    return img


def test_sentiment_analyzer():
    print("Testing TextSentimentAnalyzer...")
    analyzer = TextSentimentAnalyzer()

    # 1. Invalid / Empty text
    res_empty = analyzer.analyze_text("")
    assert res_empty["valid_input"] is False
    assert res_empty["sentiment_score"] == 0.0

    res_none = analyzer.analyze_text(None)
    assert res_none["valid_input"] is False

    # 2. Positive text
    res_pos = analyzer.analyze_text("This lecture is great and super clear, thank you!")
    assert res_pos["valid_input"] is True
    assert res_pos["sentiment_score"] > 0.0
    assert res_pos["sentiment_label"] in ["positive", "neutral"]

    # 3. Question & Confusion text
    res_conf = analyzer.analyze_text("I am very confused about line 4, can you re-explain?")
    assert res_conf["valid_input"] is True
    assert res_conf["is_question"] is True
    assert res_conf["is_confusion"] is True
    assert res_conf["sentiment_label"] == "confused"

    print("✓ TextSentimentAnalyzer tests passed successfully.")


def test_analytics_service_engagement_formula():
    print("Testing AnalyticsService engagement score formula...")
    service = AnalyticsService(
        weight_attentiveness=0.60,
        weight_participation=0.25,
        weight_sentiment=0.15
    )

    # 1. All signals present: attentiveness=90, participation=80, sentiment=60
    # Expected: (90*0.60 + 80*0.25 + 60*0.15) / 1.0 = (54 + 20 + 9) = 83.0
    score_all = service.calculate_composite_engagement(
        attentiveness_subscore=90.0,
        participation_subscore=80.0,
        sentiment_subscore=60.0
    )
    assert score_all == 83.0

    # 2. Missing sentiment signal (MUST NOT BE TREATED AS 0!)
    # Expected re-normalized weights: attentiveness=0.60, participation=0.25 (Total weight = 0.85)
    # Expected score: (90*0.60 + 80*0.25) / 0.85 = 74 / 0.85 = 87.06
    score_no_sentiment = service.calculate_composite_engagement(
        attentiveness_subscore=90.0,
        participation_subscore=80.0,
        sentiment_subscore=None
    )
    assert score_no_sentiment == 87.06

    # 3. Only attentiveness signal present
    score_only_att = service.calculate_composite_engagement(
        attentiveness_subscore=90.0,
        participation_subscore=None,
        sentiment_subscore=None
    )
    assert score_only_att == 90.0

    # 4. No signals present -> Must return None
    score_none = service.calculate_composite_engagement(None, None, None)
    assert score_none is None

    # 5. Sentiment normalization check
    norm_high = service.normalize_sentiment_to_subscore(1.0)
    assert norm_high == 100.0

    norm_zero = service.normalize_sentiment_to_subscore(0.0)
    assert norm_zero == 50.0

    norm_low = service.normalize_sentiment_to_subscore(-1.0)
    assert norm_low == 0.0

    print("✓ AnalyticsService engagement score formula tests passed successfully.")


def test_temporal_aggregation():
    print("Testing 5-Minute Temporal Aggregation Engine...")

    # TEST 1: 3 valid samples -> correct student dominant expression
    samples1 = [
        {"dominant_emotion": "neutral", "emotion_probabilities": {"neutral": 0.70, "happy": 0.20, "sad": 0.10, "angry": 0.0, "fear": 0.0}},
        {"dominant_emotion": "neutral", "emotion_probabilities": {"neutral": 0.60, "happy": 0.30, "sad": 0.10, "angry": 0.0, "fear": 0.0}},
        {"dominant_emotion": "neutral", "emotion_probabilities": {"neutral": 0.65, "happy": 0.25, "sad": 0.10, "angry": 0.0, "fear": 0.0}},
    ]
    res1 = analytics_service.aggregate_student_window_facial_emotion(samples1)
    assert res1["dominant_expression"] == "neutral"
    assert res1["valid_sample_count"] == 3

    # TEST 2: 2 Neutral + 1 Happy -> Neutral
    samples2 = [
        {"dominant_emotion": "neutral", "emotion_probabilities": {"neutral": 0.75, "happy": 0.25, "sad": 0.0, "angry": 0.0, "fear": 0.0}},
        {"dominant_emotion": "happy", "emotion_probabilities": {"neutral": 0.20, "happy": 0.80, "sad": 0.0, "angry": 0.0, "fear": 0.0}},
        {"dominant_emotion": "neutral", "emotion_probabilities": {"neutral": 0.70, "happy": 0.30, "sad": 0.0, "angry": 0.0, "fear": 0.0}},
    ]
    res2 = analytics_service.aggregate_student_window_facial_emotion(samples2)
    assert res2["dominant_expression"] == "neutral"

    # TEST 3: 2 Happy + 1 Neutral -> Happy
    samples3 = [
        {"dominant_emotion": "happy", "emotion_probabilities": {"happy": 0.80, "neutral": 0.20, "sad": 0.0, "angry": 0.0, "fear": 0.0}},
        {"dominant_emotion": "happy", "emotion_probabilities": {"happy": 0.85, "neutral": 0.15, "sad": 0.0, "angry": 0.0, "fear": 0.0}},
        {"dominant_emotion": "neutral", "emotion_probabilities": {"happy": 0.30, "neutral": 0.70, "sad": 0.0, "angry": 0.0, "fear": 0.0}},
    ]
    res3 = analytics_service.aggregate_student_window_facial_emotion(samples3)
    assert res3["dominant_expression"] == "happy"

    # TEST 4: all uncertain -> insufficient_data
    samples4 = [
        {"dominant_emotion": "uncertain", "emotion_probabilities": {}},
        {"dominant_emotion": "uncertain", "emotion_probabilities": {}},
        {"dominant_emotion": "uncertain", "emotion_probabilities": {}},
    ]
    res4 = analytics_service.aggregate_student_window_facial_emotion(samples4)
    assert res4["dominant_expression"] == "insufficient_data"
    assert res4["valid_sample_count"] == 0

    # TEST 5: one invalid sample + two valid samples -> valid aggregation
    samples5 = [
        {"dominant_emotion": "no_face_detected", "emotion_probabilities": {}},
        {"dominant_emotion": "neutral", "emotion_probabilities": {"neutral": 0.80, "happy": 0.20, "sad": 0.0, "angry": 0.0, "fear": 0.0}},
        {"dominant_emotion": "neutral", "emotion_probabilities": {"neutral": 0.70, "happy": 0.30, "sad": 0.0, "angry": 0.0, "fear": 0.0}},
    ]
    res5 = analytics_service.aggregate_student_window_facial_emotion(samples5)
    assert res5["dominant_expression"] == "neutral"
    assert res5["valid_sample_count"] == 2

    # TEST 6: multiple students -> correct classroom distribution
    student_results6 = [
        {"dominant_expression": "neutral"},
        {"dominant_expression": "neutral"},
        {"dominant_expression": "happy"},
        {"dominant_expression": "neutral"},
        {"dominant_expression": "sad"},
    ]
    class_res6 = analytics_service.aggregate_classroom_window_facial_emotion(student_results6)
    assert class_res6["dominant_expression"] == "neutral"
    assert class_res6["students_with_valid_expression"] == 5
    assert class_res6["expression_distribution"]["neutral"] == 0.60
    assert class_res6["expression_distribution"]["happy"] == 0.20
    assert class_res6["expression_distribution"]["sad"] == 0.20

    # TEST 7: one student has more raw observations than another -> equal weighting (1 vote per student)
    stu_a_raw = [{"dominant_emotion": "happy", "emotion_probabilities": {"happy": 0.90}} for _ in range(10)]
    res_a = analytics_service.aggregate_student_window_facial_emotion(stu_a_raw)
    assert res_a["dominant_expression"] == "happy"

    res_b = {"dominant_expression": "neutral"}
    res_c = {"dominant_expression": "neutral"}

    class_res7 = analytics_service.aggregate_classroom_window_facial_emotion([res_a, res_b, res_c])
    assert class_res7["dominant_expression"] == "neutral"
    assert class_res7["students_with_valid_expression"] == 3

    # TEST 8: multiple 5-minute windows -> correct session-level aggregation
    windows = [
        {"dominant_expression": "neutral", "expression_distribution": {"neutral": 0.8, "happy": 0.2, "sad": 0.0, "angry": 0.0, "fear": 0.0}},
        {"dominant_expression": "happy", "expression_distribution": {"neutral": 0.3, "happy": 0.7, "sad": 0.0, "angry": 0.0, "fear": 0.0}},
        {"dominant_expression": "neutral", "expression_distribution": {"neutral": 0.9, "happy": 0.1, "sad": 0.0, "angry": 0.0, "fear": 0.0}},
    ]
    session_res8 = analytics_service.aggregate_session_facial_emotion(windows)
    assert session_res8["dominant_expression"] == "neutral"
    assert session_res8["valid_windows"] == 3

    print("✓ 5-Minute Temporal Aggregation Engine tests passed successfully.")


def run_all_tests():
    print("=== Running EduSense AI Analytics Unit Tests ===")
    test_facial_emotion_analyzer()
    test_sentiment_analyzer()
    test_analytics_service_engagement_formula()
    test_temporal_aggregation()
    print("===============================================")
    print("ALL TESTS PASSED SUCCESSFULLY! ✅")


if __name__ == "__main__":
    run_all_tests()
