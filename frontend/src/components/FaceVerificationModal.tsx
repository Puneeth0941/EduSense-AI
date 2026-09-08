import React, { useState, useEffect, useRef, useCallback } from 'react';
import { faceApi } from '../services/api';
import type { FaceVerificationResponse, FaceCaptureResponse } from '../types';
import {
  Camera,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  X,
  Sparkles,
  ScanFace,
  VideoOff,
} from 'lucide-react';

interface FaceVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FaceVerificationModal: React.FC<FaceVerificationModalProps> = ({
  isOpen,
  onClose,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Real-time frame feedback state
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [qualityFeedback, setQualityFeedback] = useState<string>('Position your face inside the frame');
  const [isFrameValid, setIsFrameValid] = useState(false);
  const [numFacesDetected, setNumFacesDetected] = useState<number>(0);

  // Verification process state
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<FaceVerificationResponse | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  // Initialize webcam stream
  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setCameraActive(true);
        };
      }
    } catch (err: any) {
      console.error('Camera error in verification modal:', err);
      setCameraError('Camera access denied or device unavailable. Please check permissions.');
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
      setCameraActive(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setVerificationResult(null);
      setVerificationError(null);
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  // Capture frame helper as base64 jpeg
  const captureFrameBase64 = useCallback((): string | null => {
    if (!videoRef.current || !cameraActive) return null;
    const video = videoRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return null;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  }, [cameraActive]);

  // Periodic frame quality evaluation when camera is active and no result yet
  useEffect(() => {
    if (!isOpen || !cameraActive || isVerifying || verificationResult !== null) return;

    const interval = setInterval(async () => {
      if (isEvaluating) return;
      const frameB64 = captureFrameBase64();
      if (!frameB64) return;

      try {
        setIsEvaluating(true);
        const res: FaceCaptureResponse = await faceApi.captureSample(frameB64, 'verification');
        setNumFacesDetected(res.num_faces);
        setQualityFeedback(res.message);
        setIsFrameValid(res.passed);
      } catch (err: any) {
        setQualityFeedback('Position your face inside the frame');
        setIsFrameValid(false);
      } finally {
        setIsEvaluating(false);
      }
    }, 1200);

    return () => clearInterval(interval);
  }, [isOpen, cameraActive, isVerifying, verificationResult, captureFrameBase64, isEvaluating]);

  // Trigger verification API with a FRESH webcam frame
  const handleVerifyFace = async () => {
    const frameB64 = captureFrameBase64();
    if (!frameB64) {
      setVerificationError('Unable to capture webcam frame for verification.');
      return;
    }

    try {
      setIsVerifying(true);
      setVerificationError(null);
      setVerificationResult(null);

      const response = await faceApi.verifyFace(frameB64);
      setVerificationResult(response);
    } catch (err: any) {
      setVerificationError(err.message || 'Verification request failed.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleTryAgain = () => {
    setVerificationResult(null);
    setVerificationError(null);
    setQualityFeedback('Position your face inside the frame');
    setIsFrameValid(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl p-6 md:p-8 space-y-6 shadow-2xl relative overflow-hidden">
        {/* MODAL HEADER */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
              <ScanFace className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">New-Face Identity Verification</h3>
              <p className="text-xs text-slate-400">Validate enrolled face against a fresh webcam image</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-all border border-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ERROR DISPLAY */}
        {verificationError && (
          <div className="flex items-center gap-3 p-4 bg-red-950/60 border border-red-800/60 rounded-2xl text-red-200 text-xs">
            <AlertCircle className="w-5 h-5 shrink-0 text-red-400" />
            <span className="flex-1 font-medium">{verificationError}</span>
            <button
              onClick={() => setVerificationError(null)}
              className="text-red-400 hover:text-white text-xs underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* VERIFICATION RESULT STATE 1: SUCCESS ✅ */}
        {verificationResult && verificationResult.verified ? (
          <div className="bg-slate-950/80 border border-emerald-500/40 rounded-3xl p-6 text-center space-y-5 shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/10">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-950 px-3 py-1 rounded-full border border-emerald-800/50">
                Match Confirmed
              </span>
              <h4 className="text-xl font-extrabold text-white">✅ Face Verified</h4>
              <p className="text-xs text-slate-300">Your enrolled face was successfully recognized.</p>
            </div>

            {/* METRICS CARD */}
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl text-left space-y-2 text-xs">
              <div className="flex justify-between items-center text-slate-400">
                <span>ArcFace Cosine Similarity:</span>
                <span className="text-emerald-400 font-mono font-bold">
                  {(verificationResult.similarity * 100).toFixed(1)}% ({verificationResult.similarity})
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>Identity Status:</span>
                <span className="text-white font-semibold">{verificationResult.identity || 'Enrolled Student'}</span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>Verification Message:</span>
                <span className="text-slate-200">{verificationResult.message}</span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={handleTryAgain}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl border border-slate-700 flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Verify Again</span>
              </button>
              <button
                onClick={onClose}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/20"
              >
                Done
              </button>
            </div>
          </div>
        ) : verificationResult && !verificationResult.verified ? (
          /* VERIFICATION RESULT STATE 2: FAILURE ❌ */
          <div className="bg-slate-950/80 border border-red-500/40 rounded-3xl p-6 text-center space-y-5 shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-red-500/20 text-red-400 border border-red-500/30 flex items-center justify-center mx-auto shadow-lg shadow-red-500/10">
              <XCircle className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-red-400 bg-red-950 px-3 py-1 rounded-full border border-red-800/50">
                Verification Rejected
              </span>
              <h4 className="text-xl font-extrabold text-white">❌ Face Not Recognized</h4>
              <p className="text-xs text-slate-300">Please try again or update your enrollment.</p>
            </div>

            {/* METRICS & REASON CARD */}
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl text-left space-y-2 text-xs">
              <div className="flex justify-between items-center text-slate-400">
                <span>ArcFace Cosine Similarity:</span>
                <span className="text-red-400 font-mono font-bold">
                  {(verificationResult.similarity * 100).toFixed(1)}% ({verificationResult.similarity})
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>Threshold Required:</span>
                <span className="text-slate-300 font-mono">50.0% (0.50)</span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>Reason / Feedback:</span>
                <span className="text-red-300 font-medium">{verificationResult.message}</span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={handleTryAgain}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/20 flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Try Again</span>
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          /* WEBCAM PREVIEW & CAPTURE INTERFACE */
          <div className="space-y-4">
            <div className="relative aspect-[4/3] bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 flex items-center justify-center shadow-inner">
              {cameraError ? (
                <div className="p-6 text-center space-y-3 text-red-400">
                  <VideoOff className="w-10 h-10 mx-auto text-red-500/80" />
                  <p className="text-xs font-semibold">{cameraError}</p>
                  <button
                    onClick={startCamera}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium rounded-xl border border-slate-700"
                  >
                    Retry Camera
                  </button>
                </div>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    className="w-full h-full object-cover transform -scale-x-100"
                  />

                  {/* FACE GUIDE OVAL */}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
                    <div
                      className={`w-56 h-72 rounded-[45%] border-2 transition-all duration-300 ${
                        numFacesDetected === 1 && isFrameValid
                          ? 'border-emerald-400 shadow-[0_0_25px_rgba(52,211,153,0.3)] bg-emerald-500/5'
                          : numFacesDetected > 1
                          ? 'border-red-500 shadow-[0_0_25px_rgba(239,68,68,0.3)] bg-red-500/10'
                          : 'border-indigo-500/60 border-dashed bg-indigo-500/5'
                      }`}
                    />
                  </div>

                  {/* LIVE QUALITY CUE BANNER */}
                  <div className="absolute bottom-3 left-3 right-3 z-10">
                    <div
                      className={`px-3.5 py-2 rounded-xl border backdrop-blur-md text-xs font-semibold flex items-center justify-between shadow-lg transition-all ${
                        numFacesDetected === 1 && isFrameValid
                          ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-200'
                          : numFacesDetected > 1
                          ? 'bg-red-950/80 border-red-500/50 text-red-200'
                          : 'bg-slate-900/80 border-slate-700 text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        {isEvaluating ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400 shrink-0" />
                        ) : numFacesDetected === 1 && isFrameValid ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        )}
                        <span className="truncate">{qualityFeedback}</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* ACTION BUTTON */}
            <button
              onClick={handleVerifyFace}
              disabled={!cameraActive || isVerifying || isEvaluating}
              className={`w-full py-3.5 px-6 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-xl ${
                isVerifying
                  ? 'bg-indigo-800 text-indigo-200 border border-indigo-700 cursor-wait'
                  : isFrameValid && numFacesDetected === 1
                  ? 'bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white shadow-indigo-600/30'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
              }`}
            >
              {isVerifying ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-indigo-300" />
                  <span>Generating embedding & verifying match...</span>
                </>
              ) : (
                <>
                  <Camera className="w-4 h-4" />
                  <span>Capture & Verify My Face</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
