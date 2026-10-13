"""
Unit tests for EduSense AI Whisper Speech-to-Text Transcription Service.
Run with: python3 backend/test_transcription.py
"""

import os
import sys
import io
import wave
import numpy as np

# Ensure project root and backend modules are on sys.path
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
backend_dir = os.path.abspath(os.path.dirname(__file__))
if project_root not in sys.path:
    sys.path.insert(0, project_root)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from ai.speech_transcriber import SpeechTranscriber, speech_transcriber, SUPPORTED_LANGUAGES
from app.services.transcription_service import TranscriptionService


def generate_synthetic_wav(duration_sec: float = 1.0, freq_hz: float = 440.0, sample_rate: int = 16000) -> bytes:
    """Generates a synthetic PCM 16-bit mono WAV buffer."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        n_samples = int(duration_sec * sample_rate)
        t = np.linspace(0, duration_sec, n_samples, endpoint=False)
        samples = (np.sin(2 * np.pi * freq_hz * t) * 12000).astype(np.int16)
        wav.writeframes(samples.tobytes())
    buf.seek(0)
    return buf.read()


def test_speech_transcriber_model_and_validation():
    print("Testing SpeechTranscriber initialization and validation...")
    transcriber = speech_transcriber
    assert transcriber.is_model_loaded is True
    assert transcriber.model is not None

    # 1. Invalid / Empty inputs
    res_empty_arr = transcriber.transcribe(np.array([], dtype=np.float32))
    assert res_empty_arr["valid_input"] is False
    assert res_empty_arr["text"] == ""
    assert res_empty_arr["error"] is not None

    res_empty_bytes = transcriber.transcribe(b"")
    assert res_empty_bytes["valid_input"] is False

    res_invalid_type = transcriber.transcribe(12345)  # type: ignore
    assert res_invalid_type["valid_input"] is False

    print("✓ SpeechTranscriber validation tests passed successfully.")


def test_speech_transcriber_synthetic_audio():
    print("Testing SpeechTranscriber on synthetic audio...")
    transcriber = speech_transcriber

    # 2. Synthetic 1-second WAV audio
    wav_bytes = generate_synthetic_wav(duration_sec=1.0)
    res_wav = transcriber.transcribe(wav_bytes, language="en")
    assert res_wav["valid_input"] is True
    assert res_wav["duration_seconds"] >= 0.9
    assert isinstance(res_wav["segments"], list)
    assert res_wav["model_loaded"] is True

    # 3. Kannada language flag support
    res_kn = transcriber.transcribe(wav_bytes, language="kn")
    assert res_kn["valid_input"] is True
    assert res_kn["language"] == "kn"

    # 4. Auto language flag support
    res_auto = transcriber.transcribe(wav_bytes, language="auto")
    assert res_auto["valid_input"] is True

    print("✓ SpeechTranscriber audio and language tests passed successfully.")


def test_transcription_service_integration():
    print("Testing TranscriptionService and sentiment enrichment...")
    service = TranscriptionService()

    # 1. Supported languages list
    langs = service.get_supported_languages()
    assert len(langs) >= 3
    codes = [l.code for l in langs]
    assert "en" in codes
    assert "kn" in codes
    assert "auto" in codes

    # 2. Transcription with sentiment enrichment
    wav_bytes = generate_synthetic_wav(duration_sec=1.0)
    resp = service.transcribe_audio(
        audio_input=wav_bytes,
        language="en",
        analyze_sentiment=True,
    )
    assert resp.valid_input is True
    assert resp.duration_seconds >= 0.9

    print("✓ TranscriptionService tests passed successfully.")


if __name__ == "__main__":
    print("=== Running EduSense AI Whisper Transcription Unit Tests ===")
    test_speech_transcriber_model_and_validation()
    test_speech_transcriber_synthetic_audio()
    test_transcription_service_integration()
    print("=============================================================")
    print("ALL TRANSCRIPTION UNIT TESTS PASSED SUCCESSFULLY! ✅")
