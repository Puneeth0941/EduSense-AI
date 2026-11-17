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
  ShieldCheck,
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
    }
    setCameraActive(false);
  };

  // Lifecycle
  useEffect(() => {
    if (isOpen) {
      setVerificationResult(null);
      setVerificationError(null);
      setIsFrameValid(false);
      setQualityFeedback('Position your face inside the frame');
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  // Capture frame as JPEG Blob
  const captureBlob = useCallback(async (): Promise<Blob | null> => {
    if (!videoRef.current) return null;
    const video = videoRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return null;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.9);
    });
  }, []);

  // Periodic frame quality evaluation loop
  useEffect(() => {
    if (!isOpen || !cameraActive || verificationResult !== null || isVerifying) return;

    let isMounted = true;
    const interval = setInterval(async () => {
      if (isEvaluating) return;
      try {
        setIsEvaluating(true);
        const blob = await captureBlob();
        if (!blob || !isMounted) return;

        const res: FaceCaptureResponse = await faceApi.evaluateFrame(blob);
        if (!isMounted) return;

        setIsFrameValid(res.is_valid);
        setNumFacesDetected(res.faces_detected);
        setQualityFeedback(res.feedback);
      } catch {
        // Fallback gracefully on background evaluation errors
      } finally {
        if (isMounted) setIsEvaluating(false);
      }
    }, 1500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isOpen, cameraActive, verificationResult, isVerifying, isEvaluating, captureBlob]);

  // Handle Verify Face button click
  const handleVerifyFace = async () => {
    setVerificationError(null);
    try {
      setIsVerifying(true);
      const blob = await captureBlob();
      if (!blob) {
        throw new Error('Unable to capture camera snapshot. Please ensure webcam is connected.');
      }

      const result: FaceVerificationResponse = await faceApi.verifyFace(blob);
      setVerificationResult(result);
      stopCamera(); // Freeze camera upon getting result
    } catch (err: any) {
      console.error('Face verification failed:', err);
      setVerificationError(err.message || 'Face verification failed. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleTryAgain = () => {
    setVerificationResult(null);
    setVerificationError(null);
    setIsFrameValid(false);
    startCamera();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
      <div className="relative w-full max-w-lg bg-white border border-slate-200 rounded-2xl p-6 shadow-xl space-y-5">
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center">
              <ScanFace className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Biometric Face Verification</h3>
              <p className="text-[11px] text-slate-500">ArcFace 512D Cosine Similarity Check</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ERROR NOTIFICATION */}
        {verificationError && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{verificationError}</span>
          </div>
        )}

        {/* VERIFICATION RESULT STATE 1: SUCCESS ✅ */}
        {verificationResult && verificationResult.verified ? (
          <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-xl bg-emerald-100 text-emerald-600 border border-emerald-200 flex items-center justify-center mx-auto shadow-2xs">
              <CheckCircle2 className="w-7 h-7" />
            </div>

            <div className="space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-200">
                Match Confirmed
              </span>
              <h4 className="text-lg font-bold text-slate-900">Face Verified Successfully</h4>
              <p className="text-xs text-slate-600">Your enrolled biometric face was successfully matched.</p>
            </div>

            {/* METRICS CARD */}
            <div className="p-3.5 bg-white border border-emerald-200 rounded-xl text-left space-y-2 text-xs shadow-2xs">
              <div className="flex justify-between items-center text-slate-600">
                <span>ArcFace Cosine Similarity:</span>
                <span className="text-emerald-700 font-mono font-bold">
                  {(verificationResult.similarity * 100).toFixed(1)}% ({verificationResult.similarity})
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-600">
                <span>Identity Status:</span>
                <span className="text-slate-900 font-semibold">{verificationResult.identity || 'Enrolled Student'}</span>
              </div>
              <div className="flex justify-between items-center text-slate-600">
                <span>Verification Message:</span>
                <span className="text-slate-700 font-medium">{verificationResult.message}</span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2.5 pt-2">
              <button
                onClick={handleTryAgain}
                className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 flex items-center gap-1.5 transition-colors shadow-2xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Verify Again</span>
              </button>
              <button
                onClick={onClose}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg transition-colors shadow-xs"
              >
                Done
              </button>
            </div>
          </div>
        ) : verificationResult && !verificationResult.verified ? (
          /* VERIFICATION RESULT STATE 2: FAILURE ❌ */
          <div className="bg-red-50/60 border border-red-200 rounded-xl p-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-xl bg-red-100 text-red-600 border border-red-200 flex items-center justify-center mx-auto shadow-2xs">
              <XCircle className="w-7 h-7" />
            </div>

            <div className="space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-red-800 bg-red-100 px-2.5 py-0.5 rounded-full border border-red-200">
                Verification Rejected
              </span>
              <h4 className="text-lg font-bold text-slate-900">Face Not Recognized</h4>
              <p className="text-xs text-slate-600">The captured face does not match your enrolled ArcFace profile.</p>
            </div>

            {/* METRICS & REASON CARD */}
            <div className="p-3.5 bg-white border border-red-200 rounded-xl text-left space-y-2 text-xs shadow-2xs">
              <div className="flex justify-between items-center text-slate-600">
                <span>ArcFace Cosine Similarity:</span>
                <span className="text-red-600 font-mono font-bold">
                  {(verificationResult.similarity * 100).toFixed(1)}% ({verificationResult.similarity})
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-600">
                <span>Threshold Required:</span>
                <span className="text-slate-700 font-mono">50.0% (0.50)</span>
              </div>
              <div className="flex justify-between items-center text-slate-600">
                <span>Reason:</span>
                <span className="text-red-700 font-medium">{verificationResult.message}</span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2.5 pt-2">
              <button
                onClick={handleTryAgain}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg transition-colors shadow-xs flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Try Again</span>
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 transition-colors shadow-2xs"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          /* WEBCAM PREVIEW & CAPTURE INTERFACE */
          <div className="space-y-4">
            <div className="relative aspect-[4/3] bg-slate-900 rounded-xl overflow-hidden border border-slate-200 flex items-center justify-center shadow-xs">
              {cameraError ? (
                <div className="p-6 text-center space-y-2 text-red-400">
                  <VideoOff className="w-8 h-8 mx-auto text-red-500" />
                  <p className="text-xs font-semibold">{cameraError}</p>
                  <button
                    onClick={startCamera}
                    className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-800 text-xs font-medium rounded-lg border border-slate-200"
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
                      className={`w-52 h-68 rounded-[45%] border-2 transition-all duration-300 ${
                        numFacesDetected === 1 && isFrameValid
                          ? 'border-emerald-400 bg-emerald-500/10'
                          : numFacesDetected > 1
                          ? 'border-red-500 bg-red-500/10'
                          : 'border-blue-400/80 border-dashed bg-blue-500/5'
                      }`}
                    />
                  </div>

                  {/* LIVE QUALITY CUE BANNER */}
                  <div className="absolute bottom-3 left-3 right-3 z-10">
                    <div
                      className={`px-3 py-1.5 rounded-lg border backdrop-blur-md text-xs font-semibold flex items-center justify-between shadow-xs transition-all ${
                        numFacesDetected === 1 && isFrameValid
                          ? 'bg-emerald-900/90 border-emerald-400 text-emerald-100'
                          : numFacesDetected > 1
                          ? 'bg-red-900/90 border-red-400 text-red-100'
                          : 'bg-slate-900/85 border-slate-700 text-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        {isEvaluating ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400 shrink-0" />
                        ) : numFacesDetected === 1 && isFrameValid ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5 text-blue-400 shrink-0" />
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
              className={`w-full py-3 px-6 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-xs ${
                isVerifying
                  ? 'bg-blue-300 text-white cursor-wait'
                  : isFrameValid && numFacesDetected === 1
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
              }`}
            >
              {isVerifying ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
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
