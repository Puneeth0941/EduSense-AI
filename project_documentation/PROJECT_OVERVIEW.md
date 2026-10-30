# EduSense AI: Smart Classroom Attendance and Student Engagement Analytics
## Project Overview & Executive Summary

---

### 1. Project Title & Academic Metadata

* **Project Title**: EduSense AI: Smart Classroom Attendance and Student Engagement Analytics
* **Degree**: Bachelor of Engineering (B.E.) in Artificial Intelligence and Machine Learning
* **Academic Level**: Final Year Major Project (Capstone Project)
* **Domain**: Computer Vision, Biometrics, Natural Language Processing, Speech Recognition, Multimodal Learning Analytics, and Real-Time WebRTC Systems
* **Repository Path**: `/Users/apple/Desktop/Edusense_AI`
* **Application Status**: Fully functional academic prototype with genuine deep learning inference (no simulation or mock engines)

---

### 2. Abstract

The transition toward remote, hybrid, and digitally augmented education has illuminated critical limitations in traditional video conferencing platforms such as Zoom and Google Meet. Conventional tools treat participants as passive video streams, requiring educators to manually record attendance, decipher disengagement through tiny video tiles, and overlook nuanced classroom communication dynamics. 

**EduSense AI** addresses these challenges by presenting a decoupled, privacy-preserving, multimodal smart classroom platform. It combines real-time WebRTC audio/video communication via LiveKit with asynchronous, out-of-band artificial intelligence pipelines. The system features:

1. **Biometric Face Enrollment and Verification**: Built on the SCRFD face detector and ArcFace MobileFaceNet ($512$-dimensional L2-normalized embeddings via InsightFace `buffalo_sc`), enforcing strict face quality gating (bounding box $\ge 100\times 100$ px, Laplacian blur variance $\ge 30.0$, brightness bounds $40 \le \mu \le 235$) and multi-sample consistency verification ($\ge 0.40$).
2. **Automated Classroom Attendance**: Operates continuous verification with a cosine similarity threshold of $0.50$ and a three-sample temporal confirmation algorithm (`CONFIRMATION_SAMPLES_REQUIRED = 3`) to reliably transition students from `UNVERIFIED` to `PRESENT` or `LATE` (based on a $15$-minute cutoff), recording true presence duration and preventing duplicate entries.
3. **Facial Expression and Head-Pose Attentiveness Analysis**: Powered by FERPlus ONNX (`emotion-ferplus.onnx`, $8$-class classification, temperature-calibrated softmax at $T = 0.9922$, $83.14\%$ benchmark accuracy on FER2013 test set) with fallback to EmotiEffLib (`enet_b0_8_best_vgaf`), rolling 5-frame exponential temporal smoothing ($\alpha = 0.85$), and geometric head pose estimation (pitch, yaw, roll) with attentiveness scoring.
4. **Multilingual Speech-to-Text Transcription**: Implemented using `faster-whisper` (CTranslate2 `small` model with `int8` quantization), supporting English (`en`), Kannada (`kn`), and Hindi (`hi`) with Silero Voice Activity Detection (VAD) filtering, native script conditioning prompts, and subword repetition constraints.
5. **Text Sentiment & Educational Intent Analysis**: Utilizes a rule-based valence lexicon with negation scaling to quantify student text sentiment, identifying question intent and confusion markers while gracefully declaring non-English scripts as unsupported for rule-based sentiment.
6. **Multimodal Late Fusion & Composite Engagement Scoring**: Integrates visual and speech emotion distributions using mathematically principled weighted late fusion ($P_{final} = 0.65 P_{face} + 0.35 P_{speech}$) with conflicting-signal detection, and computes a composite engagement score ($60\%$ attentiveness, $25\%$ participation, $15\%$ sentiment) with dynamic weight re-normalization for missing modalities.

All operations persist to a PostgreSQL relational database via SQLAlchemy 2.0 and Alembic, presented through an interactive React 19 + TypeScript + TailwindCSS dashboard tailored for both students and instructors.

---

### 3. Problem Statement

Modern online education suffers from fundamental operational and pedagogical bottlenecks:

1. **Manual and Proxy-Vulnerable Attendance**: Roll calls consume 10–15% of instructional lecture time and are vulnerable to buddy punching, unauthorized credential sharing, and ghost attendance where students log into a call and walk away.
2. **Pedagogical Invisibility ("The Black Screen Problem")**: Teachers lecture to grids of silent, static video feeds. Subconscious non-verbal cues—such as widespread student confusion, micro-expressions of disengagement, or looking away from the screen—are lost, leading to poor learning intervention timing.
3. **Linguistic and Multimodal Siloing**: Classroom discourse in multilingual institutions (such as Indian engineering colleges where English, Hindi, and Kannada intersect) lacks real-time automated transcription and synchronized sentiment indexing.
4. **Inference Latency vs. Real-Time Transport Contention**: Direct integration of heavy deep learning pipelines into real-time WebRTC media loops causes frame drops, audio crackling, and unmanageable browser crashes.

---

### 4. Proposed Solution & Key Objectives

EduSense AI resolves these issues through an asynchronous, modular architecture designed around the following concrete objectives:

* **Objective 1: Non-Intrusive Biometric Attendance**: Create a secure 5-pose face enrollment workflow and a real-time temporal verification mechanism that automatically marks attendance only when a student is physically present and verified across multiple frames.
* **Objective 2: Objective Attentiveness & Expression Tracking**: Continuously sample video feeds at safe 4-second intervals to calculate geometric head pose, detect distraction events (looking away, looking down, looking up), and compute calibrated facial expression distributions.
* **Objective 3: Real-Time Multilingual Transcription**: Provide out-of-band speech-to-text transcription with auto-language detection and native-script conditioning for English, Kannada, and Hindi.
* **Objective 4: Multi-Signal Engagement Analytics**: Aggregate attentiveness, participation frequency, and sentiment into a transparent composite engagement metric for educators, complete with 5-minute rolling window classroom summaries.
* **Objective 5: High-Concurrency Separation of Concerns**: Decouple real-time media streaming (LiveKit WebRTC SFU) from backend business logic (FastAPI) and AI inference (ONNX Runtime, CTranslate2), ensuring video calls remain smooth and resilient.

---

### 5. Proposed System vs. Existing Systems

| Dimension | Existing Video Conferencing (Zoom, Google Meet, MS Teams) | Legacy Biometric Systems (RFID, Fingerprint, Static Cameras) | EduSense AI (Proposed Academic Prototype) |
| :--- | :--- | :--- | :--- |
| **Attendance Verification** | Manual attendance lists; CSV log of join/leave times without biometric verification. | Physical hardware at classroom doors; single-instant verification; cannot track online presence. | **Continuous automated verification** via SCRFD face detection + ArcFace 512D embeddings + 3-sample temporal confirmation. |
| **Biometric Anti-Spoofing** | None. | Fingerprint spoofing / RFID card sharing. | Single-face constraint, Laplacian blur gating ($\ge 30.0$), brightness bounds, and geometric positioning feedback. |
| **Engagement Insights** | None; optional third-party plug-ins that track camera on/off or browser tab focus. | None. | **Geometric head-pose tracking** (pitch, yaw, roll), attentiveness score, distraction event logging, and FERPlus ONNX expression classification. |
| **Speech Transcription** | Cloud-based proprietary English captions (Zoom AI Companion, Google Meet Captions). | None. | **Local / Private Whisper inference** (`faster-whisper` int8) supporting English, Kannada, and Hindi with VAD filtering. |
| **Sentiment & Confusion Detection** | None. | None. | **Valence lexicon with question & confusion intent detection**, linked directly to student engagement subscores. |
| **Multimodal Signal Fusion** | Not supported. | Not supported. | **Weighted late fusion** ($65\%$ face, $35\%$ speech) with explicit discrepancy and conflict detection. |
| **Infrastructure Architecture** | Proprietary monolithic cloud infrastructure. | Isolated embedded hardware. | **Decoupled microservice architecture**: React 19 SPA, FastAPI REST backend, LiveKit WebRTC SFU, and PostgreSQL database. |
| **Privacy & Student Rights** | Cloud audio/video mining under corporate terms of service. | Proprietary vendor lock-in. | **Local biometric embedding storage**; raw webcam frames are never permanently saved; audit logs for manual teacher overrides. |

---

### 6. Target Users & Personas

1. **Classroom Instructors (Teachers / Professors)**:
   * Create classrooms and launch scheduled live sessions.
   * View live participant status and automated attendance rosters.
   * Inspect real-time classroom attentiveness distributions and 5-minute expression summaries.
   * Identify students exhibiting sustained confusion or distraction.
   * Manually adjust attendance records with mandatory audit justification.
2. **Students / Learners**:
   * Enroll their biometric profile through a guided 5-step face capture sequence.
   * Verify face matching against enrolled embeddings prior to joining sessions.
   * Join active classrooms with two-way WebRTC audio, video, and screen sharing.
   * Receive live feedback on their verified attendance status (`UNVERIFIED` $\to$ `PRESENT` / `LATE`).
   * View live closed captions and personal engagement analytics.
3. **Academic Administrators / Auditors**:
   * Review comprehensive session attendance summaries, participation records, and manual teacher audit logs.

---

### 7. Core Functional Requirements

* **FR-01 (Authentication & Profiles)**: Role-based registration and login for Teachers and Students using bcrypt password hashing and HS256 JWT access tokens.
* **FR-02 (Classroom & Session Lifecycle)**: CRUD management of classrooms and sessions (statuses: `SCHEDULED`, `ACTIVE`, `COMPLETED`, `CANCELLED`).
* **FR-03 (LiveKit WebRTC Integration)**: Generation of scoped LiveKit JWT access tokens with participant metadata, video grants, and automated room lifecycle management.
* **FR-04 (Guided Face Enrollment)**: Capture of 5 distinct face samples, Laplacian blur and exposure quality checks, pairwise cosine similarity consistency verification ($\ge 0.40$), and mean 512D embedding storage.
* **FR-05 (Automatic Attendance Verification)**: Periodic frame matching against enrolled profile ($\ge 0.50$ cosine similarity), temporal confirmation requirement (3 samples), late arrival threshold ($15$ minutes), and presence duration calculation.
* **FR-06 (Facial Emotion Recognition)**: Frame inference via FERPlus ONNX / EmotiEffLib, 8-class to 5-class mapping with uncertainty assignment, and rolling 5-frame exponential smoothing.
* **FR-07 (Head Pose & Attentiveness Estimation)**: Haar Cascade detection of frontal face and eyes, calculation of yaw, pitch, and roll, attentiveness scoring, and distraction event logging.
* **FR-08 (Speech Transcription)**: Ingestion of audio files or base64 chunks, resampling to 16 kHz mono float32, VAD filtering, and Whisper decoding for English, Kannada, and Hindi.
* **FR-09 (Text Sentiment & Intent Detection)**: Lexicon-based valence calculation with negation inversion, question classification, and confusion keyword indexing.
* **FR-10 (Analytics Aggregation & Reporting)**: Generation of student-level summaries, classroom-level 5-minute rolling window distributions, and persistent class session reports.

---

### 8. Core Non-Functional Requirements

* **NFR-01 (Inference Latency)**: Facial frame analysis latency $\le 150$ ms on modern CPU/MPS hardware; face verification comparison $\le 50$ ms.
* **NFR-02 (Zero Audio/Video Transport Degradation)**: Real-time WebRTC media transport via LiveKit must execute on separate worker threads/ports, isolated from compute-heavy AI inference loops.
* **NFR-03 (Data Integrity & Storage)**: All database transactions must enforce ACID guarantees via PostgreSQL 16 with UUID primary keys and foreign key cascade constraints.
* **NFR-04 (Privacy by Design)**: Raw video frames must not be permanently stored in the primary database; only extracted mathematical embeddings (512 floats) and aggregated numerical metrics are persisted.
* **NFR-05 (Robust Error Handling & Graceful Degradation)**: Missing audio or video tracks must not crash the application; models must fall back to structured uncertainty states (`uncertain`, `insufficient_data`) rather than fabricating predictions.

---

### 9. Assumptions and Constraints

1. **Hardware Constraints**:
   * The current academic prototype executes on local workstation hardware (macOS / Linux) utilizing CPU and Apple Silicon CoreML/MPS execution providers.
   * Client devices must feature a standard webcam (minimum $640\times 480$ resolution) and microphone.
2. **Environmental Assumptions**:
   * Ambient classroom lighting must be sufficient to satisfy the image brightness filter ($40 \le \mu \le 235$).
   * Webcam framing assumes a single primary learner positioned within $\pm 18\%$ of the optical center.
3. **Network Constraints**:
   * Client-to-server bandwidth must support standard WebSockets for LiveKit signaling and HTTPS REST calls.
4. **Epistemic and Pedagogical Scope**:
   * The application is an **academic research prototype**. Observable facial expressions and text sentiment are behavioral proxies and must never be treated as definitive indicators of internal emotional states or intellectual competence.

---

### 10. Summary of Implementation Status

| Module / Subsystem | Primary Implementation Files | Actual Technology / Checkpoint | Status |
| :--- | :--- | :--- | :--- |
| **Authentication & RBAC** | `backend/app/api/auth.py`, `backend/app/core/security.py` | FastAPI, Passlib (bcrypt), PyJWT | **Implemented & Verified** |
| **Classrooms & Sessions** | `backend/app/api/classrooms.py`, `backend/app/api/sessions.py` | SQLAlchemy 2.0, PostgreSQL 16 | **Implemented & Verified** |
| **WebRTC Media Transport** | `backend/app/services/livekit_service.py`, `frontend/src/pages/ClassroomPage.tsx` | LiveKit Server, `livekit-client`, `@livekit/components-react` | **Implemented & Verified** |
| **Face Detection & Recognition** | `backend/app/services/face_service.py`, `backend/app/api/face.py` | InsightFace `buffalo_sc` (SCRFD + ArcFace MobileFaceNet 512D) | **Implemented & Verified** |
| **Biometric Enrollment (5 poses)**| `frontend/src/pages/FaceEnrollmentPage.tsx`, `backend/app/api/face.py` | OpenCV, NumPy, PostgreSQL `face_embeddings` | **Implemented & Verified** |
| **Automated Face Attendance** | `backend/app/api/attendance.py`, `backend/app/services/face_service.py` | Cosine similarity ($\ge 0.50$), 3-sample temporal confirmation | **Implemented & Verified** |
| **Facial Emotion Recognition** | `ai/facial_emotion.py`, `ai/models/emotion-ferplus.onnx` | FERPlus ONNX (8 classes, $T=0.9922$) + EmotiEffLib fallback | **Implemented & Verified** |
| **Head Pose & Attentiveness** | `ai/facial_emotion.py` | OpenCV Haar Cascades, geometric angle projection, attentiveness score | **Implemented & Verified** |
| **Speech-to-Text Transcription**| `ai/speech_transcriber.py`, `backend/app/api/transcription.py` | `faster-whisper` (CTranslate2 `small`, int8, Silero VAD) | **Implemented & Verified** |
| **Multilingual Support** | `ai/speech_transcriber.py` | English, Kannada (`kn`), Hindi (`hi`) native prompts & constraints | **Implemented & Verified** |
| **Text Sentiment & Intent** | `ai/sentiment_analyzer.py` | Valence lexicon, negation handling, question & confusion detection | **Implemented & Verified** |
| **Multimodal Late Fusion** | `ai/multimodal_fusion.py` | Weighted late fusion ($0.65$ face, $0.35$ speech) + conflict detection | **Implemented & Verified** |
| **Teacher & Student Dashboards** | `frontend/src/pages/DashboardPage.tsx`, `frontend/src/components/*` | React 19, TailwindCSS v4, Lucide Icons | **Implemented & Verified** |
| **Acoustic Vocal Emotion (wav2vec 2.0)** | Conceptualized in docs / planning | Pretrained wav2vec 2.0 fine-tuned audio checkpoint | **Planned (Future Scope)** |
| **Transformer Text Sentiment (BERT)**| Conceptualized in planning | Fine-tuned BERT / RoBERTa classifier | **Planned (Future Scope)** |
