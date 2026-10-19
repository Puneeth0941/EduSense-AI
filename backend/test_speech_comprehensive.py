"""
Comprehensive Speech & Sentiment Analysis Verification Suite for EduSense AI.

Executes actual tests against:
1. Clear English speech.
2. English speech with pauses.
3. Longer classroom lecture sentences.
4. Speech with moderate background noise (SNR ~15dB).
5. Kannada speech samples.
6. Silence / Ambient noise rejection.
7. Text sentiment classification (Positive, Negative, Neutral, Ambiguous, Question intent).
8. Multilingual sentiment guardrail (Kannada/Hindi flagged as unsupported).
"""

import os
import sys
import re
import math
import wave
import struct
import subprocess
import numpy as np
from typing import Tuple, List, Dict, Any

# Setup paths
backend_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(backend_dir)
if project_root not in sys.path:
    sys.path.insert(0, project_root)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from ai.speech_transcriber import speech_transcriber
from ai.sentiment_analyzer import sentiment_analyzer
from app.services.transcription_service import transcription_service
from app.services.analytics_service import analytics_service


def calculate_wer(reference: str, hypothesis: str) -> float:
    """Calculate Word Error Rate (WER) using Levenshtein distance on words."""
    ref_words = re.sub(r"[^\w\s]", "", reference).lower().strip().split()
    hyp_words = re.sub(r"[^\w\s]", "", hypothesis).lower().strip().split()
    if not ref_words:
        return 0.0 if not hyp_words else 1.0

    d = [[0] * (len(hyp_words) + 1) for _ in range(len(ref_words) + 1)]
    for i in range(len(ref_words) + 1):
        d[i][0] = i
    for j in range(len(hyp_words) + 1):
        d[0][j] = j

    for i in range(1, len(ref_words) + 1):
        for j in range(1, len(hyp_words) + 1):
            if ref_words[i - 1] == hyp_words[j - 1]:
                d[i][j] = d[i - 1][j - 1]
            else:
                d[i][j] = 1 + min(d[i - 1][j], d[i][j - 1], d[i - 1][j - 1])

    return round(d[len(ref_words)][len(hyp_words)] / len(ref_words), 4)


def calculate_cer(reference: str, hypothesis: str) -> float:
    """Calculate Character Error Rate (CER) for phonetics or Indic scripts."""
    ref_chars = list(re.sub(r"\s+", "", reference))
    hyp_chars = list(re.sub(r"\s+", "", hypothesis))
    if not ref_chars:
        return 0.0 if not hyp_chars else 1.0

    d = [[0] * (len(hyp_chars) + 1) for _ in range(len(ref_chars) + 1)]
    for i in range(len(ref_chars) + 1):
        d[i][0] = i
    for j in range(len(hyp_chars) + 1):
        d[0][j] = j

    for i in range(1, len(ref_chars) + 1):
        for j in range(1, len(hyp_chars) + 1):
            if ref_chars[i - 1] == hyp_chars[j - 1]:
                d[i][j] = d[i - 1][j - 1]
            else:
                d[i][j] = 1 + min(d[i - 1][j], d[i][j - 1], d[i - 1][j - 1])

    return round(d[len(ref_chars)][len(hyp_chars)] / len(ref_chars), 4)


def generate_synthesized_wav(text: str, output_path: str):
    """Synthesize speech on macOS using say and convert to 16kHz mono WAV using afconvert."""
    aiff_path = output_path.replace(".wav", ".aiff")
    subprocess.run(["say", "-v", "Samantha", "-o", aiff_path, text], check=True)
    subprocess.run([
        "afconvert", "-f", "WAVE", "-d", "LEI16@16000", "-c", "1",
        aiff_path, output_path
    ], check=True)
    if os.path.exists(aiff_path):
        os.remove(aiff_path)


def generate_noisy_wav(clean_wav_path: str, output_path: str, snr_db: float = 15.0):
    """Add Gaussian noise to a clean WAV file at specified SNR."""
    with wave.open(clean_wav_path, "rb") as wf:
        n_channels = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        framerate = wf.getframerate()
        n_frames = wf.getnframes()
        raw_bytes = wf.readframes(n_frames)

    samples = np.frombuffer(raw_bytes, dtype=np.int16).astype(np.float32)
    signal_power = np.mean(samples ** 2)
    noise_power = signal_power / (10 ** (snr_db / 10.0))
    noise = np.random.normal(0, np.sqrt(noise_power), samples.shape)
    noisy_samples = np.clip(samples + noise, -32768, 32767).astype(np.int16)

    with wave.open(output_path, "wb") as wf:
        wf.setnchannels(n_channels)
        wf.setsampwidth(sampwidth)
        wf.setframerate(framerate)
        wf.writeframes(noisy_samples.tobytes())


def generate_silence_wav(output_path: str, duration_sec: float = 2.0):
    """Generate pure silence WAV file."""
    framerate = 16000
    n_frames = int(framerate * duration_sec)
    silence = np.zeros(n_frames, dtype=np.int16)
    with wave.open(output_path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(framerate)
        wf.writeframes(silence.tobytes())


def run_tests():
    print("=" * 80)
    print("EDUSENSE AI: SPEECH RECOGNITION & SENTIMENT ANALYSIS VERIFICATION SUITE")
    print("=" * 80)

    test_audio_dir = os.path.join(backend_dir, "test_audio")
    os.makedirs(test_audio_dir, exist_ok=True)

    # Prepare specialized test files
    en_paused_path = os.path.join(test_audio_dir, "en_test_paused.wav")
    en_long_path = os.path.join(test_audio_dir, "en_test_long.wav")
    en_noisy_path = os.path.join(test_audio_dir, "en_test_noisy.wav")
    silence_path = os.path.join(test_audio_dir, "silence_2s.wav")

    paused_ref = "Hello everyone, can everyone see the slides on the screen?"
    generate_synthesized_wav("Hello everyone, [[slnc 1000]] can everyone see the slides on the screen?", en_paused_path)

    long_ref = "In today's lecture we will examine artificial intelligence algorithms, deep neural network architectures, and natural language processing pipelines."
    generate_synthesized_wav(long_ref, en_long_path)

    clean_welcome_path = os.path.join(test_audio_dir, "en_welcome.wav")
    generate_noisy_wav(clean_welcome_path, en_noisy_path, snr_db=14.0)

    generate_silence_wav(silence_path, duration_sec=2.0)

    results = []

    # -------------------------------------------------------------------------
    # PART 1: SPEECH TRANSCRIPTION TESTS
    # -------------------------------------------------------------------------
    print("\n[PART 1: SPEECH TRANSCRIPTION TESTS]")
    print("-" * 80)

    speech_test_cases = [
        {
            "category": "Clear English Speech",
            "file": "en_welcome.wav",
            "language": "en",
            "reference": "Good morning class, welcome to today's session.",
        },
        {
            "category": "English Speech with Pauses",
            "file": "en_test_paused.wav",
            "language": "en",
            "reference": paused_ref,
        },
        {
            "category": "Longer Classroom Sentence",
            "file": "en_test_long.wav",
            "language": "en",
            "reference": long_ref,
        },
        {
            "category": "Speech with Background Noise (SNR ~14dB)",
            "file": "en_test_noisy.wav",
            "language": "en",
            "reference": "Good morning class, welcome to today's session.",
        },
        {
            "category": "Kannada Speech Sample 1",
            "file": "kn_1.mp3",
            "language": "kn",
            "reference": "ಶುಭೋದಯ ನೀವು ಹೇಗಿದ್ದೀರಿ",
        },
        {
            "category": "Kannada Speech Sample 2",
            "file": "kn_2.mp3",
            "language": "kn",
            "reference": "ಇವತ್ತು ನಾವು ಕಂಪ್ಯೂಟರ್ ವಿಜ್ಞಾನ ಕಲಿಯುತ್ತೇವೆ",
        },
        {
            "category": "Kannada Speech Sample 3",
            "file": "kn_3.mp3",
            "language": "kn",
            "reference": "ದಯವಿಟ್ಟು ಮುಂದಿನ ಪ್ರಶ್ನೆಗೆ ಉತ್ತರಿಸಿ",
        },
        {
            "category": "Silence / Quiet Room (2.0s)",
            "file": "silence_2s.wav",
            "language": "auto",
            "reference": "",
        },
    ]

    for tc in speech_test_cases:
        filepath = os.path.join(test_audio_dir, tc["file"])
        with open(filepath, "rb") as f:
            audio_bytes = f.read()

        trans_res = speech_transcriber.transcribe(
            audio_bytes,
            language=tc["language"],
        )

        pred_text = trans_res.get("text", "")
        det_lang = trans_res.get("language")
        quality = trans_res.get("quality_status")

        if tc["reference"] and tc["language"] == "en":
            wer = calculate_wer(tc["reference"], pred_text)
            accuracy = f"WER: {wer * 100:.1f}%"
        elif tc["reference"]:
            cer = calculate_cer(tc["reference"], pred_text)
            accuracy = f"CER: {cer * 100:.1f}% (Indic script)"
        else:
            accuracy = "N/A (Silence test)"

        status_flag = "PASS"
        if tc["category"].startswith("Silence"):
            if pred_text.strip() != "":
                status_flag = "FAIL (Hallucinated text on silence)"
        elif not pred_text.strip():
            status_flag = "FAIL (Empty output on audible speech)"

        print(f"\nTest: {tc['category']}")
        print(f"  File: {tc['file']}")
        print(f"  Configured Lang: {tc['language']} | Detected Lang: {det_lang}")
        print(f"  Expected Reference: '{tc['reference']}'")
        print(f"  Actual Transcript:  '{pred_text}'")
        print(f"  Quality Status:     {quality} | Evaluation Metric: {accuracy}")
        print(f"  Result:             {status_flag}")

        results.append({
            "category": tc["category"],
            "expected": tc["reference"],
            "actual": pred_text,
            "metric": accuracy,
            "status": status_flag,
        })

    # -------------------------------------------------------------------------
    # PART 2: TEXT SENTIMENT ANALYSIS TESTS
    # -------------------------------------------------------------------------
    print("\n" + "=" * 80)
    print("[PART 2: TEXT SENTIMENT & EDUCATIONAL INTENT ANALYSIS TESTS]")
    print("-" * 80)

    sentiment_test_cases = [
        {
            "category": "Positive Speech Transcript",
            "text": "This lecture is extremely clear and interesting! Thank you so much professor.",
            "language": "en",
            "expected_label": "positive",
            "expect_question": False,
        },
        {
            "category": "Negative Speech Transcript",
            "text": "I am completely confused and struggling to understand this difficult topic.",
            "language": "en",
            "expected_label": "negative",
            "expect_question": False,
        },
        {
            "category": "Neutral Speech Transcript",
            "text": "The lecture starts at two o'clock in room four hundred.",
            "language": "en",
            "expected_label": "neutral",
            "expect_question": False,
        },
        {
            "category": "Ambiguous / Mixed Classroom Feedback",
            "text": "The assignment was somewhat long and demanding, but we managed to finish it.",
            "language": "en",
            "expected_label": "neutral",  # Balanced statement without extreme emotional polarity
            "expect_question": False,
        },
        {
            "category": "Educational Question Intent",
            "text": "Could you please explain how gradient descent updates the weights?",
            "language": "en",
            "expected_label": "neutral",
            "expect_question": True,
        },
        {
            "category": "Unsupported Language (Kannada text guardrail)",
            "text": "ಶುಭೋದಯ ನೀವು ಹೇಗಿದ್ದೀರಿ",
            "language": "kn",
            "expected_label": "unsupported_language",
            "expect_question": False,
        },
        {
            "category": "Unsupported Language (Hindi text guardrail)",
            "text": "नमस्ते आप कैसे हैं",
            "language": "hi",
            "expected_label": "unsupported_language",
            "expect_question": False,
        },
        {
            "category": "Empty Transcript Input",
            "text": "   ",
            "language": "en",
            "expected_label": "neutral",
            "expect_question": False,
        },
    ]

    for tc in sentiment_test_cases:
        res = analytics_service.process_text_sentiment(tc["text"], language=tc["language"])

        label = res.sentiment_label
        score = res.sentiment_score
        conf = res.confidence
        is_q = res.is_question
        lang_supp = res.language_supported

        match = (label == tc["expected_label"])
        q_match = (is_q == tc["expect_question"])
        overall = "PASS" if (match and q_match) else "FAIL"

        print(f"\nTest: {tc['category']}")
        print(f"  Input Text:       '{tc['text']}'")
        print(f"  Expected Label:   {tc['expected_label']} (Question: {tc['expect_question']})")
        print(f"  Predicted Label:  {label} (Question: {is_q}, Confusion: {res.is_confusion})")
        print(f"  Valence Score:    {score} | Confidence: {conf} | Language Supported: {lang_supp}")
        if res.note:
            print(f"  Advisory Note:    {res.note}")
        print(f"  Result:           {overall}")

    # -------------------------------------------------------------------------
    # PART 3: END-TO-END SERVICE INTEGRATION TEST
    # -------------------------------------------------------------------------
    print("\n" + "=" * 80)
    print("[PART 3: END-TO-END AUDIO PIPELINE INTEGRATION TEST]")
    print("-" * 80)

    with open(clean_welcome_path, "rb") as f:
        e2e_bytes = f.read()

    e2e_res = transcription_service.transcribe_audio(
        audio_input=e2e_bytes,
        language="en",
        analyze_sentiment=True,
    )

    print(f"End-to-End Pipeline Output:")
    print(f"  Valid Input:          {e2e_res.valid_input}")
    print(f"  Transcribed Text:     '{e2e_res.text}'")
    print(f"  Detected Language:    {e2e_res.language} (p={e2e_res.language_probability})")
    print(f"  Duration:             {e2e_res.duration}s")
    print(f"  Quality Status:       {e2e_res.quality_status}")
    print(f"  Sentiment Label:      {e2e_res.sentiment_label}")
    print(f"  Sentiment Score:      {e2e_res.sentiment_score}")
    print(f"  Question Flag:        {e2e_res.is_question}")
    print(f"  Confusion Flag:       {e2e_res.is_confusion}")

    assert e2e_res.valid_input is True
    assert "Good morning" in e2e_res.text
    assert e2e_res.sentiment_label == "positive"
    print("\n✓ ALL END-TO-END VERIFICATION CHECKS PASSED.")
    print("=" * 80)


if __name__ == "__main__":
    run_tests()
