# EduSense AI: Methodology and Algorithms
## Mathematical Formulations, Implementation Algorithms, and Pseudocode

---

## 1. Overview & Methodological Framework

The EduSense AI methodology follows a rigorous, multi-stage engineering lifecycle designed for high-concurrency educational environments:

```
[ STAGE 1: Data Acquisition & Preprocessing ]
       │  (Webcam Frames & Microphone PCM Audio)
       ▼
[ STAGE 2: Quality Gating & Feature Extraction ]
       │  (SCRFD Face Detection, Laplacian Blur Filter, PyAV 16kHz Resampling)
       ▼
[ STAGE 3: Deep Neural Inference & Metric Extraction ]
       │  (ArcFace 512D Embeddings, FERPlus Calibrated Softmax, faster-whisper ASR)
       ▼
[ STAGE 4: Temporal Filtering & Decision Logic ]
       │  (3-Sample Attendance Confirmation, 5-Frame Emotion Smoother, Intent Detection)
       ▼
[ STAGE 5: Multimodal Late Fusion & Composite Engagement Indexing ]
       │  (Weighted Late Fusion, Signal Conflict Detection, Dynamic Normalization)
       ▼
[ STAGE 6: Persistence & Real-Time Dashboard Synthesis ]
          (PostgreSQL 16 ACID Storage, React 19 Interactive Visualization)
```

---

## 2. Mathematical Formulations & Theoretical Concepts

### 2.1 Additive Angular Margin Loss (ArcFace) for Biometric Recognition
Traditional Softmax classification in deep metric learning maps feature vectors to separable Euclidean hyperplanes without enforcing compact intra-class clustering. In biometric verification, the feature vector $\vec{x}_i \in \mathbb{R}^d$ of student $i$ must be discriminative against an open set of unseen identities.

ArcFace (Deng et al., 2019) normalizes both the weight vectors $\vec{W}_j$ and feature vectors $\vec{x}_i$ via L2-normalization:
$$\|\vec{W}_j\| = 1, \quad \|\vec{x}_i\| = 1$$
The dot product simplifies to the cosine of the angle between the weight vector and the feature vector:
$$\vec{W}_j^T \vec{x}_i = \|\vec{W}_j\| \|\vec{x}_i\| \cos \theta_j = \cos \theta_j$$

An additive angular margin penalty $m$ is incorporated directly into the target angle $\theta_{y_i}$:
$$L = -\frac{1}{N}\sum_{i=1}^N \log \frac{e^{s \cos(\theta_{y_i} + m)}}{e^{s \cos(\theta_{y_i} + m)} + \sum_{j \neq y_i} e^{s \cos \theta_j}}$$
where $s$ is the hypersphere radius scale parameter ($s = 64$) and $m$ is the additive angular margin ($m = 0.5$). 

During inference, given an enrolled normalized template vector $\hat{e}_{\text{enrolled}} \in \mathbb{R}^{512}$ and a live query vector $\hat{e}_{\text{query}} \in \mathbb{R}^{512}$, the identity distance is evaluated using **Cosine Similarity**:
$$\text{sim}(\hat{e}_{\text{query}}, \hat{e}_{\text{enrolled}}) = \hat{e}_{\text{query}} \cdot \hat{e}_{\text{enrolled}} = \sum_{k=1}^{512} e_{\text{query}, k} \cdot e_{\text{enrolled}, k}$$
Because the vectors are unit-normalized ($\|\hat{e}\|_2 = 1.0$), the cosine similarity ranges in $[-1.0, +1.0]$. The verification decision rule is:
$$\text{Decision} = \begin{cases} \text{Match Verified}, & \text{if } \text{sim} \ge 0.50 \\ \text{Mismatch / Impostor}, & \text{if } \text{sim} < 0.50 \end{cases}$$

---

### 2.2 Temperature Scaling for Calibrated Facial Expression Softmax
Deep neural networks frequently suffer from overconfidence: raw softmax probabilities do not accurately reflect the true likelihood of correct classification. In educational monitoring, false confidence in negative emotions can mislead instructors.

To address this, **Temperature Scaling** (Guo et al., 2017) is applied to the raw logit outputs $z \in \mathbb{R}^K$ of the FERPlus ONNX model. The calibrated probability distribution $\hat{P} \in \mathbb{R}^K$ over $K = 8$ classes is formulated as:
$$\hat{P}_i = \frac{\exp(z_i / T)}{\sum_{j=1}^K \exp(z_j / T)}$$
where $T > 0$ is the learned temperature parameter.
* If $T = 1.0$, the formulation returns uncalibrated softmax.
* If $T > 1.0$, the distribution softens, reducing overconfidence.
* In EduSense AI, the optimal temperature learned on the held-out validation split of the FERPlus dataset is:
  $$T_{\text{optimal}} = 0.9922$$
This achieves an Expected Calibration Error (ECE) of **$0.0197$ ($1.97\%$)**, ensuring that predicted probabilities accurately match empirical accuracy.

---

### 2.3 Rolling Exponential Moving Average Temporal Smoothing
Single video frames in webcam streams are susceptible to micro-flicker caused by lighting changes, blinking, or subtle head rotations. To prevent high-frequency prediction jitter on student video tiles, EduSense AI implements an exponentially decaying moving average smoother over a rolling window of $W = 5$ frames.

Let $P_t(c)$ be the probability of emotion class $c$ at frame $t$. For a history buffer of $N \le W$ frames, the weight $w_k$ assigned to historical frame $k$ (where $k = 0$ is the oldest and $k = N-1$ is the most recent) is:
$$w_k = \alpha^{(N - 1 - k)}$$
where the decay rate is $\alpha = 0.85$. The smoothed probability distribution $\bar{P}(c)$ is:
$$\bar{P}(c) = \frac{\sum_{k=0}^{N-1} w_k \cdot P_k(c)}{\sum_{k=0}^{N-1} w_k}$$
The smoothed dominant prediction is selected as $\arg\max_{c} \bar{P}(c)$ provided its confidence exceeds the threshold ($0.35$). The history buffer resets immediately if no face is detected or if face tracking is lost.

---

### 2.4 Geometric Head-Pose & Attentiveness Formulation
Attentiveness is modeled as a continuous angular deviation from the optical camera axis. Frontal face landmarks $(x, y, w, h)$ and dual ocular centers $(x_{\text{left}}, y_{\text{left}})$ and $(x_{\text{right}}, y_{\text{right}})$ are extracted.

1. **Horizontal Deviation (Yaw Angle $\psi$)**:
   $$\psi = \left(\frac{c_x - W_{\text{image}} / 2}{W_{\text{image}} / 2}\right) \times 45.0^\circ$$
2. **Vertical Deviation (Pitch Angle $\theta$)**:
   $$\theta = -\left(\frac{c_y - H_{\text{image}} / 2}{H_{\text{image}} / 2}\right) \times 30.0^\circ$$
3. **Planar Tilt (Roll Angle $\phi$)**:
   $$\phi = \arctan\left(\frac{y_{\text{right}} - y_{\text{left}}}{x_{\text{right}} - x_{\text{left}}}\right) \times \left(\frac{180^\circ}{\pi}\right)$$
4. **Total Angular Deviation ($D_{\text{total}}$)**:
   $$D_{\text{total}} = \sqrt{\theta^2 + \psi^2 + (0.5 \cdot \phi)^2}$$
5. **Continuous Attentiveness Score ($A$)**:
   $$A = \max\left(0.0, \, \min\left(1.0, \, 1.0 - \frac{D_{\text{total}}}{45.0^\circ}\right)\right)$$
A distraction event is flagged whenever $A < 0.50$ ($D_{\text{total}} > 22.5^\circ$), classified into:
* `looking_away` if $|\psi| > 30^\circ$
* `looking_down` if $\theta < -20^\circ$
* `looking_up` if $\theta > 25^\circ$
* `inattentive` otherwise

---

### 2.5 Transformer-Based Speech Recognition Formulation (Whisper)
Whisper uses an encoder-decoder Transformer. Audio is preprocessed into an 80-channel log-magnitude Mel-spectrogram computed over 25-millisecond windows with a 10-millisecond shift.

1. **Encoder**: Two 1D convolutional layers with filter width 3 and stride 2 downsample the Mel-spectrogram, followed by sinusoidal positional embeddings and $N_{\text{enc}}$ Transformer blocks with multi-head self-attention:
   $$\mathbf{H} = \text{Encoder}(\mathbf{X}_{\text{mel}})$$
2. **Decoder**: Autoregressively predicts target text tokens $y_t$ conditioned on preceding tokens $y_{<t}$ and encoder representations $\mathbf{H}$:
   $$P(y_t \mid y_{<t}, \mathbf{H}) = \text{Softmax}(\text{Decoder}(y_{<t}, \mathbf{H}))$$
3. **Regional Language Constraints**:
   To prevent subword looping in low-resource Dravidian scripts (such as Kannada), token logits are adjusted with a repetition penalty $\gamma = 1.15$ and a 3-gram constraint:
   $$z_i' = \begin{cases} z_i / \gamma, & \text{if token } i \text{ appeared in recent window and } z_i > 0 \\ z_i \cdot \gamma, & \text{if token } i \text{ appeared in recent window and } z_i \le 0 \\ z_i, & \text{otherwise} \end{cases}$$

---

### 2.6 VADER-Based Compound Valence Normalization
Text sentiment is scored by accumulating lexicon valence scores $v_i \in [-3.0, +3.0]$ across word tokens. For tokens preceded by negation terms, valence is inverted:
$$v_{\text{eff}} = -0.8 \cdot v_{\text{lexicon}}$$
The cumulative valence $V = \sum v_{\text{eff}}$ is normalized to a compound score $C \in [-1.0, +1.0]$ using a hyperbolic soft-clamping formula:
$$C = \frac{V}{\sqrt{V^2 + \alpha}}$$
where $\alpha = 15.0$ controls the saturation gradient. The sentiment label is assigned as:
$$\text{Label} = \begin{cases} \text{positive}, & C \ge +0.05 \\ \text{negative}, & C \le -0.05 \text{ or (is\_confusion is True)} \\ \text{neutral}, & -0.05 < C < +0.05 \end{cases}$$

---

### 2.7 Decision-Level Multimodal Late Fusion
Visual facial expression probabilities $P_{\text{face}} \in \mathbb{R}^5$ and vocal speech probabilities $P_{\text{speech}} \in \mathbb{R}^5$ are defined across the shared 5-class space $\mathcal{C} = \{\text{neutral}, \text{happy}, \text{sad}, \text{angry}, \text{fear}\}$.

The fused probability distribution $P_{\text{fused}}(c)$ is calculated as:
$$P_{\text{fused}}(c) = w_{\text{face}} \cdot \tilde{P}_{\text{face}}(c) + w_{\text{speech}} \cdot \tilde{P}_{\text{speech}}(c)$$
where weights are normalized: $w_{\text{face}} = 0.65$ and $w_{\text{speech}} = 0.35$ ($w_{\text{face}} + w_{\text{speech}} = 1.0$).
* **Graceful Degradation**:
  * If speech is absent: $w_{\text{face}} = 1.0, w_{\text{speech}} = 0.0$ (`modality = "face_only"`).
  * If face is absent: $w_{\text{face}} = 0.0, w_{\text{speech}} = 1.0$ (`modality = "speech_only"`).
  * If both are absent: `dominant_emotion = "insufficient_data"`.
* **Signal Conflict Condition**:
  $$\text{Conflict} = \left(\arg\max P_{\text{face}} \neq \arg\max P_{\text{speech}}\right) \land \left(\max P_{\text{face}} \ge 0.50\right) \land \left(\max P_{\text{speech}} \ge 0.50\right)$$

---

### 2.8 Dynamic Weight-Renormalized Composite Engagement Scoring
Student engagement $E \in [0.0, 100.0\%]$ integrates three independent signals:
1. $S_{\text{att}} \in [0, 100]$: Mean Attentiveness Subscore ($A \times 100$).
2. $S_{\text{part}} \in [0, 100]$: Participation Subscore based on sample and interaction frequency ($\min(100.0, (\text{samples}/10) \times 100)$).
3. $S_{\text{sent}} \in [0, 100]$: Normalized Sentiment Subscore:
   $$S_{\text{sent}} = \left(\frac{C + 1.0}{2.0}\right) \times 100.0$$

Let $\mathcal{A} \subseteq \{\text{att}, \text{part}, \text{sent}\}$ be the set of currently available (non-null) signals. The composite engagement score is:
$$E = \frac{\sum_{m \in \mathcal{A}} w_m \cdot S_m}{\sum_{m \in \mathcal{A}} w_m}$$
with base weights $w_{\text{att}} = 0.60$, $w_{\text{part}} = 0.25$, and $w_{\text{sent}} = 0.15$. If a signal is unavailable (e.g. no speech or chat), its weight is excluded, dynamically re-normalizing the remaining signals so students are not penalized for missing modalities.

---

## 3. Implemented Algorithms & Detailed Pseudocode

### Algorithm 1: Face Quality Gating and SCRFD/ArcFace Embedding Generation
* **Module**: `backend/app/services/face_service.py`
* **Purpose**: Validates camera frames and extracts 512D biometric vectors.

```python
"""
ALGORITHM 1: Face Quality Gating & 512D ArcFace Embedding Extraction
Input: base64_image string
Output: (passed: bool, message: str, embedding: List[float] or None, details: dict)
"""
function process_frame(base64_image):
    image = decode_base64_to_bgr(base64_image)
    if image is None:
        return (False, "Invalid image encoding", None, None)
    
    height, width = image.shape[0], image.shape[1]
    faces = scrfd_detector.detect(image)
    num_faces = len(faces)
    
    if num_faces == 0:
        return (False, "Position your face inside the frame", None, None)
    if num_faces > 1:
        return (False, "Only one face should be visible during enrollment", None, None)
        
    target_face = faces[0]
    bbox = target_face.bbox # [x1, y1, x2, y2]
    w_face = bbox[2] - bbox[0]
    h_face = bbox[3] - bbox[1]
    
    # 1. Size Check
    if w_face < 100 or h_face < 100:
        return (False, "Face too small. Move closer to the camera.", None, {"w": w_face, "h": h_face})
        
    # 2. Blur / Sharpness Check
    crop_gray = convert_to_grayscale(crop_face(image, bbox, padding=0.10))
    blur_score = variance_of_laplacian(crop_gray)
    if blur_score < 30.0:
        return (False, "Image too blurry. Hold steady.", None, {"blur": blur_score})
        
    # 3. Brightness Check
    avg_brightness = mean(crop_gray)
    if avg_brightness < 40.0:
        return (False, "Too dark. Please increase light.", None, {"brightness": avg_brightness})
    if avg_brightness > 235.0:
        return (False, "Too bright/glared. Adjust light.", None, {"brightness": avg_brightness})
        
    # 4. Centering Feedback
    cx_offset = ((bbox[0] + bbox[2]) / 2.0 - width / 2.0) / width
    cy_offset = ((bbox[1] + bbox[3]) / 2.0 - height / 2.0) / height
    feedback = "Good quality — capture"
    if cx_offset < -0.18: feedback = "Move slightly right"
    elif cx_offset > 0.18: feedback = "Move slightly left"
    elif cy_offset < -0.18: feedback = "Move slightly down"
    elif cy_offset > 0.18: feedback = "Move slightly up"
    
    # 5. ArcFace 512D Embedding Generation & Normalization
    raw_embedding = arcface_extractor.get_embedding(image, target_face)
    norm = l2_norm(raw_embedding)
    normalized_vec = raw_embedding / norm if norm > 0 else raw_embedding
    
    details = {"face_w": w_face, "face_h": h_face, "blur": blur_score, "brightness": avg_brightness}
    return (True, feedback, to_list(normalized_vec), details)
```

---

### Algorithm 2: Multi-Sample Face Enrollment & Consistency Verification
* **Module**: `backend/app/api/face.py` and `backend/app/services/face_service.py`
* **Purpose**: Verifies sample homogeneity and stores mean template in PostgreSQL.

```python
"""
ALGORITHM 2: Guided Face Enrollment & Sample Consistency Check
Input: sample_embeddings: List[List[float]] of length 5
Output: EnrollmentCompleteResponse or Error
"""
function complete_face_enrollment(student_id, sample_embeddings):
    if len(sample_embeddings) != 5:
        raise HTTPException(400, "Enrollment requires exactly 5 quality face samples.")
        
    # Compute Pairwise Cosine Similarity Matrix
    M = matrix(sample_embeddings) # Shape 5x5
    sim_matrix = dot_product(M, transpose(M))
    
    pairwise_similarities = []
    for i from 0 to 4:
        for j from i + 1 to 4:
            pairwise_similarities.append(sim_matrix[i, j])
            
    avg_consistency = mean(pairwise_similarities)
    
    if avg_consistency < 0.40:
        raise HTTPException(400, f"Inconsistent face samples detected (score: {avg_consistency}). Re-enroll.")
        
    # Compute Mean Normalized Embedding
    mean_vec = mean(M, axis=0)
    norm = l2_norm(mean_vec)
    mean_normalized = mean_vec / norm if norm > 0 else mean_vec
    
    embedding_payload = {
        "mean_embedding": to_list(mean_normalized),
        "sample_embeddings": sample_embeddings,
        "num_samples": 5,
        "consistency_score": round(avg_consistency, 4),
        "enrolled_at": current_timestamp_iso()
    }
    
    db.upsert_face_embedding(student_id=student_id, embedding_data=embedding_payload, embedding_dim=512)
    return Success(enrolled_at=current_timestamp_iso(), consistency_score=avg_consistency)
```

---

### Algorithm 3: Automated Attendance with 3-Sample Temporal Confirmation
* **Module**: `backend/app/api/attendance.py`
* **Purpose**: Prevents false presence marks and records continuous engagement duration.

```python
"""
ALGORITHM 3: Automated Attendance Verification with Temporal Confirmation
Input: session_id, student_id, base64_image
Output: AttendanceVerificationResponse
"""
function verify_attendance(session_id, student_id, base64_image):
    session = db.get_session(session_id)
    if session.status != "ACTIVE":
        raise HTTPException(400, "Attendance can only be submitted for ACTIVE sessions")
        
    enrolled_data = db.get_face_embedding(student_id)
    if enrolled_data is None:
        return {"verified": False, "reason": "NOT_ENROLLED", "status": "UNVERIFIED"}
        
    eval_result = face_service.process_attendance_frame(base64_image, enrolled_data)
    now = current_utc_time()
    record = db.get_attendance_record(session_id, student_id)
    
    if not eval_result["matched"]:
        confirmed_count = record.verification_count if record else 0
        current_status = record.status if record else "UNVERIFIED"
        verified_flag = (confirmed_count >= 3)
        return {
            "verified": verified_flag,
            "reason": eval_result["reason"], # "FACE_MISMATCH", "LOW_QUALITY", "NO_FACE"
            "status": current_status,
            "samples_confirmed": confirmed_count,
            "samples_required": 3
        }
        
    # Match Succeeded
    if record is None:
        record = db.create_attendance_record(
            session_id=session_id,
            student_id=student_id,
            status="UNVERIFIED",
            marked_at=now,
            first_verified_at=now,
            last_verified_at=now,
            verification_count=1,
            presence_duration_seconds=0
        )
    else:
        record.verification_count += 1
        if record.first_verified_at is None:
            record.first_verified_at = now
        record.last_verified_at = now
        record.presence_duration_seconds = int((now - record.first_verified_at).total_seconds())
        
    # Temporal Confirmation Check (Threshold = 3)
    if record.verification_count >= 3 and not record.is_manually_corrected:
        if record.status in ("UNVERIFIED", "ABSENT"):
            session_start = session.actual_start_time or session.scheduled_start_time
            late_cutoff = session_start + 15 minutes
            
            if record.first_verified_at <= late_cutoff:
                record.status = "PRESENT"
            else:
                record.status = "LATE"
                
    db.commit(record)
    return {
        "verified": (record.verification_count >= 3),
        "reason": "CONFIRMED" if record.verification_count >= 3 else "PENDING_TEMPORAL",
        "status": record.status,
        "samples_confirmed": record.verification_count,
        "samples_required": 3
    }
```

---

### Algorithm 4: Facial Emotion Recognition & Softmax Calibration
* **Module**: `ai/facial_emotion.py`
* **Purpose**: Infers student emotion using FERPlus ONNX with temperature scaling.

```python
"""
ALGORITHM 4: FERPlus ONNX Facial Emotion Recognition & Softmax Calibration
Input: face_crop_bgr (NumPy array)
Output: (dominant_emotion, emotion_probabilities, confidence, raw_dominant, raw_probs, status)
"""
function infer_facial_emotion(face_crop_bgr, model_session, temp=0.9922, threshold=0.35):
    # 1. Preprocessing Contract
    gray = convert_to_grayscale(face_crop_bgr)
    resized = resize(gray, width=64, height=64)
    input_tensor = reshape_to_nchw(resized, shape=[1, 1, 64, 64]).astype(float32)
    
    # 2. ONNX Inference
    logits = model_session.run(input_tensor)[0][0] # 8 logits
    
    # 3. Temperature Scaled Softmax
    scaled_logits = logits / temp
    exp_logits = exp(scaled_logits - max(scaled_logits))
    probs = exp_logits / sum(exp_logits)
    
    classes_8 = ["neutral", "happy", "surprise", "sad", "angry", "disgust", "fear", "contempt"]
    raw_probs = {classes_8[i]: round(probs[i], 4) for i in range(8)}
    
    top_idx = argmax(probs)
    raw_dominant = classes_8[top_idx]
    top_prob = probs[top_idx]
    confidence = round(top_prob, 3)
    
    # 4. Map to EduSense 5-Class Allowed Set
    allowed_5 = ["neutral", "happy", "sad", "angry", "fear"]
    mapped_probs = {c: raw_probs[c] for c in allowed_5}
    
    if top_prob < threshold:
        dominant_emotion = "uncertain"
        status = "low_confidence"
    elif raw_dominant in allowed_5:
        dominant_emotion = raw_dominant
        status = "valid_prediction"
    else:
        # Outside allowed set (surprise, disgust, contempt) -> marked uncertain
        dominant_emotion = "uncertain"
        status = "valid_prediction"
        
    return (dominant_emotion, mapped_probs, confidence, raw_dominant, raw_probs, status)
```

---

### Algorithm 5: Rolling Temporal Smoothing (`EmotionTemporalSmoother`)
* **Module**: `ai/facial_emotion.py`
* **Purpose**: Filters high-frequency video frame flicker using exponential weights.

```python
"""
ALGORITHM 5: Rolling Temporal Emotion Smoother
Parameters: window_size = 5, decay = 0.85
"""
class EmotionTemporalSmoother:
    def __init__(self, window_size=5, decay=0.85):
        self.window_size = window_size
        self.decay = decay
        self.history = []

    def update(self, raw_probs, face_detected):
        if not face_detected or not raw_probs:
            self.history.clear()
            return ("uncertain", {c: 0.0 for c in ALLOWED_5}, 0.0)

        self.history.append(raw_probs)
        if len(self.history) > self.window_size:
            self.history.pop(0)

        N = len(self.history)
        weights = [self.decay ** (N - 1 - i) for i in range(N)]
        total_w = sum(weights)

        smoothed = {c: 0.0 for c in raw_probs}
        for w, item in zip(weights, self.history):
            for c, prob in item.items():
                smoothed[c] += prob * w

        for c in smoothed:
            smoothed[c] = round(smoothed[c] / total_w, 4)

        top_emotion = max(smoothed, key=lambda c: smoothed[c])
        confidence = smoothed[top_emotion]
        return (top_emotion, smoothed, confidence)

    def reset(self):
        self.history.clear()
```

---

### Algorithm 6: Geometric Head Pose & Attentiveness Estimation
* **Module**: `ai/facial_emotion.py`
* **Purpose**: Calculates Euler angles and flags inattention events.

```python
"""
ALGORITHM 6: Geometric Head Pose & Attentiveness Estimation
Input: face_bbox (x, y, w, h), image_dimensions (W, H), face_roi_gray
Output: (pitch, yaw, roll, orientation, attentiveness_score, is_distracted, distraction_type)
"""
function estimate_pose_and_attention(x, y, w, h, W, H, face_roi_gray):
    face_cx = x + w / 2.0
    face_cy = y + h / 2.0
    
    # Geometric Angles
    yaw = ((face_cx - W / 2.0) / (W / 2.0)) * 45.0
    pitch = -((face_cy - H / 2.0) / (H / 2.0)) * 30.0
    
    eyes = eye_cascade.detect(face_roi_gray)
    roll = 0.0
    if len(eyes) >= 2:
        sorted_eyes = sort_by_x(eyes)
        e1, e2 = sorted_eyes[0], sorted_eyes[1]
        dx = (e2.x + e2.w / 2) - (e1.x + e1.w / 2)
        dy = (e2.y + e2.h / 2) - (e1.y + e1.h / 2)
        if dx != 0:
            roll = degrees(atan2(dy, dx))
            
    # Attentiveness Score
    total_deviation = sqrt(pitch^2 + yaw^2 + (0.5 * roll)^2)
    attentiveness_score = max(0.0, min(1.0, 1.0 - (total_deviation / 45.0)))
    
    is_distracted = (attentiveness_score < 0.50)
    distraction_type = None
    if is_distracted:
        if abs(yaw) > 30.0: distraction_type = "looking_away"
        elif pitch < -20.0: distraction_type = "looking_down"
        elif pitch > 25.0: distraction_type = "looking_up"
        else: distraction_type = "inattentive"
        
    return (pitch, yaw, roll, attentiveness_score, is_distracted, distraction_type)
```

---

### Algorithm 7: Multilingual Speech Transcription (Whisper)
* **Module**: `ai/speech_transcriber.py`
* **Purpose**: Decodes 16 kHz audio with VAD and native language conditioning.

```python
"""
ALGORITHM 7: Multilingual Speech Transcription with faster-whisper
Input: audio_bytes, language ("auto", "en", "kn", "hi")
Output: TranscriptionResponse
"""
function transcribe_speech(audio_bytes, language):
    audio_array = pyav_decode_to_16khz_mono(audio_bytes)
    duration = len(audio_array) / 16000.0
    
    rms = sqrt(mean(audio_array^2))
    if duration < 0.25 or rms < 0.003:
        return {"valid_input": True, "text": "", "quality_status": "silence"}
        
    target_lang = None if language in ("auto", "none", "") else language
    initial_prompt = LANGUAGE_PROMPTS.get(target_lang)
    
    # Set regional repetition penalties
    rep_penalty = 1.15 if target_lang == "kn" else 1.0
    ngram_size = 3 if target_lang == "kn" else 0
    
    segments_iter, info = whisper_model.transcribe(
        audio_array,
        language=target_lang,
        beam_size=5,
        temperature=0.0,
        vad_filter=True,
        initial_prompt=initial_prompt,
        repetition_penalty=rep_penalty,
        no_repeat_ngram_size=ngram_size
    )
    
    text_pieces = []
    for seg in segments_iter:
        clean_text = seg.text.strip()
        # Filter pure silence hallucinations
        if is_hallucination(clean_text) and (seg.no_speech_prob > 0.35 or seg.avg_logprob < -0.75):
            continue
        text_pieces.append(clean_text)
        
    full_text = " ".join(text_pieces).strip()
    detected_lang = info.language if info else target_lang
    
    # Script verification for Auto-Detect
    if not target_lang and full_text:
        if regex_match(r'[\u0C80-\u0CFF]', full_text): detected_lang = "kn"
        elif regex_match(r'[\u0900-\u097F]', full_text): detected_lang = "hi"
        elif regex_match(r'[a-zA-Z]', full_text): detected_lang = "en"
        
    is_low_conf = (detected_lang == "kn") # Kannada is low-resource in base/small
    return {
        "text": full_text,
        "language": detected_lang,
        "duration": duration,
        "is_low_confidence": is_low_conf
    }
```

---

### Algorithm 8: Lexicon-Based Valence Scoring & Intent Detection
* **Module**: `ai/sentiment_analyzer.py`
* **Purpose**: Evaluates text sentiment and detects confusion and question markers.

```python
"""
ALGORITHM 8: Rule-Based Valence Scoring & Intent Detection
Input: text (str), language (str)
Output: SentimentAnalysisResult
"""
function analyze_text_sentiment(text, language="en"):
    if not text or not text.strip():
        return {"valid_input": False, "sentiment_score": None, "sentiment_label": "neutral"}
        
    cleaned = text.strip()
    
    # Language check: declare non-English unsupported for rule-based lexicon
    if regex_match(r'[\u0C80-\u0CFF]', cleaned) or language == "kn":
        return {"sentiment_score": None, "sentiment_label": "unsupported_language", "language_supported": False}
    if regex_match(r'[\u0900-\u097F]', cleaned) or language == "hi":
        return {"sentiment_score": None, "sentiment_label": "unsupported_language", "language_supported": False}
        
    tokens = regex_findall(r"\b\w+\b", cleaned.lower())
    total_valence = 0.0
    words_scored = 0
    
    for i, token in enumerate(tokens):
        if token in BETA_LEXICON:
            val = BETA_LEXICON[token]
            if i > 0 and tokens[i - 1] in NEGATIONS:
                val = -val * 0.8 # Invert with dampening
            total_valence += val
            words_scored += 1
            
    # Compound Normalization
    if words_scored > 0:
        compound = total_valence / sqrt(total_valence^2 + 15.0)
    else:
        compound = 0.0
        
    is_question = ("?" in cleaned) or (len(tokens) > 0 and tokens[0] in QUESTION_WORDS)
    is_confusion = any(term in cleaned.lower() for term in CONFUSION_TERMS)
    
    if compound >= 0.05: sentiment_label = "positive"
    elif compound <= -0.05: sentiment_label = "negative"
    elif is_confusion and not is_question: sentiment_label = "negative"
    else: sentiment_label = "neutral"
    
    conf = round(min(0.95, 0.60 + 0.35 * abs(compound)), 2) if words_scored > 0 else 0.75
    return {
        "valid_input": True,
        "sentiment_score": round(compound, 3),
        "sentiment_label": sentiment_label,
        "is_question": is_question,
        "is_confusion": is_confusion,
        "confidence": conf
    }
```

---

### Algorithm 9: Weighted Decision-Level Multimodal Late Fusion
* **Module**: `ai/multimodal_fusion.py`
* **Purpose**: Integrates visual and speech distributions with conflict detection.

```python
"""
ALGORITHM 9: Multimodal Late Fusion with Conflict Detection
Input: face_probabilities, speech_probabilities, face_confidence, speech_confidence
Output: Fused Emotion Dictionary
"""
function fuse_multimodal_emotions(P_face, P_speech, conf_face, conf_speech):
    has_face = validate_distribution(P_face)
    has_speech = validate_distribution(P_speech)
    
    if not has_face and not has_speech:
        return {"dominant_emotion": "insufficient_data", "modality": "none"}
    if has_face and not has_speech:
        norm_face = normalize_sum_to_one(P_face)
        return {"dominant_emotion": argmax(norm_face), "fused_probabilities": norm_face, "modality": "face_only"}
    if has_speech and not has_face:
        norm_speech = normalize_sum_to_one(P_speech)
        return {"dominant_emotion": argmax(norm_speech), "fused_probabilities": norm_speech, "modality": "speech_only"}
        
    # True Late Fusion
    w_face = 0.65
    w_speech = 0.35
    norm_face = normalize_sum_to_one(P_face)
    norm_speech = normalize_sum_to_one(P_speech)
    
    classes = ["neutral", "happy", "sad", "angry", "fear"]
    P_fused = {}
    for c in classes:
        P_fused[c] = round(w_face * norm_face[c] + w_speech * norm_speech[c], 4)
        
    dominant = max(classes, key=lambda c: P_fused[c])
    combined_conf = round(P_fused[dominant], 3)
    
    top_face = max(classes, key=lambda c: norm_face[c])
    top_speech = max(classes, key=lambda c: norm_speech[c])
    
    conflict = (top_face != top_speech) and (norm_face[top_face] >= 0.50) and (norm_speech[top_speech] >= 0.50)
    conflict_reason = None
    if conflict:
        conflict_reason = f"Divergence: visual face='{top_face}' vs vocal speech='{top_speech}'"
        
    return {
        "dominant_emotion": dominant,
        "fused_probabilities": P_fused,
        "confidence": combined_conf,
        "modality": "bimodal",
        "conflict_detected": conflict,
        "conflict_reason": conflict_reason
    }
```

---

### Algorithm 10: Dynamic Weight-Renormalized Composite Engagement Scoring
* **Module**: `backend/app/services/analytics_service.py`
* **Purpose**: Calculates overall engagement percentage handling missing signals.

```python
"""
ALGORITHM 10: Dynamic Weight-Renormalized Composite Engagement Scoring
Input: attentiveness_sub (0..100), participation_sub (0..100), sentiment_sub (0..100)
Output: composite_score (0..100) or None
"""
function calculate_composite_engagement(attentiveness_sub, participation_sub, sentiment_sub):
    signals = []
    w_att = 0.60
    w_part = 0.25
    w_sent = 0.15
    
    if attentiveness_sub is not None:
        signals.append((clamp(attentiveness_sub, 0.0, 100.0), w_att))
    if participation_sub is not None:
        signals.append((clamp(participation_sub, 0.0, 100.0), w_part))
    if sentiment_sub is not None:
        signals.append((clamp(sentiment_sub, 0.0, 100.0), w_sent))
        
    if len(signals) == 0:
        return None
        
    total_weight = sum(w for score, w in signals)
    weighted_sum = sum(score * w for score, w in signals)
    
    composite = weighted_sum / total_weight
    return round(composite, 2)
```
