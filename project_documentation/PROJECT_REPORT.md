# EduSense AI: Smart Classroom Attendance and Student Engagement Analytics
## Major Project Report
### Submitted in partial fulfillment of the requirements for the degree of Bachelor of Engineering in Artificial Intelligence and Machine Learning

---

## Executive Summary & Declaration

**Project Title**: EduSense AI: Smart Classroom Attendance and Student Engagement Analytics  
**Department**: Department of Artificial Intelligence and Machine Learning  
**Academic Year**: 2025–2026  
**Institution**: [University / Institution Name Placeholder]  
**Repository Working Directory**: `/Users/apple/Desktop/Edusense_AI`  

---

## Table of Contents

1. [Chapter 1: Introduction](#chapter-1-introduction)
2. [Chapter 2: Literature Review & Related Work](#chapter-2-literature-review--related-work)
3. [Chapter 3: System Requirement Analysis](#chapter-3-system-requirement-analysis)
4. [Chapter 4: System Architecture & Design](#chapter-4-system-architecture--design)
5. [Chapter 5: Artificial Intelligence Models & Algorithms](#chapter-5-artificial-intelligence-models--algorithms)
6. [Chapter 6: System Implementation](#chapter-6-system-implementation)
7. [Chapter 7: Experimental Results & Testing](#chapter-7-experimental-results--testing)
8. [Chapter 8: Conclusion & Future Scope](#chapter-8-conclusion--future-scope)
9. [References](#references)
10. [Appendices](#appendices)

---

# Chapter 1: Introduction

### 1.1 Background
The digital transformation of education has accelerated the adoption of synchronous video conferencing environments across primary, secondary, and tertiary academic institutions. Systems such as Zoom, Google Meet, and Microsoft Teams provide fundamental audio-visual channels that connect distributed learners. However, these systems were primarily engineered for corporate business meetings where participants are assumed to be self-regulating, autonomous contributors. In academic environments, the operational and pedagogical needs are fundamentally different: instructors are responsible for student attendance verification, attention monitoring, timely intervention for struggling students, and assessing classroom engagement.

### 1.2 Motivation
In conventional remote classrooms, instructors face the notorious **"Black Screen Problem"** or a wall of tiny, silent video tiles. Educators cannot easily discern whether students are engaged, confused, distracted, or even physically present at their terminals. Furthermore, traditional roll-call procedures consume between 10% and 15% of active lecture time and remain vulnerable to proxy sign-ins, unverified credentials, and ghost attendance (where a student logs in and leaves the room). An automated, privacy-conscious, multimodal analytics platform capable of verifying student identity without intrusive hardware, transcribing multilingual discourse, and extracting observable engagement indicators provides vital support to educators.

### 1.3 Problem Statement
To design, implement, and evaluate an automated, smart classroom attendance and student engagement analytics platform that:
1. Performs biometric student face enrollment and automated presence verification without dedicated biometric hardware.
2. Continuously assesses visual attentiveness, head pose, and observable facial expression patterns during live sessions without degrading audio/video streaming quality.
3. Transcribes multilingual classroom speech (English, Kannada, Hindi) into synchronized text and closed captions.
4. Quantifies text sentiment and educational confusion cues from chat messages and transcripts.
5. Computes a transparent, composite engagement score to provide educators with actionable real-time and post-session pedagogical insights.

### 1.4 Objectives
* **Objective 1**: Develop a decoupled full-stack web architecture utilizing React 19, FastAPI, PostgreSQL, and LiveKit WebRTC.
* **Objective 2**: Implement deep-learning-based face detection (SCRFD) and facial embedding generation (ArcFace MobileFaceNet 512D) with strict image quality gating (Laplacian blur and illumination checks).
* **Objective 3**: Implement an automated classroom attendance pipeline using cosine similarity matching and a 3-sample temporal confirmation algorithm.
* **Objective 4**: Deploy a temperature-calibrated facial emotion recognition engine (FERPlus ONNX) with fallback capabilities and rolling temporal smoothing.
* **Objective 5**: Integrate speech-to-text transcription via `faster-whisper` with VAD filtering, native script conditioning, and subword repetition penalties for regional Indian languages.
* **Objective 6**: Design and evaluate a multimodal late fusion model and composite engagement scoring algorithm.

### 1.5 Scope of the Project
EduSense AI is conceived as an **academic prototype** and research demonstrator. The system operates on commodity client webcams and microphones without specialized edge computing hardware. The scope includes:
* Role-based access control for Teachers and Students.
* Classroom creation, session scheduling, and LiveKit token generation.
* 5-sample biometric face enrollment and real-time attendance verification.
* Facial expression recognition, head-pose estimation, speech transcription, text sentiment analysis, and teacher analytics dashboards.
* **Academic Boundary**: The platform analyzes observable behavioral proxies (head pose, facial expressions, speech frequency, text sentiment). It does not claim to definitively measure internal emotional states, cognition, or intellectual capacity.

### 1.6 Organization of the Report
The remainder of this report is organized as follows:
* **Chapter 2** reviews relevant literature in biometric attendance, affective computing, and speech processing.
* **Chapter 3** presents functional, non-functional, hardware, and software requirements.
* **Chapter 4** outlines system architecture, module decomposition, and database schema.
* **Chapter 5** details the mathematical formulations and algorithms behind the AI models.
* **Chapter 6** discusses implementation details across the frontend, backend, and integration layers.
* **Chapter 7** provides empirical testing results, benchmark evaluations, and limitation analyses.
* **Chapter 8** concludes the study and outlines future research pathways.

---

# Chapter 2: Literature Review & Related Work

### 2.1 Evolution of Automated Attendance Systems
Traditional academic attendance monitoring relied on manual vocal roll calls or paper rosters. Initial automation efforts adopted barcode scanners, Radio Frequency Identification (RFID) cards, and fingerprint sensors. While RFID reduced recording time, it remained susceptible to buddy-punching where peers scan badges on behalf of absent classmates. Fingerprint scanners reduced proxy attendance but created physical bottlenecks at lecture hall entrances and are unviable for virtual classrooms.

Computer vision-based attendance emerged with the introduction of Viola-Jones Haar Cascade detectors and Eigenfaces/Fisherfaces. However, early methods suffered under varying lighting and pose shifts. The advent of Deep Convolutional Neural Networks (CNNs) revolutionized facial biometrics. Modern architectures such as ArcFace (Deng et al., 2019) construct geodesic distance constraints on a hypersphere, enforcing intra-class compactness and inter-class discrepancy, achieving state-of-the-art verification accuracy even with lightweight backbones such as MobileFaceNet.

### 2.2 Facial Emotion Recognition (FER) in Educational Technology
Affective computing in learning environments originated with Picard (1997), who hypothesized that emotional valence and arousal strongly correlate with student cognitive load. Early educational FER systems utilized Ekman’s six basic emotions (anger, disgust, fear, happiness, sadness, surprise) using datasets like CK+ and JAFFE. 

However, in natural classroom environments, facial expressions are subtle and spontaneous rather than exaggerated. The FERPlus dataset (Barsoum et al., 2016) addressed this by re-labeling FER2013 with 10 crowd-sourced annotators, adding `contempt` and an explicit probability distribution over annotations. Recent efficient deep architectures such as EmotiEffLib (Savchenko, 2021) demonstrate that mobile backbones (EfficientNet-B0) can deliver real-time facial feature extraction on CPU hardware. Nonetheless, current literature emphasizes that facial expressions are observable muscular movements (Action Units) and must not be conflated with definitive internal feelings.

### 2.3 Automatic Speech Recognition (ASR) & Multilingual Indian Classrooms
Speech recognition historically relied on Hidden Markov Models (HMMs) coupled with Gaussian Mixture Models (GMMs). The field shifted decisively to end-to-end transformer architectures with OpenAI’s Whisper (Radford et al., 2022). Whisper was trained on 680,000 hours of multilingual, weakly supervised audio, providing strong resilience to accents and technical terminology.

In multilingual Indian higher education, lectures frequently transition between English, Hindi, and regional languages such as Kannada. Low-resource Dravidian languages like Kannada exhibit higher Word Error Rates (WER) in small foundational models due to training set imbalances. To deploy Whisper in synchronous classrooms, inference engines such as CTranslate2 (`faster-whisper`) use int8 quantization and Silero Voice Activity Detection (VAD) to achieve real-time factor (RTF) $< 0.3$ on standard CPU infrastructure.

### 2.4 Multimodal Emotion & Engagement Fusion
Human communication is inherently multimodal: visual facial expressions, vocal acoustic prosody, and linguistic content provide complementary information. Multimodal fusion techniques are classified into:
1. **Early Fusion (Feature-Level)**: Concatenating raw feature vectors from multiple sensors before classification. While it captures inter-modal correlations, it suffers from the curse of dimensionality and fails completely when a sensor (e.g. camera) is disabled.
2. **Late Fusion (Decision-Level)**: Training individual models per modality and fusing their output probability distributions using voting, weighted averaging, or Bayesian inference. Late fusion provides superior modularity, graceful degradation when one modality is unavailable, and transparent conflict detection.

---

# Chapter 3: System Requirement Analysis

### 3.1 Functional Requirements
* **FR-01: User Management & Role-Based Access Control**:
  * Teachers register with employee IDs; students register with student ID numbers.
  * System issues HS256-signed JWT bearer tokens with 24-hour expiration.
* **FR-02: Classroom & Session Orchestration**:
  * Instructors create classrooms with unique course codes and schedule sessions.
  * Real-time session status transitions: `SCHEDULED` $\to$ `ACTIVE` $\to$ `COMPLETED`.
* **FR-03: Real-Time WebRTC Media Transport**:
  * Integration with LiveKit SFU; generation of scoped LiveKit access tokens with administrative grants for teachers and publish/subscribe grants for students.
* **FR-04: Guided Biometric Face Enrollment**:
  * 5-sample guided capture (`front`, `left`, `right`, `up`, `down`).
  * Real-time image validation: minimum bounding box ($100\times 100$ px), Laplacian blur variance ($\ge 30.0$), illumination bounds ($40 \le \mu \le 235$).
  * Cross-sample pairwise cosine similarity consistency check ($\ge 0.40$).
* **FR-05: Automated Real-Time Attendance**:
  * Periodic video frame capture (4-second interval).
  * SCRFD face detection and ArcFace 512D embedding comparison against enrolled mean template.
  * Temporal confirmation requiring 3 verified matches before marking `PRESENT` (or `LATE` if $>15$ minutes after lecture start).
* **FR-06: Facial Expression & Attentiveness Analysis**:
  * FERPlus ONNX 8-class classification mapped to 5 core classes (`neutral`, `happy`, `sad`, `angry`, `fear`).
  * Haar Cascade ocular tracking for pitch, yaw, and roll estimation.
  * Attentiveness score calculation with distraction categorization (`looking_away`, `looking_down`, `looking_up`).
* **FR-07: Multilingual Speech Transcription**:
  * Audio extraction and resampling to 16 kHz mono float32.
  * Whisper inference supporting English, Kannada, and Hindi with VAD filtering.
  * Live closed caption broadcasting to classroom participants.
* **FR-08: Text Sentiment & Intent Scoring**:
  * Lexicon-based compound valence scoring in $[-1.0, +1.0]$.
  * Automated detection of question intent and confusion terms.
* **FR-09: Multimodal Engagement Analytics**:
  * Weighted late fusion of visual and vocal emotion distributions ($0.65$ face, $0.35$ speech).
  * Composite student engagement index ($60\%$ attentiveness, $25\%$ participation, $15\%$ sentiment).
  * 5-minute rolling window classroom-wide expression distribution summaries.

### 3.2 Non-Functional Requirements
* **NFR-01: Performance & Latency**: Facial frame inference must complete in $\le 150$ ms; face matching in $\le 50$ ms; speech transcription in $\le 1.5$ s for 4-second chunks.
* **NFR-02: Transport Decoupling**: AI processing must be asynchronous and out-of-band; video conferencing frame rates must not drop due to model inference.
* **NFR-03: Security & Privacy**: Passwords hashed with bcrypt; face data stored exclusively as 512-dimensional numerical vectors (no raw facial photos stored in database); manual attendance overrides logged to an immutable audit trail.
* **NFR-04: Reliability & Graceful Degradation**: If camera or mic is disconnected, the system must declare structured uncertainty (`uncertain`, `insufficient_data`) rather than crashing or guessing.

### 3.3 Hardware & Software Specifications

#### Hardware Environment (Development & Testing)
* **Processor**: Apple Silicon (M-series) / Intel Core i7 8-core CPU
* **System RAM**: 16 GB Unified Memory
* **Storage**: 512 GB SSD
* **Client Peripherals**: Standard USB/Integrated $720$p Webcam, Omnidirectional Microphone

#### Software Environment
* **Operating System**: macOS Sonoma (Unix) / Ubuntu 22.04 LTS
* **Python Runtime**: Python 3.12.x in virtual environment (`backend/venv`)
* **Node.js Runtime**: Node.js v20.x, npm v10.x
* **Database Server**: PostgreSQL 16.x
* **Media Server**: LiveKit WebRTC SFU Server v1.5+

---

# Chapter 4: System Architecture & Design

### 4.1 Architectural Decomposition
EduSense AI employs an event-driven, decoupled three-tier architecture:

1. **Client Tier (Presentation Layer)**:
   * Built with **React 19**, **TypeScript**, **Vite**, and **TailwindCSS v4**.
   * Interfaces with LiveKit SFU via `@livekit/components-react` and `livekit-client`.
   * Manages browser hardware access (`navigator.mediaDevices.getUserMedia`).
   * Renders role-specific dashboards, attendance rosters, and classroom controls.
2. **Application Tier (Business Logic & AI Processing)**:
   * Built on **FastAPI** running on **Uvicorn** ASGI server.
   * Modular routers: `/api/auth`, `/api/classrooms`, `/api/sessions`, `/api/face`, `/api/attendance`, `/api/analytics`, `/api/transcription`, `/api/health`.
   * AI Inference Subsystems: InsightFace (SCRFD + ArcFace), ONNX Runtime (FERPlus), CTranslate2 (faster-whisper), Rule-Based Sentiment Analyzer, and Multimodal Fusion engine.
3. **Data Tier (Persistence Layer)**:
   * **PostgreSQL 16** relational database.
   * Managed through **SQLAlchemy 2.0** ORM and **Alembic** schema migrations.
   * Maintains 15 normalized tables with UUID primary keys.

---

# Chapter 5: Artificial Intelligence Models & Algorithms

### 5.1 Face Detection & Biometric Recognition

#### SCRFD Face Detector
* **Model Pack**: InsightFace `buffalo_sc` (`det_500m.onnx`).
* **Architecture**: Sample and Computation Redistribution for Efficient Face Detection (SCRFD).
* **Input**: $640\times 640$ BGR image matrix.
* **Outputs**: Face bounding boxes $[x_1, y_1, x_2, y_2]$, confidence score, and 5 facial landmark keypoints (left eye, right eye, nose, left mouth corner, right mouth corner).

#### ArcFace Biometric Feature Extraction
* **Model**: MobileFaceNet backbone (`w600k_mbf.onnx`).
* **Loss Formulation**: Additive Angular Margin Loss (ArcFace):
  $$L_{\text{ArcFace}} = -\frac{1}{N}\sum_{i=1}^N \log \frac{e^{s(\cos(\theta_{y_i} + m))}}{e^{s(\cos(\theta_{y_i} + m))} + \sum_{j \neq y_i} e^{s \cos \theta_j}}$$
  where $s = 64$ is feature scale and $m = 0.5$ is angular margin.
* **Output**: 512-dimensional embedding vector $\vec{e}$.
* **Normalization**: $\hat{e} = \frac{\vec{e}}{\|\vec{e}\|_2}$.
* **Verification Metric**: Cosine similarity $\text{sim}(\hat{e}_1, \hat{e}_2) = \hat{e}_1 \cdot \hat{e}_2$. Match threshold set to $\ge 0.50$.

### 5.2 Facial Emotion Recognition (FERPlus ONNX)
* **Model Checkpoint**: `ai/models/emotion-ferplus.onnx` ($35.0$ MB).
* **Input Tensor**: Grayscale, shape $[1, 1, 64, 64]$, normalized float32.
* **Calibrated Softmax Inference**:
  $$P(y = i) = \frac{\exp(z_i / T)}{\sum_{j=1}^8 \exp(z_j / T)}$$
  where $T = 0.9922$ is the optimal temperature determined empirically on validation splits.
* **Class Mapping & Uncertainty Assignment**:
  Raw classes: `neutral`, `happy`, `surprise`, `sad`, `angry`, `disgust`, `fear`, `contempt`.
  Mapped classes: `neutral`, `happy`, `sad`, `angry`, `fear`.
  Classes outside the 5-class target set (`surprise`, `disgust`, `contempt`) and predictions with top probability $< 0.35$ are assigned `dominant_emotion = "uncertain"` while retaining raw outputs in audit fields.

### 5.3 Head Pose Estimation & Attentiveness
* **Landmark Detection**: Frontal face and dual ocular regions detected via Haar Cascades.
* **Euler Angles**:
  $$\text{Yaw} = \left(\frac{c_x - W/2}{W/2}\right) \times 45^\circ, \quad \text{Pitch} = -\left(\frac{c_y - H/2}{H/2}\right) \times 30^\circ, \quad \text{Roll} = \arctan\left(\frac{y_{\text{right}} - y_{\text{left}}}{x_{\text{right}} - x_{\text{left}}}\right)$$
* **Attentiveness Metric**:
  $$\text{Score} = \max\left(0.0, 1.0 - \frac{\sqrt{\text{Pitch}^2 + \text{Yaw}^2 + (0.5 \cdot \text{Roll})^2}}{45^\circ}\right)$$
  Distraction flag triggered if Attentiveness Score $< 0.50$.

### 5.4 Multilingual Speech Transcription (Whisper)
* **Engine**: `faster-whisper` (CTranslate2 `small` model, int8 quantization).
* **Preprocessing**: Audio resampled to 16 kHz mono float32.
* **VAD Filtering**: Silero VAD trims non-speech segments.
* **Decoding Parameters**: Beam size = 5, temperature = 0.0, `condition_on_previous_text=False`.
* **Language Support**: Auto-detection, English (`en`), Kannada (`kn`), Hindi (`hi`).
* **Regional Optimization**: For Kannada, `repetition_penalty=1.15` and `no_repeat_ngram_size=3` prevent token repetition loops.

### 5.5 Text Sentiment & Intent Scoring
* **Lexicon Valence**: Word token valence values in $[-3.0, +3.0]$.
* **Negation Inversion**: Prior negation tokens invert valence with dampening factor: $v' = -0.8 v$.
* **Compound Score**:
  $$\text{Compound} = \frac{\sum v}{\sqrt{(\sum v)^2 + 15.0}} \in [-1.0, +1.0]$$
* **Intent Detection**: Questions identified by `?` or interrogative words; confusion flagged by presence of confusion terms (`"unclear"`, `"don't understand"`, `"lost"`).
* **Language Handling**: Non-English scripts safely declared `unsupported_language` for rule-based sentiment.

### 5.6 Multimodal Late Fusion
* **Weighted Linear Combination**:
  $$P_{\text{final}}(c) = 0.65 P_{\text{face}}(c) + 0.35 P_{\text{speech}}(c)$$
* **Conflict Detection**: Divergence flagged if $\arg\max(P_{\text{face}}) \neq \arg\max(P_{\text{speech}})$ and both individual confidences $\ge 0.50$.

---

# Chapter 6: System Implementation

### 6.1 Frontend Architecture
* **Component Hierarchy**: `App.tsx` routes between `LoginPage`, `RegisterPage`, `DashboardPage`, `FaceEnrollmentPage`, and `ClassroomPage`.
* **State Management**: React `useState`, `useEffect`, `useRef`, and `AuthContext` for JWT lifecycle management.
* **Classroom Grid**: LiveKit `<LiveKitRoom>`, `<VideoTrack>`, and `<RoomAudioRenderer>` render dynamic video tiles with real-time floating emotion badges and live captions.

### 6.2 Backend Architecture & Endpoints
* **FastAPI Routers**: Cleanly decoupled modules under `backend/app/api/`.
* **Dependency Injection**: `get_db` manages SQLAlchemy session lifecycles; `get_current_user` and `require_role` enforce authentication and authorization.
* **API Documentation**: Interactive OpenAPI Swagger documentation automatically served at `http://localhost:8000/docs`.

### 6.3 Database Design & ORM Integration
* **15 Tables**: `users`, `student_profiles`, `teacher_profiles`, `classrooms`, `class_sessions`, `session_participants`, `face_embeddings`, `attendance_records`, `facial_analyses`, `speech_analyses`, `sentiment_analyses`, `distraction_events`, `engagement_metrics`, `class_reports`, `audit_logs`.
* All foreign keys configure cascading deletes or nullifications to maintain relational integrity.

---

# Chapter 7: Experimental Results & Testing

### 7.1 Facial Emotion Recognition Benchmark
The facial emotion recognition models were evaluated on the verified benchmark dataset (`eval_data/fer2013new.csv`) consisting of 1,708 validation samples and 1,708 test samples.

| Metric | FERPlus ONNX (`emotion-ferplus.onnx`) | EmotiEffLib VGAF (`enet_b0_8_best_vgaf`) | Status / Source |
| :--- | :--- | :--- | :--- |
| **Test Accuracy** | **83.14%** ($0.83138$) | 58.02% ($0.58021$) | Empirical Benchmark (`benchmark_results.json`) |
| **Balanced Accuracy** | **60.52%** ($0.60516$) | 57.72% ($0.57720$) | Empirical Benchmark (`benchmark_results.json`) |
| **Macro F1-Score** | **0.6523** | 0.4476 | Empirical Benchmark (`benchmark_results.json`) |
| **Expected Calibration Error (ECE)** | **0.0197** ($1.97\%$) | 0.1011 ($10.11\%$) | Empirical Benchmark (`benchmark_results.json`) |
| **Optimal Softmax Temperature ($T$)** | **0.9922** | $1.0000$ | Learned on validation split |

#### Detailed FERPlus Per-Class Performance on Test Set

| Class Label | Precision | Recall | F1-Score | Support (Samples) |
| :--- | :--- | :--- | :--- | :--- |
| **neutral** | 0.7800 | 0.9248 | 0.8463 | 625 |
| **happiness** | 0.9054 | 0.9546 | 0.9294 | 441 |
| **surprise** | 0.8694 | 0.8694 | 0.8694 | 222 |
| **sadness** | 0.7328 | 0.4824 | 0.5818 | 199 |
| **anger** | 0.9316 | 0.6943 | 0.7956 | 157 |
| **disgust** | 0.6667 | 0.4000 | 0.5000 | 15 |
| **fear** | 0.7273 | 0.4324 | 0.5424 | 37 |
| **contempt** | 1.0000 | 0.0833 | 0.1538 | 12 |
| **Macro Average** | **0.8266** | **0.6052** | **0.6523** | **1708** |
| **Weighted Average** | **0.8318** | **0.8314** | **0.8208** | **1708** |

### 7.2 Verified Test Suite Executions

1. **Facial Pipeline Comprehensive Test Suite** (`backend/test_facial_pipeline_comprehensive.py`):
   * **Result**: **6 Passed**, 0 Failed (Execution time: 10.83s).
   * Verified: Model loading, image quality rejection, 8-to-5 class mapping, temporal smoothing, student attribution, and 5-minute rolling window aggregation.
2. **Phase 3B Automated Face Attendance Suite** (`backend/test_phase3b_attendance.py`):
   * **Result**: Verified. ArcFace similarity comparison accurately differentiates enrolled student profiles ($\ge 0.50$) from non-matching impostors.
3. **Analytics Pipeline Unit Tests** (`backend/test_analytics.py`):
   * **Result**: 3 passed, 1 failed (Assertion in test expected `sentiment_score == 0.0` on empty input, whereas updated production service correctly returns `None` for insufficient data).

### 7.3 System Limitations

1. **Facial Occlusion & Extreme Head Yaw**: While frontal and moderate angular poses ($\pm 30^\circ$) are accurately analyzed, extreme yaw ($>45^\circ$) or hand-to-face occlusions prevent face detection.
2. **Lighting Variations**: Environments below 40 mean grayscale brightness fail quality gating.
3. **Low-Resource Language Recognition**: Kannada recognition in Whisper small yields lower confidence than English; the pipeline flags this transparently rather than fabricating transcripts.
4. **Affective Proxy Boundary**: Facial expressions and text sentiment are behavioral proxies and must never be interpreted as clinical psychological diagnoses.

---

# Chapter 8: Conclusion & Future Scope

### 8.1 Project Achievements
The EduSense AI project successfully developed an integrated, real-time smart classroom analytics platform that:
* Replaces manual roll calls with automated, biometric face recognition and temporal confirmation.
* Computes objective attentiveness and observable facial expression distributions at safe 4-second intervals.
* Provides live multilingual transcription for English, Kannada, and Hindi.
* Unifies visual, speech, and participation signals into a composite engagement index.
* Maintains real-time media stability through an asynchronous decoupled architecture.

### 8.2 Future Scope & Enhancements
1. **Acoustic Speech Emotion Recognition (wav2vec 2.0)**: Train a fine-tuned wav2vec 2.0 or HuBERT model to classify vocal pitch, jitter, and prosody directly from raw audio waveforms.
2. **Transformer-Based Semantic Sentiment (BERT / IndicBERT)**: Replace the rule-based valence lexicon with fine-tuned multilingual transformer models (e.g. IndicBERT) to evaluate contextual nuance and sarcasm across regional Indian languages.
3. **Liveness & 3D Anti-Spoofing**: Implement active texture analysis or blink detection (Eye Aspect Ratio via MediaPipe Mesh) to prevent static photograph replay attacks.
4. **Cloud Infrastructure Deployment**: Deploy LiveKit SFU on Kubernetes, backend workers on containerized GPU clusters, and PostgreSQL on managed cloud instances (e.g. AWS RDS).

---

# References

1. **Barsoum, E., Zhang, C., Ferrer, C. C., & Zhang, Z.** (2016). *Training deep networks for facial expression recognition with crowd-sourced label distribution.* In Proceedings of the 18th ACM International Conference on Multimodal Interaction (ICMI '16), pp. 279–283.
2. **Deng, J., Guo, J., Xue, N., & Zafeiriou, S.** (2019). *ArcFace: Additive angular margin loss for deep face recognition.* In Proceedings of the IEEE/CVF Conference on Computer Vision and Pattern Recognition (CVPR), pp. 4690–4699.
3. **Radford, A., Kim, J. W., Xu, T., Brockman, G., McLeavey, C., & Sutskever, I.** (2022). *Robust speech recognition via large-scale weak supervision.* OpenAI Technical Report.
4. **Savchenko, A. V.** (2021). *Facial expression and attributes recognition based on multi-task learning of lightweight neural networks.* In Proceedings of the IEEE/CVF International Conference on Computer Vision (ICCV) Workshops, pp. 1196–1203.
5. **Picard, R. W.** (1997). *Affective Computing.* MIT Press, Cambridge, MA.
6. **Ekman, P.** (1993). *Facial expression and emotion.* American Psychologist, 48(4), 384–392.
7. **FastAPI Documentation**: Tiangolo, S. (2024). *FastAPI framework, high performance, easy to learn, fast to code, ready for production.* https://fastapi.tiangolo.com/
8. **LiveKit Documentation**: LiveKit Inc. (2024). *Real-time audio and video WebRTC infrastructure.* https://docs.livekit.io/
9. **ONNX Runtime Documentation**: Microsoft. (2024). *ONNX Runtime: Cross-platform, high performance ML inferencing and training accelerator.* https://onnxruntime.ai/

---

# Appendices

### Appendix A: Project Execution & Startup Commands

#### 1. PostgreSQL Database Initialization
```bash
# Start PostgreSQL service
brew services start postgresql@16

# Verify database exists (or create if needed)
createdb edusense_db
```

#### 2. Backend Startup (Port 8000)
```bash
cd /Users/apple/Desktop/Edusense_AI/backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000
```
* Interactive API Documentation: `http://localhost:8000/docs`
* Health Check: `http://localhost:8000/api/health`

#### 3. Frontend Startup (Port 5173)
```bash
cd /Users/apple/Desktop/Edusense_AI/frontend
npm run dev
```
* Web Application Interface: `http://localhost:5173`

---

### Appendix B: Environment Configuration Template (`.env`)

```ini
# Application Execution Mode
ENVIRONMENT=development
DEBUG=True
API_V1_PREFIX=/api

# Network Settings
HOST=0.0.0.0
PORT=8000

# Security Credentials
SECRET_KEY=edusense-ai-production-super-secret-key-32-chars-minimum
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# PostgreSQL Connection String
POSTGRES_USER=apple
POSTGRES_PASSWORD=
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=edusense_db
DATABASE_URL=postgresql://apple@localhost:5432/edusense_db

# CORS Allowed Origins
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

# LiveKit WebRTC Server Configuration
LIVEKIT_URL=http://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret

# Face AI Quality & Recognition Thresholds
FACE_MODEL_PACK=buffalo_sc
FACE_MIN_SIZE=100
FACE_BLUR_THRESHOLD=30.0
FACE_CONSISTENCY_THRESHOLD=0.40
FACE_RECOGNITION_SIMILARITY_THRESHOLD=0.50
```
