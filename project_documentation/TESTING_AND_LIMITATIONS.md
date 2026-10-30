# EduSense AI: Testing, Empirical Results, and Limitations
## Comprehensive Test Case Verification, Benchmark Evaluation, and Boundary Analysis

---

## 1. Test Environment & Execution Setup

All tests documented in this report were executed directly against the active codebase in the repository (`/Users/apple/Desktop/Edusense_AI`) using the designated local test harness.

* **Operating System**: macOS 14.x (Darwin Kernel, arm64 Apple Silicon)
* **Python Runtime**: Python 3.12.x (`backend/venv/bin/python`)
* **Test Runners**: `pytest 8.x`, custom Python integration scripts, and `TestClient` (FastAPI / Starlette)
* **Database Environment**: PostgreSQL 16.x on `localhost:5432` (`edusense_db`)
* **LiveKit Environment**: LiveKit Server v1.5+ on `localhost:7880`

---

## 2. Empirical Benchmark Evaluation (FERPlus vs. EmotiEffLib)

To establish the statistical validity of the facial emotion recognition pipeline, a benchmark comparison was conducted on the standardized FERPlus dataset (`eval_data/fer2013new.csv`) consisting of $1,708$ held-out validation samples and $1,708$ test samples.

### 2.1 Benchmark Comparison Table

| Metric | FERPlus ONNX (`emotion-ferplus.onnx`) | EmotiEffLib VGAF (`enet_b0_8_best_vgaf`) | Empirical Difference |
| :--- | :--- | :--- | :--- |
| **Test Accuracy** | **83.14%** ($0.83138$) | 58.02% ($0.58021$) | **+25.12% improvement** |
| **Balanced Accuracy** | **60.52%** ($0.60516$) | 57.72% ($0.57720$) | **+2.80% improvement** |
| **Macro F1-Score** | **0.6523** | 0.4476 | **+0.2047 improvement** |
| **Expected Calibration Error (ECE)** | **0.0197** ($1.97\%$) | 0.1011 ($10.11\%$) | **-8.14% lower error (superior calibration)** |
| **Optimal Softmax Temperature ($T$)** | **0.9922** | $1.0000$ (uncalibrated) | Derived via Nelder-Mead optimization on validation set |
| **Model Size on Disk** | 35.0 MB | ~18 MB | FERPlus includes optimized CNN weights |
| **Default Model Selection** | **Primary (Default)** | **Fallback Backend** | Selection justified by empirical accuracy advantage |

### 2.2 FERPlus Test Split Confusion Matrix ($8\times 8$)

The raw confusion matrix evaluated across the $1,708$ test samples is detailed below (Rows: Ground Truth, Columns: Model Predictions):

```
Classes: [0: neutral, 1: happiness, 2: surprise, 3: sadness, 4: anger, 5: disgust, 6: fear, 7: contempt]

          [neu]  [hap]  [sur]  [sad]  [ang]  [dis]  [fea]  [con]
[neu] (625) [ 578     14      5     26      2      0      0      0 ]
[hap] (441) [  14    421      6      0      0      0      0      0 ]
[sur] (222) [  18      6    193      1      1      0      3      0 ]
[sad] (199) [  85     11      2     96      4      0      1      0 ]
[ang] (157) [  25     12      5      2    109      2      2      0 ]
[dis]  (15) [   5      0      0      3      1      6      0      0 ]
[fea]  (37) [   8      1     11      1      0      0     16      0 ]
[con]  (12) [   8      0      0      2      0      1      0      1 ]
```

### 2.3 Detailed Class-by-Class Classification Metrics (FERPlus ONNX)

| Target Emotion | Precision | Recall | F1-Score | Support (Ground Truth Count) |
| :--- | :--- | :--- | :--- | :--- |
| **neutral** | $0.7800$ | $0.9248$ | **$0.8463$** | 625 |
| **happiness** | $0.9054$ | $0.9546$ | **$0.9294$** | 441 |
| **surprise** | $0.8694$ | $0.8694$ | **$0.8694$** | 222 |
| **sadness** | $0.7328$ | $0.4824$ | **$0.5818$** | 199 |
| **anger** | $0.9316$ | $0.6943$ | **$0.7956$** | 157 |
| **disgust** | $0.6667$ | $0.4000$ | **$0.5000$** | 15 |
| **fear** | $0.7273$ | $0.4324$ | **$0.5424$** | 37 |
| **contempt** | $1.0000$ | $0.0833$ | **$0.1538$** | 12 |
| **Macro Average** | **$0.8266$** | **$0.6052$** | **$0.6523$** | **1708** |
| **Weighted Average** | **$0.8318$** | **$0.8314$** | **$0.8208$** | **1708** |

*Analysis*: Happiness ($F_1 = 0.9294$), Surprise ($F_1 = 0.8694$), and Neutral ($F_1 = 0.8463$) demonstrate exceptional classification reliability. Sadness exhibits modest recall ($0.4824$) with misclassifications primarily projecting into Neutral ($85$ instances), reflecting subtle classroom resting facial geometry. Under-represented classes like Contempt ($12$ samples) show low recall ($0.0833$), directly justifying EduSense AI's policy of mapping out-of-set predictions to `"uncertain"`.

---

## 3. Comprehensive Test Case Execution Matrix

The following table records the execution status and observations across the platform's test suites.

| Test ID | Subsystem / Feature | Test Input / Preconditions | Expected Output | Actual Observed Result | Status | Remarks & Source File |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-01** | Backend Health Check | `GET /api/health` with active PostgreSQL DB | HTTP 200 `{"status": "healthy", "database": "connected"}` | HTTP 200 `{"status": "healthy", "database": "connected"}` | **PASSED** | Verified via `app/api/health.py` |
| **TC-02** | Teacher Registration | `POST /api/auth/register/teacher` with valid employee ID | HTTP 201 Created with `TeacherProfile` entry | User and profile persisted with hashed bcrypt password | **PASSED** | Verified via `app/api/auth.py` |
| **TC-03** | Student Registration | `POST /api/auth/register/student` with valid USN | HTTP 201 Created with `StudentProfile` entry | User and profile persisted in PostgreSQL | **PASSED** | Verified via `app/api/auth.py` |
| **TC-04** | Duplicate Email Rejection | Attempt to register existing email | HTTP 400 Bad Request `"email already exists"` | HTTP 400 returned with explicit detail message | **PASSED** | Verified uniqueness constraint |
| **TC-05** | JWT Authentication | `POST /api/auth/login` with correct password | HTTP 200 with HS256 JWT bearer token | Token generated with `sub: uuid` and `role` claim | **PASSED** | Verified via `app/core/security.py` |
| **TC-06** | Invalid Password Rejection | `POST /api/auth/login` with incorrect password | HTTP 401 Unauthorized `"Incorrect email or password"` | HTTP 401 returned | **PASSED** | Verified auth rejection |
| **TC-07** | Classroom Creation | `POST /api/classrooms/` by Teacher | Classroom record created with unique LiveKit room name | LiveKit room name generated (`classroom_{uuid}`) | **PASSED** | Verified via `app/api/classrooms.py` |
| **TC-08** | Student Classroom Auth Guard | Student attempts to create classroom | HTTP 403 Forbidden | HTTP 403 returned via `require_role([TEACHER])` | **PASSED** | Role-based guard enforced |
| **TC-09** | Session Lifecycle: Start | `POST /api/sessions/{id}/start` by Teacher | Status transitions `SCHEDULED` $\to$ `ACTIVE`, `actual_start_time` set | Status updated in DB; active LiveKit room configured | **PASSED** | Verified in `test_class_session_lifecycle.py` |
| **TC-10** | Session Lifecycle: End | `POST /api/sessions/{id}/end` by Teacher | Status transitions `ACTIVE` $\to$ `COMPLETED`, participants marked left | `actual_end_time` logged; all `left_at` timestamps set | **PASSED** | Verified in `test_class_session_lifecycle.py` |
| **TC-11** | LiveKit Token Generation | `POST /api/classrooms/{c_id}/sessions/{s_id}/join` | Token with scoped VideoGrants returned | Token decoded; teacher granted `room_admin=True` | **PASSED** | Verified in `test_class_session_lifecycle.py` |
| **TC-12** | Face Detection: Single Face | Synthetic image with exactly one frontal face | SCRFD detects 1 face, bounding box extracted | Exactly 1 face localized with 5 landmarks | **PASSED** | `test_facial_pipeline_comprehensive.py` |
| **TC-13** | Face Detection: Zero Faces | Blank/uniform gray frame | Rejected with `message: "Position your face..."` | `num_faces=0, passed=False` returned | **PASSED** | `test_facial_pipeline_comprehensive.py` |
| **TC-14** | Face Detection: Multi-Face | Frame with two prominent synthetic faces | Rejected with `message: "Only one face..."` | `num_faces=2, passed=False` returned | **PASSED** | `test_facial_pipeline_comprehensive.py` |
| **TC-15** | Quality Gating: Blur Check | Image blurred with Gaussian blur ($31\times 31$) | Laplacian variance $< 30.0$; rejected | Laplacian variance $= 6.42 < 30.0$; rejected | **PASSED** | `test_facial_pipeline_comprehensive.py` |
| **TC-16** | Quality Gating: Low Light | Image with average brightness $< 40$ | Rejected with `"Too dark. Please increase light."` | Brightness $= 18.2$; rejected | **PASSED** | `test_facial_pipeline_comprehensive.py` |
| **TC-17** | 5-Sample Consistency Check | 5 embeddings with pairwise similarity $\ge 0.40$ | Consistency check passes, mean vector computed | Average consistency $= 0.8842 \ge 0.40$; saved to DB | **PASSED** | `test_phase3b_attendance.py` |
| **TC-18** | Inconsistent Face Rejection | 5 random orthogonal vectors (similarity $< 0.40$) | HTTP 400 Bad Request `"Inconsistent face samples"` | Rejected with HTTP 400 | **PASSED** | Verified consistency threshold |
| **TC-19** | Attendance: Unenrolled Student | Attendance verification for student with no face DB record | `verified=False, reason="NOT_ENROLLED"` | Correctly returns `NOT_ENROLLED`, status `UNVERIFIED` | **PASSED** | `test_phase3b_attendance.py` |
| **TC-20** | Attendance: Impostor Rejection | Query face similarity $< 0.50$ vs. enrolled student | `matched=False, reason="FACE_MISMATCH"` | `matched=False, similarity=0.124 < 0.50` | **PASSED** | `test_phase3b_attendance.py` |
| **TC-21** | Attendance: Match Sample 1 | Query face similarity $\ge 0.50$ | `matched=True, verification_count=1, status='UNVERIFIED'` | `verification_count=1`, status remains `UNVERIFIED` | **PASSED** | `test_phase3b_attendance.py` |
| **TC-22** | Attendance: Temporal Confirmation | 3 consecutive matching query frames | Status transitions `UNVERIFIED` $\to$ `PRESENT` | On 3rd match, status updated to `PRESENT` | **PASSED** | `test_phase3b_attendance.py` |
| **TC-23** | Attendance: Late Threshold | Verified match occurring $>15$ mins after session start | Status set to `LATE` | Status updated to `LATE` | **PASSED** | `test_phase3b_attendance.py` |
| **TC-24** | Teacher Manual Override | Teacher updates student record to `EXCUSED` | `is_manually_corrected=True`, audit logged | `AuditLog` entry created; record updated | **PASSED** | `test_teacher_attendance_records_flow.py` |
| **TC-25** | FER: Model Initialization | FacialEmotionAnalyzer loads FERPlus ONNX | `emotion_model_loaded=True, backend='ferplus'` | Confirmed loaded from `ai/models/emotion-ferplus.onnx` | **PASSED** | `test_facial_pipeline_comprehensive.py` |
| **TC-26** | FER: EmotiEffLib Fallback | Force `backend='emotiefflib'` | EfficientNet loaded or falls back to FERPlus | Graceful fallback verified without crash | **PASSED** | `test_facial_pipeline_comprehensive.py` |
| **TC-27** | FER: Out-of-Set Class Mapping | Input classified as `Surprise` or `Contempt` | `dominant_emotion = 'uncertain'`, raw preserved | Mapped to `uncertain`, `raw_dominant` retained | **PASSED** | `test_facial_pipeline_comprehensive.py` |
| **TC-28** | FER: Rolling Temporal Smoothing | Jittering probability sequence across 5 frames | Output probabilities smoothed via exponential decay | Inter-frame jitter smoothed without sudden jumps | **PASSED** | `test_facial_pipeline_comprehensive.py` |
| **TC-29** | Head Pose: Looking Away | Face offset $cx > 0.45 \cdot W$ (Yaw $> 30^\circ$) | `is_distracted=True, distraction_type='looking_away'` | Distraction flagged and categorized | **PASSED** | `test_facial_pipeline_comprehensive.py` |
| **TC-30** | Head Pose: Frontal Attention | Face centered ($cx \approx W/2, cy \approx H/2$) | `attentiveness_score > 0.85, is_distracted=False` | Attentiveness $= 0.94$, `is_distracted=False` | **PASSED** | `test_facial_pipeline_comprehensive.py` |
| **TC-31** | Whisper: English Transcription | Input: `en_good_morning.wav` | Output contains `"good morning"` | Accurately transcribed `"Good morning"` | **PASSED** | `test_transcription_api.py` |
| **TC-32** | Whisper: Hindi Audio | Input: `hi_1.wav` | Output in Devanagari script: `"नमस्ते"` | Native script transcript generated | **PASSED** | `test_multilingual_speech_verification.py` |
| **TC-33** | Whisper: Kannada Audio | Input: `kn_1.mp3` | Output in Kannada script with repetition control | Correctly decoded without subword token looping | **PASSED** | `test_multilingual_speech_verification.py` |
| **TC-34** | Whisper: Silence Audio | Input: `silence_2s.wav` (RMS $< 0.003$) | `valid_input=True, text='', quality_status='silence'` | Pure silence recognized; no hallucinations | **PASSED** | `test_speech_pipeline_verification.py` |
| **TC-35** | Sentiment: Positive Classroom Text | Input: `"The explanation was clear and helpful"` | `sentiment_label='positive', compound > +0.50` | `compound = 0.68, label = 'positive'` | **PASSED** | `test_analytics.py` |
| **TC-36** | Sentiment: Negation Inversion | Input: `"The concept was not clear"` | Inverts positive valence of `"clear"` to negative | `compound = -0.38, label = 'negative'` | **PASSED** | `test_analytics.py` |
| **TC-37** | Sentiment: Confusion Intent | Input: `"I am confused about this topic"` | `is_confusion=True, sentiment_label='negative'` | `is_confusion=True, label='negative'` | **PASSED** | `test_analytics.py` |
| **TC-38** | Sentiment: Question Detection | Input: `"What is computational complexity?"` | `is_question=True` | `is_question=True` | **PASSED** | `test_analytics.py` |
| **TC-39** | Sentiment: Kannada Input | Input: `"ನನಗೆ ಅರ್ಥವಾಗಲಿಲ್ಲ"` | `sentiment_label='unsupported_language'` | Handled honestly without fabricated sentiment | **PASSED** | `test_multilingual_speech_verification.py` |
| **TC-40** | Multimodal Late Fusion: Bimodal | Face $P(\text{happy})=0.8$, Speech $P(\text{happy})=0.7$ | Fused $P(\text{happy}) \approx 0.765$, `conflict=False` | Dominant emotion `'happy'`, `modality='bimodal'` | **PASSED** | `ai/multimodal_fusion.py` |
| **TC-41** | Multimodal Fusion: Conflict | Face $P(\text{happy})=0.85$, Speech $P(\text{angry})=0.80$ | `conflict_detected=True`, conflict reason logged | Conflict detected and descriptive warning recorded | **PASSED** | `ai/multimodal_fusion.py` |
| **TC-42** | Engagement Composite Index | Attentiveness $80$, Participation $100$, Sentiment $50$ | Weighted average: $0.6(80)+0.25(100)+0.15(50) = 80.5\%$ | Composite score $= 80.5\%$ | **PASSED** | `app/services/analytics_service.py` |
| **TC-43** | Engagement: Dynamic Renormalization | Sentiment missing (None); Attentiveness $90$, Part $80$ | Normalized over $w=0.85$: $\frac{0.6(90)+0.25(80)}{0.85} = 87.06\%$ | Composite score $= 87.06\%$ (no zero penalty) | **PASSED** | `app/services/analytics_service.py` |
| **TC-44** | 5-Minute Window Aggregation | Multiple samples within 5-min interval | Computes window-wide expression distribution | Window distribution aggregated accurately | **PASSED** | `test_facial_pipeline_comprehensive.py` |
| **TC-45** | Unit Test Assertion Audit | Empty input to `TextSentimentAnalyzer` | Score returned is `None` | `assert None == 0.0` failed in test script | **KNOWN ANOMALY** | Service returns `None` for missing data |

---

## 4. Technical Limitations & Failure Mode Analysis

### 4.1 Facial Biometric & Vision Boundaries
1. **Extreme Angular Yaw and Occlusion**:
   * SCRFD face detection remains reliable up to approximately $\pm 35^\circ$ yaw. When a student turns their head beyond $45^\circ$ or obscures their face with their hands, face detection returns zero faces, correctly triggering a `no_face_detected` distraction event rather than guessing.
2. **Illumination Extremes**:
   * Classrooms with strong backlight (e.g. students sitting directly in front of bright windows) cause facial underexposure (pixel brightness $< 40$). The quality gate deliberately rejects these frames to prevent inaccurate biometric matches.
3. **Motion Blur from Rapid Movement**:
   * Low-cost 15–30 FPS webcams suffer from severe motion blur during rapid head movement, reducing Laplacian variance below $30.0$. The temporal confirmation algorithm mitigates this by requiring 3 high-quality frames across time.

### 4.2 Speech Recognition & Regional Dialects
1. **Low-Resource Dravidian Language Challenges (Kannada)**:
   * Whisper was pretrained on an imbalanced corpus where English accounts for the vast majority of training hours. While English achieves near-perfect transcription on clear audio, Kannada speech yields higher word error rates, particularly for fast colloquial speech. EduSense AI transparently flags Kannada transcripts with `is_low_confidence = True` rather than concealing uncertainty.
2. **Overlapping Speech & Cross-Talk**:
   * Whisper is a sequence-to-sequence model designed for single-speaker audio chunks. When multiple classroom participants speak simultaneously over the same microphone, transcription quality degrades into word interleaving.

### 4.3 Behavioral Proxy Boundaries (Ethical & Psychological)
1. **Facial Expression vs. Cognitive State**:
   * A neutral facial expression does not necessarily indicate boredom; deep intellectual concentration often manifests as an unsmiling, still face. EduSense AI documents observable facial Action Units and avoids making definitive claims about true cognitive understanding.
2. **Text Sentiment Lexicon Coverage**:
   * The rule-based sentiment analyzer is designed for educational chat interactions (questions, confusion markers, positive feedback). It does not detect domain-specific sarcasm, subtle literary irony, or non-English slang.

### 4.4 Hardware & Scalability Boundaries
1. **Concurrent Inference Throughput**:
   * In the local workstation prototype, ONNX Runtime CPU execution requires $\approx 15$ ms per face and faster-whisper requires $\approx 450$ ms per 4-second audio chunk. While sufficient for 10–20 concurrent students sampled at 4-second intervals, scaling to hundreds of students requires offloading inference to asynchronous GPU worker queues (e.g. Celery / Redis + Triton Inference Server).
