"""
Speech-to-Text Transcription Service for EduSense AI using Whisper.

Provides:
1. Audio decoding (WAV, MP3, WebM, OGG, M4A, FLAC) to 16kHz float32 mono.
2. Fast CPU/GPU inference via faster-whisper (CTranslate2).
3. English ('en') and Kannada ('kn') transcription support with automatic language detection.
4. Timestamps per segment and text concatenation.
5. Robust error handling for silence, empty audio, invalid formats, and missing dependencies.
"""

import os
import io
import re
import logging
from typing import Dict, Any, List, Optional, Union, BinaryIO
import numpy as np

logger = logging.getLogger(__name__)

# Apply safe compatibility wrapper for PyAV if needed
try:
    import av
    _orig_av_open = av.open

    def _safe_av_open(*args, **kwargs):
        # PyAV 19+ removed metadata_errors keyword argument which older faster-whisper calls
        kwargs.pop("metadata_errors", None)
        return _orig_av_open(*args, **kwargs)

    av.open = _safe_av_open
    try:
        import faster_whisper.audio
        faster_whisper.audio.av.open = _safe_av_open
    except Exception:
        pass
except Exception:
    pass

# Supported primary languages for EduSense AI
SUPPORTED_LANGUAGES = {
    "auto": "Auto Detect",
    "en": "English",
    "kn": "Kannada",
    "hi": "Hindi",
}

# Educational native script prompts to condition Whisper decoder
LANGUAGE_PROMPTS = {
    "hi": "यह एक शैक्षिक व्याख्यान और कक्षा की चर्चा है।",
    "en": "EduSense AI educational classroom lecture and student discussion.",
}


class SpeechTranscriber:
    """
    Service for speech-to-text transcription using pretrained Whisper models.
    """

    def __init__(
        self,
        model_size: str = "small",
        device: str = "cpu",
        compute_type: str = "int8",
        download_root: Optional[str] = None,
    ):
        self.model_size = os.getenv("WHISPER_MODEL_SIZE", model_size)
        self.device = device
        self.compute_type = compute_type
        self.download_root = download_root
        self.model = None
        self.is_model_loaded = False

        self._load_model()

    def _load_model(self):
        """Attempts to load the Whisper model safely."""
        try:
            from faster_whisper import WhisperModel
            logger.info(
                f"[WHISPER INIT] Loading faster-whisper model '{self.model_size}' on {self.device} ({self.compute_type})..."
            )
            self.model = WhisperModel(
                self.model_size,
                device=self.device,
                compute_type=self.compute_type,
                download_root=self.download_root,
            )
            self.is_model_loaded = True
            logger.info(f"[WHISPER INIT] Whisper model '{self.model_size}' loaded successfully.")
        except Exception as e:
            logger.warning(
                f"[WHISPER INIT WARNING] Could not load Whisper model '{self.model_size}': {e}. "
                "Transcription will fallback to mock/empty mode if called."
            )
            self.model = None
            self.is_model_loaded = False

    def decode_audio_bytes(
        self, audio_data: Union[bytes, BinaryIO], sampling_rate: int = 16000
    ) -> np.ndarray:
        """
        Decodes arbitrary audio bytes/stream (WAV, WebM, MP3, etc.) into a 1D float32 numpy array
        sampled at 16,000 Hz.
        """
        if isinstance(audio_data, bytes):
            audio_stream = io.BytesIO(audio_data)
        else:
            audio_stream = audio_data

        try:
            import av
            container = av.open(audio_stream, mode="r")
            resampler = av.audio.resampler.AudioResampler(
                format="s16", layout="mono", rate=sampling_rate
            )
            frames_data = []
            for frame in container.decode(audio=0):
                resampled_frames = resampler.resample(frame)
                for rf in resampled_frames:
                    frames_data.append(rf.to_ndarray().flatten())

            # Flush any remaining audio buffered inside the resampler filter
            flush_frames = resampler.resample(None)
            for rf in flush_frames:
                frames_data.append(rf.to_ndarray().flatten())

            if not frames_data:
                return np.array([], dtype=np.float32)

            raw_s16 = np.concatenate(frames_data)
            return (raw_s16 / 32768.0).astype(np.float32)
        except Exception as decode_err:
            logger.warning(f"[AUDIO DECODE ERROR] PyAV decode failed: {decode_err}")
            # Fallback to standard wave module if PCM WAV
            try:
                import wave
                if isinstance(audio_data, bytes):
                    audio_stream = io.BytesIO(audio_data)
                else:
                    audio_stream.seek(0)
                with wave.open(audio_stream, "rb") as wav:
                    n_channels = wav.getnchannels()
                    sampwidth = wav.getsampwidth()
                    framerate = wav.getframerate()
                    n_frames = wav.getnframes()
                    raw_bytes = wav.readframes(n_frames)
                    if sampwidth == 2:
                        samples = np.frombuffer(raw_bytes, dtype=np.int16)
                    elif sampwidth == 1:
                        samples = (np.frombuffer(raw_bytes, dtype=np.uint8).astype(np.int16) - 128) * 256
                    else:
                        samples = np.frombuffer(raw_bytes, dtype=np.int16)

                    if n_channels > 1:
                        samples = samples[::n_channels]

                    float_samples = (samples / 32768.0).astype(np.float32)
                    if framerate != sampling_rate and len(float_samples) > 0:
                        # Simple linear resample if scipy is available
                        try:
                            from scipy.signal import resample
                            new_length = int(len(float_samples) * (sampling_rate / framerate))
                            float_samples = resample(float_samples, new_length).astype(np.float32)
                        except Exception:
                            pass
                    return float_samples
            except Exception as wav_err:
                logger.error(f"[AUDIO DECODE FALLBACK ERROR] wave module decode failed: {wav_err}")
                return np.array([], dtype=np.float32)

    def transcribe(
        self,
        audio_input: Union[bytes, BinaryIO, np.ndarray, str],
        language: Optional[str] = None,
        beam_size: int = 2,
        temperature: float = 0.0,
    ) -> Dict[str, Any]:
        """
        Transcribes speech audio into text using Whisper.

        Parameters:
        - audio_input: Audio as bytes, file-like object, numpy array (float32 at 16kHz), or file path.
        - language: 'en', 'kn', or None/'auto' for automatic language detection.
        - beam_size: Beam search width (default 2 for balanced speed and accuracy).
        - temperature: Sampling temperature (default 0.0 for deterministic decoding).

        Returns:
            Dictionary with transcription metadata, full text, detected language, and segments with timestamps.
        """
        # Validate model readiness
        if not self.is_model_loaded or self.model is None:
            return {
                "valid_input": False,
                "text": "",
                "language": language or "auto",
                "language_probability": 0.0,
                "duration_seconds": 0.0,
                "segments": [],
                "model_loaded": False,
                "error": "Whisper transcription model is not loaded.",
            }

        # Resolve language parameter
        target_lang = None
        if language and language.strip().lower() not in ["auto", "none", ""]:
            target_lang = language.strip().lower()
            if target_lang not in ["en", "kn", "hi"]:
                logger.info(f"[WHISPER] Requested language '{target_lang}' (supported: 'en', 'kn', 'hi').")

        # Convert input to numpy array or file-like object
        audio_array = None
        if isinstance(audio_input, np.ndarray):
            audio_array = audio_input
        elif isinstance(audio_input, (bytes, io.BytesIO, BinaryIO)):
            audio_array = self.decode_audio_bytes(audio_input)
        elif isinstance(audio_input, str):
            if os.path.exists(audio_input):
                with open(audio_input, "rb") as f:
                    audio_array = self.decode_audio_bytes(f.read())
            else:
                return {
                    "valid_input": False,
                    "text": "",
                    "language": target_lang or "auto",
                    "language_probability": 0.0,
                    "duration_seconds": 0.0,
                    "segments": [],
                    "model_loaded": True,
                    "error": f"Audio file not found: {audio_input}",
                }
        else:
            return {
                "valid_input": False,
                "text": "",
                "language": target_lang or "auto",
                "language_probability": 0.0,
                "duration_seconds": 0.0,
                "segments": [],
                "model_loaded": True,
                "error": "Unsupported audio input type.",
            }

        # Handle empty / silence audio
        if audio_array is None or len(audio_array) == 0:
            return {
                "valid_input": False,
                "text": "",
                "language": target_lang or "auto",
                "language_probability": 0.0,
                "duration_seconds": 0.0,
                "segments": [],
                "model_loaded": True,
                "error": "Audio input contains no audible samples.",
            }

        # Calculate duration
        duration_seconds = round(float(len(audio_array) / 16000.0), 3)

        # Skip very short audio (< 0.25s) or near-silent background
        rms = float(np.sqrt(np.mean(audio_array**2))) if len(audio_array) > 0 else 0.0
        if duration_seconds < 0.25 or rms < 0.003:
            return {
                "valid_input": True,
                "text": "",
                "language": target_lang or "auto",
                "language_probability": 0.0,
                "duration_seconds": duration_seconds,
                "segments": [],
                "model_loaded": True,
                "error": None,
            }

        # Select educational initial prompt in target script if language is specified
        initial_prompt = LANGUAGE_PROMPTS.get(target_lang)

        try:
            # Optimal faster-whisper decoding configuration:
            # - beam_size: 5 for robust hypothesis search without hallucination
            # - vad_filter: Silero VAD prevents decoding background room noise / breathing
            # - condition_on_previous_text=False: avoids error cascading across segments
            # - Kannada ('kn'): apply repetition penalty & n-gram constraint to avoid subword token looping
            # - English ('en') & Hindi ('hi'): preserve natural repetition without artificial bans
            rep_pen = 1.15 if target_lang == "kn" else 1.0
            ngram_size = 3 if target_lang == "kn" else 0

            segments_gen, info = self.model.transcribe(
                audio_array,
                language=target_lang,
                task="transcribe",
                initial_prompt=initial_prompt,
                condition_on_previous_text=False,
                beam_size=beam_size if beam_size is not None else 5,
                repetition_penalty=rep_pen,
                no_repeat_ngram_size=ngram_size,
                temperature=temperature,
                vad_filter=True,
                vad_parameters=dict(min_silence_duration_ms=400, speech_pad_ms=200),
                compression_ratio_threshold=2.4,
                no_speech_threshold=0.6,
                log_prob_threshold=-1.0,
            )

            segments_list: List[Dict[str, Any]] = []
            text_pieces: List[str] = []
            logprobs: List[float] = []
            no_speech_probs: List[float] = []

            # Hallucination filter for empty/silent trailing speech
            HALLUCINATIONS = {
                "thank you.", "thank you", "thank you very much.", "subtitles by",
                "subtitles by the amara.org community", "bye.", "bye", "you", "you.",
                "thank you for watching.", "thanks for watching."
            }

            for seg in segments_gen:
                clean_text = seg.text.strip()
                no_speech = float(seg.no_speech_prob) if hasattr(seg, "no_speech_prob") and seg.no_speech_prob is not None else 0.0
                avg_lp = float(seg.avg_logprob) if hasattr(seg, "avg_logprob") and seg.avg_logprob is not None else 0.0

                # Filter out pure silence hallucinations
                if clean_text.lower() in HALLUCINATIONS and (no_speech > 0.35 or avg_lp < -0.75):
                    continue

                if clean_text:
                    segments_list.append({
                        "start": round(float(seg.start), 2),
                        "end": round(float(seg.end), 2),
                        "text": clean_text,
                    })
                    text_pieces.append(clean_text)
                    if hasattr(seg, "avg_logprob") and seg.avg_logprob is not None:
                        logprobs.append(float(seg.avg_logprob))
                    if hasattr(seg, "no_speech_prob") and seg.no_speech_prob is not None:
                        no_speech_probs.append(float(seg.no_speech_prob))

            full_transcript = " ".join(text_pieces).strip()

            detected_language = info.language if info else (target_lang or "auto")
            detected_prob = round(float(info.language_probability), 4) if info and hasattr(info, "language_probability") else 1.0

            # If Auto-detect was used, cross-check unicode script to prevent misclassification
            # (e.g. Kannada misdetected as Punjabi or Telugu, or Hindi misdetected as Marathi)
            if not target_lang and full_transcript:
                if bool(re.search(r'[\u0C80-\u0CFF]', full_transcript)):
                    detected_language = "kn"
                elif bool(re.search(r'[\u0900-\u097F]', full_transcript)):
                    detected_language = "hi"
                elif bool(re.search(r'[a-zA-Z]', full_transcript)) and detected_language not in ["hi", "kn"]:
                    detected_language = "en"

            # If no speech was detected after VAD, return honest silence result
            if not full_transcript:
                return {
                    "valid_input": True,
                    "text": "",
                    "language": detected_language,
                    "language_probability": detected_prob,
                    "duration_seconds": duration_seconds,
                    "segments": [],
                    "model_loaded": True,
                    "quality_status": "silence",
                    "is_low_confidence": False,
                    "error": None,
                }

            # Determine quality status and confidence flag
            mean_logprob = float(np.mean(logprobs)) if logprobs else 0.0
            max_no_speech = max(no_speech_probs, default=0.0)

            is_low_confidence = False
            quality_status = "reliable"
            quality_error = None

            if detected_language == "kn":
                # Low-resource Dravidian language in Whisper pretraining corpus
                is_low_confidence = True
                quality_status = "low_confidence"
                quality_error = "Kannada recognition confidence is moderate in Whisper base/small models. Raw transcript preserved."
            elif mean_logprob < -1.1 or max_no_speech > 0.6:
                is_low_confidence = True
                quality_status = "low_confidence"
                quality_error = "Low recognition confidence. Audio may contain unclear speech or background noise."

            return {
                "valid_input": True,
                "text": full_transcript,
                "language": detected_language,
                "language_probability": detected_prob,
                "duration_seconds": duration_seconds,
                "segments": segments_list,
                "model_loaded": True,
                "quality_status": quality_status,
                "is_low_confidence": is_low_confidence,
                "error": quality_error,
            }

        except Exception as trans_err:
            logger.error(f"[WHISPER TRANSCRIBE ERROR] Transcription failed: {trans_err}")
            return {
                "valid_input": False,
                "text": "",
                "language": target_lang or "en",
                "language_probability": 0.0,
                "duration_seconds": duration_seconds,
                "segments": [],
                "model_loaded": True,
                "quality_status": "error",
                "is_low_confidence": True,
                "error": f"Transcription failed: {str(trans_err)}",
            }


# Singleton instance configured with model size (default 'small', overridable via WHISPER_MODEL_SIZE env var)
speech_transcriber = SpeechTranscriber(model_size=os.getenv("WHISPER_MODEL_SIZE", "small"))
