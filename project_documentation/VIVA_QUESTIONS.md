# EduSense AI: Comprehensive Viva Voce Questions & Answers
## 60 Technical Defense Questions and Model Answers for Final-Year Major Project Examination

---

### Section 1: Core Architecture & System Design (Questions 1 to 8)

#### Q1: What is EduSense AI and what core problem does it solve?
**Answer**: EduSense AI is an asynchronous, multimodal smart classroom platform designed to modernize remote and hybrid education. Traditional video conferencing platforms (Zoom, Google Meet) treat learners as passive video tiles, requiring manual roll calls and blinding instructors to classroom engagement dynamics. EduSense AI integrates computer vision, deep learning biometrics, speech recognition, and natural language processing to automate attendance verification, track head-pose attentiveness, analyze observable facial expressions, transcribe multilingual speech, and compute composite student engagement analytics without degrading real-time audio/video transport.

#### Q2: How does the system architecture prevent heavy AI inference from degrading real-time video/audio streaming?
**Answer**: EduSense AI completely decouples the real-time media transport layer from the compute-intensive AI inference layer. Video and audio transport flow directly between client browsers and a LiveKit Selective Forwarding Unit (SFU) via WebSockets and WebRTC (UDP/SRTP). AI inference operates out-of-band: client browsers sample video frames (every 4 seconds) and audio chunks, transmitting them via asynchronous HTTP REST requests to the FastAPI backend. FastAPI processes inference across isolated worker threads via ONNX Runtime and CTranslate2, ensuring that even if model execution experiences temporary latency, real-time video streaming is never blocked.

#### Q3: Why was FastAPI chosen over Django or Flask for the backend?
**Answer**: FastAPI natively supports Python asynchronous programming (`async`/`await`), provides built-in Pydantic v2 data validation, and generates interactive OpenAPI (Swagger) documentation automatically. It delivers near-Go/Node.js throughput while allowing seamless execution of native Python scientific and machine learning libraries (NumPy, OpenCV, ONNX Runtime, PyTorch). Flask lacks native async concurrency and automatic schema validation, while Django is a heavy monolithic framework unnecessary for a decoupled microservice backend.

#### Q4: Why was PostgreSQL chosen over MongoDB or SQLite?
**Answer**: EduSense AI requires strict ACID transactional guarantees, foreign key cascades, and complex relational integrity across 15 interconnected entities (users, student profiles, teacher profiles, classrooms, sessions, participants, attendance records, and analytical observations). MongoDB’s eventual consistency risks concurrency anomalies (such as duplicate attendance records), while SQLite lacks native concurrent write support for multi-user classroom environments. PostgreSQL 16 provides enterprise-grade concurrency, native UUIDv4 indexing, and flexible JSONB storage for mathematical embedding vectors.

#### Q5: What is the role of LiveKit in this application?
**Answer**: LiveKit acts as the WebRTC Selective Forwarding Unit (SFU) media server. Instead of establishing full-mesh peer-to-peer WebRTC connections between all students (which saturates client upload bandwidth), participants publish a single media stream to the LiveKit server, which routes audio and video tracks to all subscribed participants. The FastAPI backend generates cryptographically signed LiveKit AccessTokens with scoped `VideoGrants`, ensuring secure room access.

#### Q6: How does the frontend communicate with the backend and LiveKit?
**Answer**: Communication uses dual channels:
1. **Signaling & REST Operations**: React communicates with FastAPI at `http://localhost:8000/api` using standard JSON REST requests with Bearer JWT tokens for authentication.
2. **Real-Time Media Streaming**: The LiveKit React SDK (`@livekit/components-react`) establishes a persistent WebSocket signaling channel and WebRTC peer connections with the LiveKit SFU server at `http://localhost:7880`.

#### Q7: What role-based access control (RBAC) mechanisms are enforced?
**Answer**: Three distinct roles exist: `TEACHER`, `STUDENT`, and `ADMIN`. FastAPI dependencies (`get_current_user` and `require_role`) inspect the JWT claims on every protected request. Only teachers can create classrooms, launch sessions, end sessions, view class-wide analytics overviews, and manually update attendance records. Students are strictly restricted to capturing their own face samples, verifying their own attendance, and viewing their own engagement metrics.

#### Q8: How does the application handle cross-origin resource sharing (CORS)?
**Answer**: FastAPI utilizes `CORSMiddleware` configured via the `ALLOWED_ORIGINS` setting (`http://localhost:5173,http://127.0.0.1:5173`). It explicitly permits incoming HTTP methods (`GET`, `POST`, `PUT`, `DELETE`), allows credentials (cookies, headers), and validates authorization bearer headers.

---

### Section 2: Face Detection, Recognition & Biometrics (Questions 9 to 18)

#### Q9: What is the technical difference between face detection and face recognition?
**Answer**: 
* **Face Detection**: The computer vision task of determining *whether* a human face is present in an image and localizing its spatial coordinates (bounding box $[x_1, y_1, x_2, y_2]$ and landmark keypoints). It does not identify *who* the face belongs to.
* **Face Recognition**: The biometric task of determining *identity*. It takes a localized face region, maps it through a deep neural network into a high-dimensional feature space (embedding vector), and computes mathematical distance against enrolled identity templates.

#### Q10: Which exact face detection and face recognition models are implemented in EduSense AI?
**Answer**: 
* **Face Detection**: **SCRFD** (`det_500m.onnx`), loaded via the InsightFace `buffalo_sc` model pack with input detection resolution set to $640\times 640$.
* **Face Recognition**: **ArcFace MobileFaceNet** (`w600k_mbf.onnx`), which extracts a 512-dimensional feature embedding vector.

#### Q11: What is a 512-dimensional face embedding?
**Answer**: A 512-dimensional face embedding is a latent feature representation vector $\vec{e} \in \mathbb{R}^{512}$ generated by the final fully connected layer of the ArcFace neural network. It compresses invariant facial features (inter-ocular distance, nasal bridge structure, jawline contour) into an abstract mathematical coordinate. In EduSense AI, this vector is strictly L2-normalized so that its Euclidean length is $1.0$ ($\|\vec{e}\|_2 = 1.0$).

#### Q12: How does ArcFace differ from standard Softmax classification?
**Answer**: Standard Softmax maximizes the posterior probability of the correct class, creating decision boundaries in Euclidean space that are insufficiently margin-separated for open-set face recognition. ArcFace introduces an **Additive Angular Margin** ($m = 0.5$) directly into the angle $\theta$ on a normalized hypersphere:
$$L = -\frac{1}{N}\sum_{i=1}^N \log \frac{e^{s \cos(\theta_{y_i} + m)}}{e^{s \cos(\theta_{y_i} + m)} + \sum_{j \neq y_i} e^{s \cos \theta_j}}$$
This explicitly enforces intra-class compactness and maximizes inter-class discrepancy on the hypersphere, allowing lightweight models to achieve high biometric verification accuracy.

#### Q13: What mathematical formula is used to compare two face embeddings?
**Answer**: **Cosine Similarity**, which calculates the dot product of the unit-normalized vectors:
$$\text{sim}(\hat{e}_1, \hat{e}_2) = \hat{e}_1 \cdot \hat{e}_2 = \sum_{k=1}^{512} e_{1,k} \cdot e_{2,k}$$
Since both vectors have unit norm, the similarity ranges from $-1.0$ (opposite) to $+1.0$ (identical).

#### Q14: What similarity threshold is implemented in EduSense AI, and what happens if a comparison falls below it?
**Answer**: The configured threshold is `FACE_RECOGNITION_SIMILARITY_THRESHOLD = 0.50`. If the maximum similarity between the live query frame and the enrolled template is $\ge 0.50$, the system declares a match (`MATCH_SUCCESS`). If it falls below $0.50$, it returns `matched = False` with `reason = "FACE_MISMATCH"`, rejecting the frame as an unrecognized student or an impostor.

#### Q15: What image quality gating checks are performed before extracting embeddings?
**Answer**: Four sequential checks are performed in `check_face_quality()`:
1. **Single-Face Constraint**: Frame must contain exactly one face. Zero faces trigger `NO_FACE`; multiple faces trigger `MULTIPLE_FACES_DETECTED`.
2. **Minimum Face Size**: Bounding box width and height must be $\ge 100$ pixels.
3. **Sharpness (Blur Check)**: Variance of Laplacian on the cropped face must be $\ge 30.0$.
4. **Illumination Check**: Mean grayscale pixel brightness must fall between $40.0$ and $235.0$.
5. **Spatial Centering**: Face center must reside within $\pm 18\%$ of the optical image center.

#### Q16: How is image blur calculated mathematically?
**Answer**: Using the variance of the discrete 2D Laplacian operator:
$$\text{Laplacian}(I) = \frac{\partial^2 I}{\partial x^2} + \frac{\partial^2 I}{\partial y^2}$$
Convolving the image with the standard $3\times 3$ Laplacian kernel $\begin{bmatrix} 0 & 1 & 0 \\ 1 & -4 & 1 \\ 0 & 1 & 0 \end{bmatrix}$ highlights high-frequency edges. The variance $\sigma^2 = \frac{1}{N}\sum (L(x,y) - \mu)^2$ reflects edge density. Sharp images exhibit high variance ($\ge 30.0$); blurry images exhibit low variance ($< 30.0$).

#### Q17: Describe the 5-sample biometric enrollment process.
**Answer**: The student completes a guided 5-step capture sequence covering five distinct poses: `Sample 1: Front Facing`, `Sample 2: Slight Left`, `Sample 3: Slight Right`, `Sample 4: Slight Up`, and `Sample 5: Slight Down`. Each frame is validated for size, sharpness, and lighting, and its 512D ArcFace embedding is extracted. Once all 5 vectors are acquired, the client sends them to `/api/face/enrollment/complete`.

#### Q18: What is the sample consistency check in face enrollment?
**Answer**: Before storing the enrollment profile, the backend computes a $5\times 5$ pairwise cosine similarity matrix across the 5 sample vectors:
$$\text{sim}_{ij} = \vec{e}_i \cdot \vec{e}_j$$
The average of the 10 off-diagonal pairwise similarities must be $\ge 0.40$ (`FACE_CONSISTENCY_THRESHOLD`). This prevents enrollment failure where a student accidentally captures a sibling, friend, or background bystander in one of the frames. If consistent, the backend computes the mean vector, normalizes it to unit length, and stores it in PostgreSQL.

---

### Section 3: Attendance Algorithms & Verification Logic (Questions 19 to 26)

#### Q19: Explain the 3-sample Temporal Confirmation Algorithm for automated attendance.
**Answer**: Single-frame biometric verification is vulnerable to transient false positives (e.g. an impostor momentarily passing by the camera). EduSense AI implements temporal confirmation (`CONFIRMATION_SAMPLES_REQUIRED = 3`):
* When a student joins a session, their initial attendance record is created with status `UNVERIFIED` and `verification_count = 0`.
* Every 4 seconds, a webcam frame is verified against the enrolled ArcFace template.
* Each successful match increments `verification_count` by 1.
* Only when `verification_count >= 3` (requiring at least 3 distinct matching frames across time) does the system transition the status to `PRESENT` or `LATE`.

#### Q20: How does the system determine whether a student is marked PRESENT versus LATE?
**Answer**: When the third verified sample is confirmed, the system compares the timestamp of the student's first verified appearance (`first_verified_at`) against the session start time:
$$\text{Cutoff Time} = \text{Session Start Time} + 15\text{ minutes}$$
* If `first_verified_at <= Cutoff Time`, the student is marked **`PRESENT`**.
* If `first_verified_at > Cutoff Time`, the student is marked **`LATE`**.

#### Q21: How does the system prevent duplicate attendance records for the same student?
**Answer**: The `attendance_records` table enforces a relational constraint: exactly one attendance row exists per `(session_id, student_id)` pair. In `verify_attendance()`, the system queries for an existing record. If found, it updates the existing row in-place (incrementing `verification_count`, updating `last_verified_at`, and updating `presence_duration_seconds`) rather than inserting duplicate records.

#### Q22: How is presence duration calculated?
**Answer**: Each attendance record stores `first_verified_at` and `last_verified_at`. Whenever a new verification succeeds:
$$\text{presence\_duration\_seconds} = \max\left(0, \, \text{int}((\text{last\_verified\_at} - \text{first\_verified\_at}).\text{total\_seconds}())\right)$$
This tracks how long the student actively maintained physical presence in front of the camera.

#### Q23: Can a teacher manually override an attendance status, and how is it audited?
**Answer**: Yes. Instructors can send a `PUT /api/attendance/{record_id}` request with a new status (e.g. `EXCUSED`, `PRESENT`) and a mandatory `reason` string. The system sets `is_manually_corrected = True`, records `corrected_by_id = teacher.id`, and logs an entry to the `audit_logs` table:
`"MANUAL_ATTENDANCE_CORRECTION: Record {id} changed from {old} to {new}. Reason: {reason}"`
This guarantees full audit transparency.

#### Q24: What happens if a student sits in class with their camera turned off?
**Answer**: If the camera is disabled, no video frames are transmitted to `/api/attendance/verify`. The student's `verification_count` remains $0$. When the teacher concludes the session, any student participant who failed to achieve 3 verified samples is transitioned to **`ABSENT`**.

#### Q25: How does the system differentiate a student who leaves early from one who stays?
**Answer**: A student who leaves early will have a stalled `last_verified_at` timestamp. Their `presence_duration_seconds` will reflect only the elapsed time between their first and last verified frames, and the `leave_session` endpoint records their departure timestamp in `session_participants.left_at`.

#### Q26: Are raw webcam frames stored in the database for attendance verification?
**Answer**: **No.** In accordance with privacy-by-design principles, raw webcam images are decoded in memory, evaluated for quality, converted into mathematical embedding vectors, and immediately discarded from RAM. The database stores only 512-dimensional floating-point embeddings and scalar metrics.

---

### Section 4: Facial Emotion Recognition & Temporal Smoothing (Questions 27 to 34)

#### Q27: What is the primary facial emotion recognition model used in EduSense AI?
**Answer**: The primary model is **FERPlus ONNX** (`ai/models/emotion-ferplus.onnx`, $35.0$ MB), executed via ONNX Runtime CPU. It takes a $64\times 64$ grayscale face crop and outputs an 8-class probability distribution across `neutral`, `happy`, `surprise`, `sad`, `angry`, `disgust`, `fear`, and `contempt`.

#### Q28: What is the fallback emotion model, and when is it triggered?
**Answer**: The fallback model is **EmotiEffLib** (`enet_b0_8_best_vgaf`), which utilizes an EfficientNet-B0 backbone accepting $224\times 224$ RGB crops with ImageNet normalization. It is triggered if the FERPlus ONNX model file is missing or fails to initialize.

#### Q29: What empirical benchmark justifies choosing FERPlus ONNX as the primary model over EmotiEffLib?
**Answer**: Evaluation on the standardized $1,708$-sample FERPlus test dataset (`eval_data/benchmark_results.json`) revealed:
* **FERPlus Test Accuracy**: **$83.14\%$** vs. EmotiEffLib VGAF **$58.02\%$** ($+25.12\%$ advantage).
* **FERPlus Macro F1-Score**: **$0.6523$** vs. EmotiEffLib VGAF **$0.4476$**.
* **Expected Calibration Error (ECE)**: **$0.0197$ ($1.97\%$)** vs. EmotiEffLib VGAF **$0.1011$ ($10.11\%$)**.
FERPlus demonstrated superior classification accuracy and significantly lower calibration error.

#### Q30: How are 8 raw emotion classes mapped to the EduSense 5-class target set?
**Answer**: 
* `Happiness` $\to$ `happy`
* `Neutral` $\to$ `neutral`
* `Sadness` $\to$ `sad`
* `Anger` $\to$ `angry`
* `Fear` $\to$ `fear`
* Classes `Surprise`, `Disgust`, and `Contempt` reside outside the 5-class target set. They are mapped to `dominant_emotion = "uncertain"` while their raw values are preserved in `raw_dominant` and `raw_emotion_probabilities`. They are **never** artificially forced into `neutral`.

#### Q31: What is the confidence threshold for emotion classification?
**Answer**: The default threshold is `0.35` (`CALIBRATION_TEMPERATURE = 0.9922`). If the top predicted probability is $< 0.35$, `dominant_emotion` is set to `"uncertain"` with `prediction_status = "low_confidence"`.

#### Q32: Why is temperature scaling needed for the emotion model?
**Answer**: Raw deep learning logits produce uncalibrated probabilities that tend to be overconfident. Scaling logits by $T = 0.9922$ adjusts the softmax distribution so that a predicted confidence of $80\%$ empirically corresponds to an $80\%$ likelihood of correctness, reducing Expected Calibration Error to $1.97\%$.

#### Q33: How does the `EmotionTemporalSmoother` work?
**Answer**: It maintains a rolling history buffer of 5 consecutive frames and applies exponentially decaying weights ($w_k = 0.85^{N - 1 - k}$). Recent frames receive higher weight while older frames decay gracefully. This filters high-frequency frame flicker (e.g. sudden blinks) while enabling smooth transitions when the student's facial expression genuinely shifts.

#### Q34: What happens if a video frame has poor lighting or severe blur during emotion analysis?
**Answer**: The frame is checked for mean brightness and Laplacian variance. If brightness $<20$ or $>245$, it is flagged as `poor_lighting` or `overexposed`. If Laplacian variance $<15.0$, it is flagged as `blurry`. If face detection fails under poor quality, the system returns `dominant_emotion = "uncertain"` and `prediction_status = "poor_image_quality"` rather than guessing.

---

### Section 5: Head Pose Estimation & Attentiveness (Questions 35 to 38)

#### Q35: How does EduSense AI estimate head pose without 3D depth sensors?
**Answer**: It uses 2D geometric angle projection derived from frontal face and eye bounding boxes localized via OpenCV Haar Cascades:
* **Yaw (Horizontal pan)**: Proportional to the horizontal offset between the face center $c_x$ and image center $W/2$:
  $$\text{Yaw} = \left(\frac{c_x - W/2}{W/2}\right) \times 45.0^\circ$$
* **Pitch (Vertical tilt)**: Proportional to the vertical offset between the face center $c_y$ and image center $H/2$:
  $$\text{Pitch} = -\left(\frac{c_y - H/2}{H/2}\right) \times 30.0^\circ$$
* **Roll (Planar tilt)**: Computed from the slope between the dual eye centers:
  $$\text{Roll} = \arctan\left(\frac{\Delta y_{\text{eyes}}}{\Delta x_{\text{eyes}}}\right) \times \left(\frac{180^\circ}{\pi}\right)$$

#### Q36: How is the Attentiveness Score calculated?
**Answer**: By measuring the composite angular deviation from the frontal camera axis:
$$D_{\text{total}} = \sqrt{\text{Pitch}^2 + \text{Yaw}^2 + (0.5 \cdot \text{Roll})^2}$$
$$\text{Attentiveness Score} = \max\left(0.0, \, 1.0 - \frac{D_{\text{total}}}{45.0^\circ}\right)$$
When looking directly at the screen, $D_{\text{total}} \approx 0^\circ$ and $\text{Attentiveness} \approx 1.0$.

#### Q37: When is a distraction event logged, and what types are supported?
**Answer**: A distraction event is logged when Attentiveness Score $< 0.50$ (angular deviation $> 22.5^\circ$). It is categorized as:
* `looking_away`: If $|\text{Yaw}| > 30^\circ$
* `looking_down`: If $\text{Pitch} < -20^\circ$
* `looking_up`: If $\text{Pitch} > 25^\circ$
* `inattentive`: If composite tilt exceeds threshold

#### Q38: How does the system handle multiple faces in a student's webcam feed?
**Answer**: In `ai/facial_emotion.py`, detected faces are sorted by area. If multiple faces exist, the system computes the area ratio between the second and primary face. If the second face is comparable in size ($>65\%$ of primary) and both are off-center, the frame is declared ambiguous (`prediction_status = "ambiguous_face"`, `distraction_type = "multiple_faces_detected"`), resetting temporal history.

---

### Section 6: Speech Transcription & Multilingual Processing (Questions 39 to 44)

#### Q39: Which speech-to-text transcription engine is used?
**Answer**: **`faster-whisper`**, a reimplementation of OpenAI's Whisper model utilizing **CTranslate2**, configured with the `small` model checkpoint and `int8` quantization running on CPU.

#### Q40: What audio preprocessing steps are applied before Whisper inference?
**Answer**: Incoming audio (WAV, MP3, WebM, FLAC) is demuxed and decoded via PyAV. It is converted to single-channel (mono) float32 audio resampled precisely to $16,000$ Hz. Amplitudes are normalized to $[-1.0, +1.0]$ by dividing 16-bit PCM samples by $32,768.0$.

#### Q41: How does the system handle classroom silence and prevent Whisper hallucinations?
**Answer**: 
1. **RMS Silence Gating**: Audio with duration $< 0.25$ seconds or root-mean-square amplitude $\text{RMS} < 0.003$ is immediately flagged as silence without invoking the neural network.
2. **Silero VAD**: Silero Voice Activity Detection filters non-speech room noise (`min_silence_duration_ms = 400`, `speech_pad_ms = 200`).
3. **Hallucination Blacklist**: Common Whisper silence artifacts (`"thank you"`, `"subtitles by"`, `"thanks for watching"`) occurring with high no-speech probability ($>0.35$) are filtered out.

#### Q42: Which languages are supported, and how does the system optimize for them?
**Answer**: English (`en`), Kannada (`kn`), and Hindi (`hi`), along with automatic language identification (`auto`).
* **Hindi**: Conditioned using the native Devanagari script prompt: `"यह एक शैक्षिक व्याख्यान और कक्षा की चर्चा है।"`.
* **Kannada**: Uses a repetition penalty ($\gamma = 1.15$) and 3-gram constraint (`no_repeat_ngram_size = 3`) to eliminate subword token looping common in low-resource Dravidian languages.
* **Auto-Detect Verification**: Cross-references detected language against Unicode script ranges (Kannada: `\u0C80-\u0CFF`, Hindi: `\u0900-\u097F`).

#### Q43: Why is Kannada flagged as low confidence in Whisper small?
**Answer**: In Whisper’s public training dataset, Kannada comprises a minute fraction of training hours compared to English or Spanish. Consequently, foundational small models exhibit higher subword ambiguity. EduSense AI transparently flags Kannada transcripts with `is_low_confidence = True` to alert educators that the transcript is a machine approximation.

#### Q44: What is transcript deduplication / idempotency?
**Answer**: In `transcription_service.py`, if the exact same transcript text is submitted for the same participant within a 12-second window, the system recognizes it as a client retry or overlapping chunk, skipping database re-insertion and returning the existing record to prevent duplicate speech metrics.

---

### Section 7: Text Sentiment & Intent Scoring (Questions 45 to 48)

#### Q45: How is text sentiment analysis implemented? Is BERT used?
**Answer**: In the existing codebase, text sentiment is implemented using a **rule-based valence lexicon with negation handling and educational intent detection** (`ai/sentiment_analyzer.py`), **not BERT**. While BERT was discussed during preliminary planning, the production implementation utilizes a lightweight lexicon model to avoid multi-gigabyte GPU dependencies during local CPU execution.

#### Q46: How does the lexicon score sentiment mathematically?
**Answer**: It matches word tokens against `BETA_LEXICON` ($v \in [-3.0, +3.0]$). If a preceding word is a negation (`not`, `never`, `don't`), the valence is inverted: $v_{\text{eff}} = -0.8 v$. The cumulative valence $V$ is normalized to a compound score $C \in [-1.0, +1.0]$:
$$C = \frac{V}{\sqrt{V^2 + 15.0}}$$
* $C \ge +0.05 \implies \text{positive}$
* $C \le -0.05 \implies \text{negative}$
* $-0.05 < C < +0.05 \implies \text{neutral}$

#### Q47: How does the system detect student confusion and questions?
**Answer**: 
* **Questions**: Flagged if text contains `?` or begins with interrogative tokens (`what`, `why`, `how`, `can`, `could`, `is`).
* **Confusion**: Flagged if text contains domain terms: `"confused"`, `"don't understand"`, `"unclear"`, `"lost"`, `"hard to follow"`, `"struggling"`. If confusion is detected without a question mark, the sentiment label is assigned to `negative`.

#### Q48: How does the sentiment analyzer handle Kannada or Hindi text?
**Answer**: Because the rule-based lexicon is calibrated specifically for English word tokens, passing Kannada or Hindi script triggers a regex guard that returns `sentiment_label = "unsupported_language"` and `sentiment_score = None`. The system transparently documents language limitations rather than fabricating random sentiment scores.

---

### Section 8: Multimodal Late Fusion & Engagement Index (Questions 49 to 54)

#### Q49: What is decision-level multimodal late fusion?
**Answer**: Late fusion trains individual models on separate input modalities (video frames for facial expression, audio for speech emotion) and combines their output probability distributions at the decision stage. This decouples sensor dependencies: if a student turns off their microphone, visual emotion recognition continues uninterrupted.

#### Q50: What exact late fusion formula is implemented in EduSense AI?
**Answer**: Implemented in `ai/multimodal_fusion.py`:
$$P_{\text{final}}(c) = w_{\text{face}} \cdot P_{\text{face}}(c) + w_{\text{speech}} \cdot P_{\text{speech}}(c)$$
where $w_{\text{face}} = 0.65$ and $w_{\text{speech}} = 0.35$ over the 5-class space (`neutral`, `happy`, `sad`, `angry`, `fear`).

#### Q51: How does the fusion model handle missing modalities?
**Answer**: 
* If speech is absent: $w_{\text{face}} = 1.0, w_{\text{speech}} = 0.0$ (`modality = "face_only"`).
* If face is absent: $w_{\text{face}} = 0.0, w_{\text{speech}} = 1.0$ (`modality = "speech_only"`).
* If neither is available: returns `dominant_emotion = "insufficient_data"`.

#### Q52: What is signal conflict detection in multimodal fusion?
**Answer**: When visual expressions and vocal expressions diverge with high individual certainty—specifically when $\arg\max(P_{\text{face}}) \neq \arg\max(P_{\text{speech}})$ and both individual confidences $\ge 0.50$ (e.g. smiling face with angry vocal tone)—the system sets `conflict_detected = True` and records an explanatory discrepancy string for teacher review.

#### Q53: What is the formula for the Composite Student Engagement Score?
**Answer**: Implemented in `analytics_service.py`:
$$E = \frac{w_{\text{att}} S_{\text{att}} + w_{\text{part}} S_{\text{part}} + w_{\text{sent}} S_{\text{sent}}}{w_{\text{att}} + w_{\text{part}} + w_{\text{sent}}}$$
where:
* $S_{\text{att}}$ = Attentiveness Subscore ($A \times 100$, base weight $w_{\text{att}} = 0.60$)
* $S_{\text{part}}$ = Participation Subscore (sample frequency, base weight $w_{\text{part}} = 0.25$)
* $S_{\text{sent}}$ = Normalized Sentiment Subscore ($\frac{C + 1}{2} \times 100$, base weight $w_{\text{sent}} = 0.15$)

#### Q54: What is dynamic weight re-normalization in engagement scoring?
**Answer**: If a student does not speak or post in chat during a lecture, their sentiment subscore is `None`. Rather than assigning a zero (which unfairly lowers their engagement grade), the system excludes $w_{\text{sent}}$ from the denominator, re-normalizing the composite score strictly over available signals ($w_{\text{att}} + w_{\text{part}} = 0.85 \to 1.0$).

---

### Section 9: Database, Security, Scalability & Viva Defense Scenarios (Questions 55 to 60)

#### Q55: How are passwords secured in the database?
**Answer**: Passwords are never stored in plaintext. They are hashed using **bcrypt** (via `passlib`) using salt rounds generated automatically by the library. Bcrypt incorporates a cryptographic work factor that protects against rainbow table attacks and brute-force GPU cracking.

#### Q56: How does the system protect student biometric data?
**Answer**: 
1. **No Raw Photo Storage**: Raw webcam frames are processed transiently in memory and never written to permanent disk storage or database tables.
2. **Mathematical Abstraction**: Only 512-dimensional floating-point embedding vectors are stored in PostgreSQL. These vectors cannot be reverse-engineered to reconstruct the student's original photographic likeness.
3. **Restricted Access**: Face verification endpoints strictly verify identity against the caller's own authenticated `user_id`.

#### Q57: How does a 5-minute rolling window aggregation work for classroom expressions?
**Answer**: Classroom time is partitioned into 300-second (5-minute) intervals relative to `session.actual_start_time`. For each student, all facial analysis observations falling within $[w_{\text{start}}, w_{\text{end}})$ are aggregated by averaging their probability distributions. Individual distributions are then aggregated across all active students to produce a classroom-wide expression distribution for that 5-minute block.

#### Q58: If 50 students join simultaneously, where will the computational bottleneck occur?
**Answer**: The bottleneck will occur at **AI inference execution** on the backend (specifically Whisper speech transcription and concurrent ONNX facial inference), not in WebRTC media transport (which LiveKit handles efficiently via C++ Go-routines). In production, this bottleneck is mitigated by:
1. Retaining the 4-second client sampling interval (clients stagger their requests).
2. Offloading inference to an asynchronous task queue (e.g. Celery + Redis).
3. Deploying models on dedicated GPU inference servers (e.g. NVIDIA Triton Inference Server).

#### Q59: What is the primary difference between Media Participant Capacity and AI Inference Capacity?
**Answer**: 
* **Media Participant Capacity**: The number of concurrent audio/video streams the LiveKit WebRTC SFU can forward without packet loss (typically hundreds of streams per core).
* **AI Inference Capacity**: The number of deep learning forward passes (SCRFD, ArcFace, FERPlus, Whisper) the backend hardware can compute per second. A server might comfortably stream video for 100 students while only having compute capacity to run AI inference on 10 frames per second.

#### Q60: As an AI/ML engineer, how do you defend the ethical boundaries of this project during viva?
**Answer**: "EduSense AI is designed as an **instructor-assistive tool**, not an autonomous surveillance or punitive system. First, facial expressions and text sentiment are explicitly documented as **observable behavioral proxies**, not definitive readings of internal emotional states or intellectual competence. Second, attendance verification incorporates temporal confirmation and provides instructors with manual override capabilities backed by transparent audit logs. Third, biometric privacy is preserved by strictly storing mathematical vectors rather than raw photographs. The system augments educator awareness rather than replacing human judgment."
