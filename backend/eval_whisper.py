import os
import sys
import re
import time

backend_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(backend_dir)
if project_root not in sys.path:
    sys.path.insert(0, project_root)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from ai.speech_transcriber import speech_transcriber, SpeechTranscriber

def calculate_wer(reference: str, hypothesis: str) -> float:
    ref_clean = re.sub(r"[^\w\s]", "", reference).lower().strip().split()
    hyp_clean = re.sub(r"[^\w\s]", "", hypothesis).lower().strip().split()
    if not ref_clean:
        return 0.0 if not hyp_clean else 1.0
    d = [[0] * (len(hyp_clean) + 1) for _ in range(len(ref_clean) + 1)]
    for i in range(len(ref_clean) + 1):
        d[i][0] = i
    for j in range(len(hyp_clean) + 1):
        d[0][j] = j
    for i in range(1, len(ref_clean) + 1):
        for j in range(1, len(hyp_clean) + 1):
            if ref_clean[i - 1] == hyp_clean[j - 1]:
                d[i][j] = d[i - 1][j - 1]
            else:
                d[i][j] = 1 + min(d[i - 1][j], d[i][j - 1], d[i - 1][j - 1])
    return round(d[len(ref_clean)][len(hyp_clean)] / len(ref_clean), 3)

def evaluate_transcriber(transcriber, name="Whisper Model"):
    print(f"\n=======================================================")
    print(f"EVALUATING {name}: model_size='{transcriber.model_size}'")
    print(f"=======================================================")

    t0 = time.time()

    # 1. English
    print("\n--- ENGLISH SAMPLES ---")
    en_samples = [
        ("en_good_morning.wav", "Good morning"),
        ("en_welcome.wav", "Good morning class welcome to today session"),
        ("en_mic.wav", "Can you please unmute your microphone"),
        ("en_ai.wav", "Let us begin the discussion on artificial intelligence"),
        ("en_thank_you.wav", "Thank you teacher"),
    ]
    en_wers = []
    for f_name, ref in en_samples:
        path = os.path.join(backend_dir, "test_audio", f_name)
        with open(path, "rb") as f:
            data = f.read()
        res = transcriber.transcribe(data, language="en")
        wer = calculate_wer(ref, res["text"])
        en_wers.append(wer)
        print(f"Ref:  '{ref}'")
        print(f"Pred: '{res['text']}' (WER: {wer*100:.1f}%)")
    print(f"-> Mean English WER: {sum(en_wers)/len(en_wers)*100:.1f}%")

    # 2. Hindi
    print("\n--- HINDI SAMPLES ---")
    hi_samples = [
        ("hi_1.wav", "नमस्ते आप कैसे हैं"),
        ("hi_2.wav", "आज हम गणित और विज्ञान पढ़ेंगे"),
        ("hi_3.wav", "क्या आप इस सवाल का जवाब दे सकते हैं"),
        ("hi_4.wav", "कृपया अगला पाठ शुरू कीजिए"),
        ("hi_5.wav", "मुझे यह अध्याय बहुत अच्छा लगा"),
    ]
    hi_wers = []
    for f_name, ref in hi_samples:
        path = os.path.join(backend_dir, "test_audio", f_name)
        with open(path, "rb") as f:
            data = f.read()
        res = transcriber.transcribe(data, language="hi")
        wer = calculate_wer(ref, res["text"])
        hi_wers.append(wer)
        print(f"Ref:  '{ref}'")
        print(f"Pred: '{res['text']}' (WER: {wer*100:.1f}%)")
    print(f"-> Mean Hindi WER: {sum(hi_wers)/len(hi_wers)*100:.1f}%")

    # 3. Kannada
    print("\n--- KANNADA SAMPLES ---")
    kn_samples = [
        ("kn_1.mp3", "ಶುಭೋದಯ ನೀವು ಹೇಗಿದ್ದೀರಿ"),
        ("kn_2.mp3", "ಇವತ್ತು ನಾವು ಕಂಪ್ಯೂಟರ್ ವಿಜ್ಞಾನ ಕಲಿಯುತ್ತೇವೆ"),
        ("kn_3.mp3", "ದಯವಿಟ್ಟು ಮುಂದಿನ ಪ್ರಶ್ನೆಗೆ ಉತ್ತರಿಸಿ"),
        ("kn_4.mp3", "ನನಗೆ ಈ ಪಾಠ ಚೆನ್ನಾಗಿ ಅರ್ಥವಾಯಿತು"),
        ("kn_5.mp3", "ಧನ್ಯವಾದಗಳು ಗುರುಗಳೇ"),
    ]
    kn_wers = []
    for f_name, ref in kn_samples:
        path = os.path.join(backend_dir, "test_audio", f_name)
        with open(path, "rb") as f:
            data = f.read()
        res = transcriber.transcribe(data, language="kn")
        wer = calculate_wer(ref, res["text"])
        kn_wers.append(wer)
        print(f"Ref:  '{ref}'")
        print(f"Pred: '{res['text']}' (WER: {wer*100:.1f}%)")
    print(f"-> Mean Kannada WER: {sum(kn_wers)/len(kn_wers)*100:.1f}%")

    elapsed = time.time() - t0
    print(f"\nTotal Evaluation Time: {elapsed:.2f}s")
    return {
        "en_wer": sum(en_wers)/len(en_wers),
        "hi_wer": sum(hi_wers)/len(hi_wers),
        "kn_wer": sum(kn_wers)/len(kn_wers),
        "time": elapsed,
    }

if __name__ == "__main__":
    base_res = evaluate_transcriber(speech_transcriber, name="Current Base Transcriber (base)")

    print("\nLoading and evaluating 'small' model...")
    small_transcriber = SpeechTranscriber(model_size="small")
    small_res = evaluate_transcriber(small_transcriber, name="Upgraded Small Transcriber (small)")

    print("\n=======================================================")
    print("COMPARISON SUMMARY: BASE vs SMALL")
    print("=======================================================")
    print(f"English WER:  Base = {base_res['en_wer']*100:.1f}% | Small = {small_res['en_wer']*100:.1f}%")
    print(f"Hindi WER:    Base = {base_res['hi_wer']*100:.1f}% | Small = {small_res['hi_wer']*100:.1f}%")
    print(f"Kannada WER:  Base = {base_res['kn_wer']*100:.1f}% | Small = {small_res['kn_wer']*100:.1f}%")
    print(f"Total Time:   Base = {base_res['time']:.1f}s | Small = {small_res['time']:.1f}s")
