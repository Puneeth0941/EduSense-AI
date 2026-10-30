# EduSense AI: References & Bibliography
## Academic Research Papers, Technical Specifications, and Official Framework Documentation

---

### 1. Biometric Face Detection & Recognition Literature

1. **Deng, J., Guo, J., Xue, N., & Zafeiriou, S.** (2019).
   *ArcFace: Additive Angular Margin Loss for Deep Face Recognition.*
   In *Proceedings of the IEEE/CVF Conference on Computer Vision and Pattern Recognition (CVPR)*, pp. 4690–4699.
   *DOI*: [10.1109/CVPR.2019.00482](https://doi.org/10.1109/CVPR.2019.00482)  
   *Relevance*: Provides the mathematical foundation for the ArcFace MobileFaceNet 512-dimensional normalized embedding model utilized in `backend/app/services/face_service.py`.

2. **Guo, J., Deng, J., Xue, N., & Zafeiriou, S.** (2021).
   *Sample and Computation Redistribution for Efficient Face Detection (SCRFD).*
   *arXiv preprint arXiv:2105.04714*.
   *Link*: [https://arxiv.org/abs/2105.04714](https://arxiv.org/abs/2105.04714)  
   *Relevance*: The core face detection architecture used in InsightFace `buffalo_sc` (`det_500m.onnx`), optimizing multi-scale feature pyramids for low-latency CPU face localization.

3. **Schroff, F., Kalenichenko, D., & Philbin, J.** (2015).
   *FaceNet: A Unified Embedding for Face Recognition and Clustering.*
   In *Proceedings of the IEEE Conference on Computer Vision and Pattern Recognition (CVPR)*, pp. 815–823.
   *DOI*: [10.1109/CVPR.2015.7298682](https://doi.org/10.1109/CVPR.2015.7298682)  
   *Relevance*: Introduced the concept of mapping facial crops directly into compact Euclidean hyperspheres where distance directly reflects facial similarity.

4. **Chen, S., Liu, Y., Gao, X., & Han, Z.** (2018).
   *MobileFaceNets: Efficient CNNs for Accurate Real-Time Face Verification on Mobile Devices.*
   In *Chinese Conference on Biometric Recognition (CCBR)*, pp. 428–438.
   *DOI*: [10.1007/978-3-319-97909-0_46](https://doi.org/10.1007/978-3-319-97909-0_46)  
   *Relevance*: Lightweight deep neural network backbone employed in ArcFace (`w600k_mbf.onnx`) enabling real-time 512-dimensional embedding extraction on CPU hardware.

---

### 2. Facial Expression Recognition & Affective Computing Literature

5. **Barsoum, E., Zhang, C., Ferrer, C. C., & Zhang, Z.** (2016).
   *Training Deep Networks for Facial Expression Recognition with Crowd-Sourced Label Distribution.*
   In *Proceedings of the 18th ACM International Conference on Multimodal Interaction (ICMI '16)*, pp. 279–283.
   *DOI*: [10.1145/2993148.2993165](https://doi.org/10.1145/2993148.2993165)  
   *Relevance*: The benchmark training dataset and crowd-sourced distribution utilized by the primary emotion model in `ai/models/emotion-ferplus.onnx`.

6. **Savchenko, A. V.** (2021).
   *Facial Expression and Attributes Recognition Based on Multi-Task Learning of Lightweight Neural Networks.*
   In *Proceedings of the IEEE/CVF International Conference on Computer Vision (ICCV) Workshops*, pp. 1196–1203.
   *DOI*: [10.1109/ICCVW54120.2021.00138](https://doi.org/10.1109/ICCVW54120.2021.00138)  
   *Relevance*: Foundation of the EmotiEffLib fallback backend (`enet_b0_8_best_vgaf`), deploying EfficientNet-B0 for multi-class affective classification.

7. **Guo, C., Pleiss, G., Sun, Y., & Weinberger, K. Q.** (2017).
   *On Calibration of Modern Neural Networks.*
   In *Proceedings of the 34th International Conference on Machine Learning (ICML)*, PMLR 70, pp. 1321–1330.
   *Link*: [https://proceedings.mlr.press/v70/guo17a.html](https://proceedings.mlr.press/v70/guo17a.html)  
   *Relevance*: Mathematical formulation for Temperature Scaling ($T=0.9922$) utilized in `ai/facial_emotion.py` to minimize Expected Calibration Error.

8. **Ekman, P.** (1993).
   *Facial Expression and Emotion.*
   *American Psychologist*, 48(4), pp. 384–392.
   *DOI*: [10.1037/0003-066X.48.4.384](https://doi.org/10.1037/0003-066X.48.4.384)  
   *Relevance*: Classical psychological framing of universal facial Action Units, establishing the academic boundary that observable facial muscle patterns are behavioral proxies rather than absolute mental states.

9. **Picard, R. W.** (1997).
   *Affective Computing.*
   MIT Press, Cambridge, MA.
   *ISBN*: 9780262161701.  
   *Relevance*: Foundational framework for integrating affective sensing into computer-assisted instruction.

---

### 3. Speech Recognition & Multimodal Analytics Literature

10. **Radford, A., Kim, J. W., Xu, T., Brockman, G., McLeavey, C., & Sutskever, I.** (2022).
    *Robust Speech Recognition via Large-Scale Weak Supervision.*
    *OpenAI Technical Report / arXiv:2212.04356*.
    *Link*: [https://arxiv.org/abs/2212.04356](https://arxiv.org/abs/2212.04356)  
    *Relevance*: The underlying Transformer encoder-decoder architecture deployed via `faster-whisper` for multilingual classroom transcription.

11. **Hutto, C. J., & Gilbert, E.** (2014).
    *VADER: A Parsimonious Rule-Based Model for Sentiment Analysis of Social Media Text.*
    In *Proceedings of the International AAAI Conference on Web and Social Media (ICWSM)*, 8(1), pp. 216–225.
    *DOI*: [10.1609/icwsm.v8i1.14550](https://doi.org/10.1609/icwsm.v8i1.14550)  
    *Relevance*: Theoretical foundation for the normalized compound valence scoring and negation scaling algorithm implemented in `ai/sentiment_analyzer.py`.

12. **Atrey, P. K., Hossain, M. A., El Saddik, A., & Kankanhalli, M. S.** (2010).
    *Multimodal Fusion for Multimedia Analysis: A Survey.*
    *Multimedia Systems*, 16(6), pp. 345–379.
    *DOI*: [10.1007/s00530-010-0182-0](https://doi.org/10.1007/s00530-010-0182-0)  
    *Relevance*: Evaluates early versus late fusion taxonomies, justifying the weighted linear late fusion architecture implemented in `ai/multimodal_fusion.py`.

---

### 4. Official Framework Documentation & Standards

13. **FastAPI Documentation**:
    * Tiangolo, S. (2024). *FastAPI Framework, High Performance, Easy to Learn, Fast to Code.*
    * URL: [https://fastapi.tiangolo.com/](https://fastapi.tiangolo.com/)

14. **InsightFace Documentation**:
    * DeepInsight. (2024). *InsightFace: 2D and 3D Face Analysis Project.*
    * URL: [https://github.com/deepinsight/insightface](https://github.com/deepinsight/insightface)

15. **faster-whisper & CTranslate2 Documentation**:
    * Klein, G. et al. (2024). *faster-whisper: Faster Whisper Transcription with CTranslate2.*
    * URL: [https://github.com/SYSTRAN/faster-whisper](https://github.com/SYSTRAN/faster-whisper)

16. **LiveKit Real-Time WebRTC Documentation**:
    * LiveKit Inc. (2024). *LiveKit Open Source WebRTC Stack for Audio, Video, and Data.*
    * URL: [https://docs.livekit.io/](https://docs.livekit.io/)

17. **ONNX Runtime Engine**:
    * Microsoft Corporation. (2024). *ONNX Runtime: Cross-Platform High-Performance Scoring Engine.*
    * URL: [https://onnxruntime.ai/](https://onnxruntime.ai/)

18. **SQLAlchemy 2.0 ORM Reference**:
    * Bayer, M. (2024). *The Python SQL Toolkit and Object Relational Mapper.*
    * URL: [https://docs.sqlalchemy.org/en/20/](https://docs.sqlalchemy.org/en/20/)

19. **PostgreSQL 16 Documentation**:
    * The PostgreSQL Global Development Group. (2024). *PostgreSQL 16.0 Documentation.*
    * URL: [https://www.postgresql.org/docs/16/](https://www.postgresql.org/docs/16/)

20. **React 19 Documentation**:
    * Meta Platforms Inc. (2024). *React: The Library for Web and Native User Interfaces.*
    * URL: [https://react.dev/](https://react.dev/)
