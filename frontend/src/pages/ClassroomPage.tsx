import React, { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
  useTracks,
  useParticipants,
  useRoomContext,
  useLocalParticipant,
  useConnectionState,
  useAudioPlayback,
  VideoTrack,
  isTrackReference,
  type TrackReference,
} from '@livekit/components-react';
import { Track, ConnectionState, Participant, RoomEvent } from 'livekit-client';
import { sessionApi, classroomApi, attendanceApi, analyticsApi, transcriptionApi } from '../services/api';

import type {
  JoinSessionResponse,
  ChatMessage,
  Classroom,
  ClassSession,
  AttendanceVerificationResponse,
  LiveTranscriptMessage,
  SessionTranscriptItem,
  TranscriptionResponse,
  SentimentAnalysisResult,
} from '../types';
import { StudentAttendanceStatusBadge } from '../components/StudentAttendanceStatusBadge';
import { TeacherAttendanceModal } from '../components/TeacherAttendanceModal';
import {
  GraduationCap,
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  Monitor,
  Users,
  MessageSquare,
  LogOut,
  Power,
  Send,
  AlertCircle,
  RefreshCw,
  Volume2,
  BarChart3,
  Info,
  Subtitles,
  Languages,
  UploadCloud,
  Square,
  CheckCircle2,
  Edit3,
  Share2,
  Sparkles,
} from 'lucide-react';

export const ClassroomPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [searchParams] = useSearchParams();
  const classId = searchParams.get('classId');

  const navigate = useNavigate();

  const [joinData, setJoinData] = useState<JoinSessionResponse | null>(null);
  const [classroom, setClassroom] = useState<Classroom | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    if (!sessionId) {
      setError('Missing classroom or session parameter');
      setLoading(false);
      return;
    }

    const initJoin = async () => {
      try {
        setLoading(true);
        setError(null);

        let realSessionId = sessionId;
        let realClassroomId = classId || sessionId;
        let sessionObj: ClassSession | null = null;

        // 1. First, attempt to fetch the session using sessionId parameter
        try {
          if (realSessionId) {
            sessionObj = await sessionApi.getSession(realSessionId);
            realClassroomId = sessionObj.classroom_id;
          }
        } catch {
          // If session lookup failed (e.g. parameter in URL was actually a classroom ID),
          // resolve the current active session for that classroom.
          const activeSess = await sessionApi.getActiveSessionForClassroom(realSessionId);
          if (activeSess) {
            sessionObj = activeSess;
            realSessionId = activeSess.id;
            realClassroomId = activeSess.classroom_id;
          }
        }

        if (!sessionObj) {
          throw new Error('No active class session is currently running for this classroom.');
        }

        // 2. Load classroom metadata using realClassroomId
        const classData = await classroomApi.getClassroom(realClassroomId);
        if (isCancelled) return;
        setClassroom(classData);

        // 3. Join session using realClassroomId and realSessionId
        const data = await sessionApi.joinSession(realClassroomId, realSessionId);
        if (isCancelled) return;
        setJoinData(data);
      } catch (err: any) {
        if (!isCancelled) {
          setError(err.message || 'Failed to join class session');
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    initJoin();

    return () => {
      isCancelled = true;
    };
  }, [sessionId, classId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex flex-col justify-center items-center font-sans space-y-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-500 text-sm font-medium">Authenticating & generating secure LiveKit token...</p>
      </div>
    );
  }

  if (error || !joinData) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex flex-col justify-center items-center font-sans p-6 space-y-4">
        <div className="p-6 bg-white border border-red-200 rounded-2xl max-w-md w-full text-center space-y-3 shadow-sm">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
          <h2 className="text-lg font-bold text-slate-900">Classroom Join Failed</h2>
          <p className="text-sm text-slate-600">{error || 'Unable to connect to session'}</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl text-sm transition-all shadow-sm"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <LiveKitRoom
      token={joinData.token}
      serverUrl={joinData.server_url || import.meta.env.VITE_LIVEKIT_URL || 'wss://edusense-t2vkr0dy.livekit.cloud'}
      connect={true}
      audio={true}
      video={true}
      options={{
        adaptiveStream: true,
        dynacast: true,
      }}
      onError={(err) => {
        console.error('LiveKit connection error:', err);
        setError(`LiveKit Connection Error: ${err.message || 'Failed to connect to media server'}`);
      }}
      onDisconnected={() => {
        console.log('Disconnected from LiveKit classroom');
      }}
      data-lk-theme="default"
      className="min-h-screen bg-slate-950 font-sans text-slate-100 flex flex-col overflow-hidden relative"
    >
      {/* Official LiveKit Audio Components */}
      <RoomAudioRenderer />
      <StartAudio label="Enable Audio" />
      <ClassroomInner
        joinData={joinData}
        classroom={classroom}
        sessionId={sessionId!}
      />
    </LiveKitRoom>
  );
};

// INNER CLASSROOM CONTENT (Has access to LiveKit hooks)
interface ClassroomInnerProps {
  joinData: JoinSessionResponse;
  classroom: Classroom | null;
  sessionId: string;
}

const ClassroomInner: React.FC<ClassroomInnerProps> = ({ joinData, classroom, sessionId }) => {
  const navigate = useNavigate();
  const room = useRoomContext();
  const connectionState = useConnectionState();
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const { canPlayAudio, startAudio } = useAudioPlayback();

  const isTeacher = joinData.role === 'TEACHER';

  // UI Drawer states
  const [showParticipants, setShowParticipants] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showFacialWindow, setShowFacialWindow] = useState(false);
  const [showTranscripts, setShowTranscripts] = useState(false);
  const [showTeacherAttendanceModal, setShowTeacherAttendanceModal] = useState(false);
  const [facialWindowData, setFacialWindowData] = useState<any>(null);

  // Whisper AI Speech-to-Text & Captions states
  const [isRecordingSpeech, setIsRecordingSpeech] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isTranscribingSpeech, setIsTranscribingSpeech] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [editableTranscript, setEditableTranscript] = useState('');
  const [latestSpeechResult, setLatestSpeechResult] = useState<TranscriptionResponse | null>(null);
  const [customSentimentResult, setCustomSentimentResult] = useState<SentimentAnalysisResult | null>(null);
  const [isEvaluatingSentiment, setIsEvaluatingSentiment] = useState(false);
  const [hasSharedToClass, setHasSharedToClass] = useState(false);
  const recordingTimerRef = useRef<any>(null);
  const recordingChunksRef = useRef<Blob[]>([]);

  const [transcriptionLanguage, setTranscriptionLanguage] = useState<'auto' | 'en' | 'kn' | 'hi'>('auto');
  const [transcriptTab, setTranscriptTab] = useState<'live' | 'history' | 'upload'>('live');
  const [liveTranscripts, setLiveTranscripts] = useState<LiveTranscriptMessage[]>([]);
  const [sessionTranscripts, setSessionTranscripts] = useState<SessionTranscriptItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [latestCaption, setLatestCaption] = useState<LiveTranscriptMessage | null>(null);
  const captionTimeoutRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const transcriptsBottomRef = useRef<HTMLDivElement>(null);
  const snippetSeqRef = useRef<number>(0);

  // Audio Upload on-demand state
  const [selectedAudioFile, setSelectedAudioFile] = useState<File | null>(null);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [uploadedTranscriptResult, setUploadedTranscriptResult] = useState<TranscriptionResponse | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Local media states
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  // Ref for the local student's video element (BUG 1 FIX)
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  // Attendance state for student
  const [attendanceData, setAttendanceData] = useState<AttendanceVerificationResponse | null>(null);
  const [isVerifyingAttendance, setIsVerifyingAttendance] = useState(false);
  const isVerifyingRef = useRef(false);

  // Periodic Face Attendance Sampling Effect (Student camera ON)
  useEffect(() => {
    if (isTeacher || !isCamOn || !sessionId) return;

    const captureAndVerifyFrame = async () => {
      if (isVerifyingRef.current) return; // Debounce / Throttling

      // Direct ref to local student video DOM element
      const targetVideo = localVideoRef.current;
      let sampleB64: string | null = null;

      if (targetVideo && targetVideo.videoWidth > 0 && targetVideo.videoHeight > 0 && targetVideo.readyState >= 2) {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = targetVideo.videoWidth;
          canvas.height = targetVideo.videoHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(targetVideo, 0, 0, canvas.width, canvas.height);
            sampleB64 = canvas.toDataURL('image/jpeg', 0.80);
          }
        } catch {
          // Ignore canvas error
        }
      }

      if (!sampleB64) return;

      try {
        isVerifyingRef.current = true;
        setIsVerifyingAttendance(true);

        const res = await attendanceApi.verifyAttendance(sessionId, sampleB64);
        console.log('[ATTENDANCE DEBUG] response:', res);
        console.log('[ATTENDANCE DEBUG] frontend sample count:', res?.samples_confirmed);
        setAttendanceData(res);
      } catch (err) {
        // Non-blocking failure isolation: Log silently, never break LiveKit stream
        console.warn('[ATTENDANCE SAMPLER] Periodic verification check non-fatal warning:', err);
      } finally {
        isVerifyingRef.current = false;
        setIsVerifyingAttendance(false);
      }
    };

    // Initial check after 2s
    const timeout = setTimeout(captureAndVerifyFrame, 2000);
    // Periodic interval every 1 minute (60,000ms) as confirmed in requirements
    const interval = setInterval(captureAndVerifyFrame, 60000);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [isTeacher, isCamOn, sessionId]);

  // Live Facial Analytics state & refs
  const [analyticsStatus, setAnalyticsStatus] = useState<{
    active: boolean;
    lastSampleTime: string | null;
    attentivenessScore: number | null;
    dominantEmotion: string | null;
    confidence: number | null;
    predictionStatus: string | null;
    qualityStatus: string | null;
    orientation: string | null;
    isDistracted: boolean;
    emotionBackend: string | null;
  }>({
    active: false,
    lastSampleTime: null,
    attentivenessScore: null,
    dominantEmotion: null,
    confidence: null,
    predictionStatus: null,
    qualityStatus: null,
    orientation: null,
    isDistracted: false,
    emotionBackend: null,
  });
  const isAnalyticsSamplingRef = useRef(false);

  // Facial Analytics Session relative timer & window refs
  const facialAnalyticsStartTimeRef = useRef<number | null>(null);
  const currentWindowRef = useRef<number>(0);
  const sampleCounterRef = useRef<number>(0);
  const sampledSlotsRef = useRef<Set<string>>(new Set());

  // 5-Minute Window Facial Analytics Sampling Effect (Relative Timer)
  useEffect(() => {
    if (isTeacher || !isCamOn || !sessionId || connectionState !== ConnectionState.Connected) {
      setAnalyticsStatus(prev => ({ ...prev, active: false }));
      return;
    }

    // Initialize relative start time if not set
    if (!facialAnalyticsStartTimeRef.current) {
      facialAnalyticsStartTimeRef.current = Date.now();
      console.log(`[FACIAL SAMPLER] Analytics relative timer initialized at t=0ms (${new Date().toISOString()})`);
    }

    const sampleFacialAnalyticsFrame = async (slotLabel: string, slotKey: string, elapsedSec: number) => {
      if (isAnalyticsSamplingRef.current) return;

      // Direct ref to local student's video element (BUG 1 FIX)
      const targetVideo = localVideoRef.current;

      if (!targetVideo) {
        console.warn(`[FACIAL SAMPLER] localVideoRef.current is null when attempting slot ${slotLabel} (elapsed ${elapsedSec.toFixed(1)}s)`);
        return;
      }

      if (targetVideo.readyState < 2 || targetVideo.videoWidth === 0 || targetVideo.videoHeight === 0) {
        console.warn(`[FACIAL SAMPLER] Local video element not ready yet`, {
          slot: slotLabel,
          elapsedSec: elapsedSec.toFixed(1) + 's',
          readyState: targetVideo.readyState,
          videoWidth: targetVideo.videoWidth,
          videoHeight: targetVideo.videoHeight,
        });
        return;
      }

      // Mark slotKey as sampled before starting network request to avoid double-sampling
      sampledSlotsRef.current.add(slotKey);

      let sampleB64: string | null = null;
      const canvas = document.createElement('canvas');
      canvas.width = targetVideo.videoWidth;
      canvas.height = targetVideo.videoHeight;
      const ctx = canvas.getContext('2d');

      try {
        if (ctx) {
          ctx.drawImage(targetVideo, 0, 0, canvas.width, canvas.height);
          sampleB64 = canvas.toDataURL('image/jpeg', 0.80);
        }
      } catch (drawErr) {
        console.warn('[FACIAL SAMPLER] Canvas draw error:', drawErr);
      }

      if (!sampleB64) return;

      const cameraPub = localParticipant?.getTrackPublication(Track.Source.Camera);
      const trackSid = cameraPub?.trackSid || cameraPub?.track?.sid || 'unknown';
      const frameSizeKB = (sampleB64.length / 1024).toFixed(1) + 'KB';
      const participantEmail = joinData.participant_identity;
      const participantId = localParticipant?.identity || joinData.participant_identity;

      try {
        isAnalyticsSamplingRef.current = true;
        const res = await analyticsApi.sampleFrame({
          session_id: sessionId,
          image_base64: sampleB64,
          slot: slotLabel,
        } as any);

        // Required diagnostic log format
        console.log(
          `[FACIAL SAMPLE]\n` +
          `slot=${slotLabel}\n` +
          `elapsed=${elapsedSec.toFixed(1)}s\n` +
          `participant=${participantEmail}\n` +
          `participant identity=${participantId}\n` +
          `camera track SID=${trackSid}\n` +
          `videoWidth=${targetVideo.videoWidth}\n` +
          `videoHeight=${targetVideo.videoHeight}\n` +
          `readyState=${targetVideo.readyState}\n` +
          `frame size=${frameSizeKB}\n` +
          `API response=200`
        );

        const timeStr = new Date().toLocaleTimeString();
        setAnalyticsStatus({
          active: true,
          lastSampleTime: timeStr,
          attentivenessScore: res.attentiveness_score ?? null,
          dominantEmotion: res.dominant_emotion ?? null,
          confidence: res.confidence ?? null,
          predictionStatus: res.prediction_status ?? null,
          qualityStatus: res.quality_status ?? null,
          orientation: res.head_pose?.orientation ?? null,
          isDistracted: !!res.is_distracted,
          emotionBackend: res.emotion_backend ?? null,
        });
      } catch (err) {
        console.warn(`[FACIAL ANALYTICS SAMPLER - ${slotLabel}] Sample frame request error:`, err);
      } finally {
        isAnalyticsSamplingRef.current = false;
      }
    };

    const checkScheduledSample = () => {
      if (!facialAnalyticsStartTimeRef.current) return;

      const now = Date.now();
      const totalElapsedSec = (now - facialAnalyticsStartTimeRef.current) / 1000;

      // Determine 5-minute (300-second) window index relative to student start time
      const windowIndex = Math.floor(totalElapsedSec / 300);

      if (windowIndex > currentWindowRef.current) {
        currentWindowRef.current = windowIndex;
        console.log(`[FACIAL SAMPLER] Relative 5-minute window advanced to Window #${windowIndex}`);
      }

      sampleCounterRef.current += 1;
      const slotIndex = ((sampleCounterRef.current - 1) % 3) + 1;
      const slotLabel = `sample-${slotIndex}`;
      const slotKey = `window_${windowIndex}_sample_${sampleCounterRef.current}`;

      sampleFacialAnalyticsFrame(slotLabel, slotKey, totalElapsedSec);
    };

    const initialTimeout = setTimeout(checkScheduledSample, 1500);
    const interval = setInterval(checkScheduledSample, 4000);

    setAnalyticsStatus(prev => ({ ...prev, active: true }));

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
      setAnalyticsStatus(prev => ({ ...prev, active: false }));
    };
  }, [isTeacher, isCamOn, sessionId, connectionState, localParticipant, joinData]);

  // Periodic fetch for Live 5-Minute Window Facial Analytics (Teacher mode)
  useEffect(() => {
    if (!isTeacher || !sessionId) return;
    const fetchWindowData = async () => {
      try {
        const res = await analyticsApi.getClassroomFacialWindow(sessionId);
        setFacialWindowData(res);
      } catch (err) {
        // Non-blocking
      }
    };
    fetchWindowData();
    const interval = setInterval(fetchWindowData, 15000);
    return () => clearInterval(interval);
  }, [isTeacher, sessionId]);


  // Sync initial media states with localParticipant & ensure microphone is active
  useEffect(() => {
    if (localParticipant) {
      setIsMicOn(localParticipant.isMicrophoneEnabled);
      setIsCamOn(localParticipant.isCameraEnabled);
      setIsScreenSharing(localParticipant.isScreenShareEnabled);

      if (!localParticipant.isMicrophoneEnabled) {
        localParticipant.setMicrophoneEnabled(true).then(() => {
          setIsMicOn(true);
          console.log('[LIVEKIT LOCAL MIC] Local microphone enabled successfully.');
        }).catch((err) => {
          console.error('[LIVEKIT LOCAL MIC ERROR]', err);
        });
      }
    }
  }, [localParticipant]);

  // Chat state (Data Channel)
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Floating caption helper with auto-clear
  const displayCaption = (caption: LiveTranscriptMessage) => {
    setLatestCaption(caption);
    if (captionTimeoutRef.current) clearTimeout(captionTimeoutRef.current);
    captionTimeoutRef.current = setTimeout(() => {
      setLatestCaption(null);
    }, 6000);
  };

  // Listen for LiveKit Data Messages (Real-time chat, transcripts & End session events)
  useEffect(() => {
    if (!room) return;

    const handleDataReceived = (payload: Uint8Array, participant?: Participant) => {
      try {
        const decoder = new TextDecoder();
        const strData = decoder.decode(payload);
        const eventData = JSON.parse(strData);

        if (eventData.type === 'CHAT') {
          const newMsg: ChatMessage = {
            id: eventData.id || `${Date.now()}_${Math.random()}`,
            senderName: eventData.senderName || participant?.name || 'Participant',
            senderIdentity: participant?.identity || 'unknown',
            text: eventData.text,
            timestamp: eventData.timestamp || Date.now(),
          };
          setMessages((prev) => [...prev, newMsg]);
        } else if (eventData.type === 'TRANSCRIPT') {
          const tMsg: LiveTranscriptMessage = {
            id: eventData.id || `${Date.now()}_${Math.random()}`,
            speakerName: eventData.speakerName || participant?.name || 'Speaker',
            speakerIdentity: eventData.speakerIdentity || participant?.identity || 'unknown',
            speakerRole: eventData.speakerRole || 'STUDENT',
            text: eventData.text,
            language: eventData.language,
            sentimentLabel: eventData.sentimentLabel,
            quality_status: eventData.quality_status,
            is_low_confidence: eventData.is_low_confidence,
            timestamp: eventData.timestamp || Date.now(),
          };
          setLiveTranscripts((prev) => [...prev, tMsg].sort((a, b) => a.timestamp - b.timestamp));
          displayCaption(tMsg);
        } else if (eventData.type === 'SESSION_ENDED') {
          alert('The instructor has ended this live class session.');
          room.disconnect();
          navigate('/dashboard');
        }
      } catch (err) {
        console.error('Failed to parse data message:', err);
      }
    };

    room.on('dataReceived', handleDataReceived);

    return () => {
      room.off('dataReceived', handleDataReceived);
    };
  }, [room, navigate]);

  // Format recording timer helper (mm:ss)
  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Dedicated Record & Transcribe: Start Recording
  const startRecordingSpeech = async () => {
    if (isRecordingSpeech || isTranscribingSpeech) return;
    setSpeechError(null);

    try {
      let stream = audioStreamRef.current;
      const micTrack = localParticipant?.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack;

      if (!stream || !stream.active || (micTrack && !stream.getAudioTracks().includes(micTrack))) {
        if (micTrack && micTrack.readyState === 'live') {
          stream = new MediaStream([micTrack]);
        } else if (navigator?.mediaDevices?.getUserMedia) {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
        audioStreamRef.current = stream;
      }

      if (!stream || stream.getAudioTracks().length === 0) {
        setSpeechError('Microphone input is unavailable. Please check your mic permissions and connections.');
        return;
      }

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : '';

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recordingChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordingChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }

        const chunks = recordingChunksRef.current;
        if (chunks.length === 0) {
          setIsTranscribingSpeech(false);
          setSpeechError('No audio captured. Please ensure your microphone is picking up sound.');
          return;
        }

        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size < 1000) {
          setIsTranscribingSpeech(false);
          setSpeechError('Recording was too short to transcribe. Please speak for at least 1-2 seconds.');
          return;
        }

        // Send recording to backend
        try {
          setIsTranscribingSpeech(true);
          const reader = new FileReader();
          reader.onloadend = async () => {
            const b64 = reader.result as string;
            if (!b64) {
              setIsTranscribingSpeech(false);
              setSpeechError('Failed to encode audio for upload.');
              return;
            }

            try {
              const res = await transcriptionApi.transcribeSnippet({
                session_id: sessionId,
                audio_base64: b64,
                mime_type: blob.type || 'audio/webm',
                language: transcriptionLanguage,
                enrich_sentiment: true,
              });

              setLatestSpeechResult(res);

              if (res.quality_status === 'silence' || !res.text || !res.text.trim()) {
                setEditableTranscript('');
                setSpeechError('No speech detected (silence or quiet room). Please speak clearly into the microphone.');
              } else {
                const cleanText = res.text.trim();
                setEditableTranscript(cleanText);
                setCustomSentimentResult(null);
                setHasSharedToClass(false);
              }
            } catch (apiErr: any) {
              console.error('[SPEECH TRANSCRIBE ERROR]', apiErr);
              setSpeechError(apiErr.message || 'Speech transcription failed. Please check backend connection.');
            } finally {
              setIsTranscribingSpeech(false);
            }
          };
          reader.readAsDataURL(blob);
        } catch (err: any) {
          setIsTranscribingSpeech(false);
          setSpeechError(err.message || 'Error processing recorded audio.');
        }
      };

      recorder.start();
      setIsRecordingSpeech(true);
      setRecordingSeconds(0);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);

    } catch (err: any) {
      console.error('[RECORD SPEECH START ERROR]', err);
      setSpeechError(err.message || 'Failed to start microphone recording. Please allow mic permissions.');
      setIsRecordingSpeech(false);
    }
  };

  // Stop recording and trigger transcription
  const stopAndTranscribeSpeech = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') return;
    setIsRecordingSpeech(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsTranscribingSpeech(true);
    try {
      mediaRecorderRef.current.stop();
    } catch (err: any) {
      setIsTranscribingSpeech(false);
      setSpeechError(err.message || 'Failed to finalize microphone recording.');
    }
  };

  // Cancel recording without transcribing
  const cancelRecordingSpeech = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.onstop = null;
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    recordingChunksRef.current = [];
    setIsRecordingSpeech(false);
    setRecordingSeconds(0);
    setSpeechError(null);
  };

  // Re-run sentiment analysis on edited transcript text
  const handleRerunSentiment = async () => {
    if (!editableTranscript || !editableTranscript.trim()) return;
    setIsEvaluatingSentiment(true);
    setSpeechError(null);
    try {
      const res = await transcriptionApi.analyzeTextSentiment({
        text: editableTranscript.trim(),
        language: transcriptionLanguage,
      });
      setCustomSentimentResult(res);
    } catch (err: any) {
      setSpeechError(err.message || 'Failed to analyze transcript sentiment.');
    } finally {
      setIsEvaluatingSentiment(false);
    }
  };

  // Share current transcript to classroom (broadcast & live transcript history)
  const handleShareToClassroom = () => {
    if (!editableTranscript || !editableTranscript.trim() || !joinData) return;
    const cleanText = editableTranscript.trim();
    const activeSentiment = customSentimentResult?.sentiment_label || latestSpeechResult?.sentiment_label;
    const activeLanguage = customSentimentResult?.language || latestSpeechResult?.language || (transcriptionLanguage === 'auto' ? 'en' : transcriptionLanguage);

    const seq = ++snippetSeqRef.current;
    const msg: LiveTranscriptMessage = {
      id: `${Date.now()}_${seq}`,
      speakerName: joinData.participant_name,
      speakerIdentity: joinData.participant_identity,
      speakerRole: joinData.role,
      text: cleanText,
      language: activeLanguage,
      sentimentLabel: activeSentiment,
      quality_status: latestSpeechResult?.quality_status || 'reliable',
      is_low_confidence: latestSpeechResult?.is_low_confidence,
      timestamp: Date.now(),
    };

    setLiveTranscripts((prev) => [...prev, msg].sort((a, b) => a.timestamp - b.timestamp));
    displayCaption(msg);

    if (room && localParticipant) {
      const encoder = new TextEncoder();
      const payload = encoder.encode(JSON.stringify({
        type: 'TRANSCRIPT',
        ...msg,
      }));
      localParticipant.publishData(payload, { reliable: true });
    }

    setHasSharedToClass(true);
  };

  // Clean up recording on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        try { mediaRecorderRef.current.stop(); } catch {}
      }
    };
  }, []);

  // Load saved session transcripts from backend database
  const loadSessionHistory = async () => {
    try {
      setIsLoadingHistory(true);
      const items = await transcriptionApi.getSessionTranscripts(sessionId);
      setSessionTranscripts(items);
    } catch (err) {
      console.warn('Failed to load session transcripts history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Upload on-demand audio file for transcription
  const handleAudioUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAudioFile) return;

    try {
      setIsUploadingAudio(true);
      setUploadError(null);
      const res = await transcriptionApi.transcribeAudioFile(selectedAudioFile, {
        session_id: sessionId,
        language: transcriptionLanguage,
        enrich_sentiment: true,
      });
      setUploadedTranscriptResult(res);
      if (res.text) {
        const uploadedMsg: LiveTranscriptMessage = {
          id: res.analysis_id || `${Date.now()}_${Math.random()}`,
          speakerName: `${joinData.participant_name} (Upload)`,
          speakerIdentity: joinData.participant_identity,
          speakerRole: joinData.role,
          text: res.text,
          language: res.language,
          sentimentLabel: res.sentiment_label,
          quality_status: res.quality_status,
          is_low_confidence: res.is_low_confidence,
          timestamp: Date.now(),
        };
        setLiveTranscripts((prev) => [...prev, uploadedMsg].sort((a, b) => a.timestamp - b.timestamp));
        displayCaption(uploadedMsg);
      }
    } catch (err: any) {
      setUploadError(err.message || 'Failed to transcribe audio file');
    } finally {
      setIsUploadingAudio(false);
    }
  };

  // Auto-scroll transcripts
  useEffect(() => {
    transcriptsBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [liveTranscripts]);

  // Periodic poll check for session status (Constraint 3: Ensure clients redirect when session ended in DB)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const sess = await sessionApi.getSession(sessionId);
        if (sess.status === 'COMPLETED' || sess.status === 'CANCELLED') {
          alert('This class session has been completed.');
          if (room) room.disconnect();
          navigate('/dashboard');
        }
      } catch {
        // Ignore periodic error
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [sessionId, room, navigate]);

  // Auto-scroll chat
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Media Controls
  const toggleMicrophone = async () => {
    if (!localParticipant) return;
    try {
      const newState = !isMicOn;
      await localParticipant.setMicrophoneEnabled(newState);
      setIsMicOn(newState);
    } catch (err: any) {
      console.error('Microphone toggle error:', err);
      alert(`Microphone error: ${err.message || 'Failed to toggle microphone. Check browser permissions.'}`);
    }
  };

  const toggleCamera = async () => {
    if (!localParticipant) return;
    try {
      const newState = !isCamOn;
      await localParticipant.setCameraEnabled(newState);
      setIsCamOn(newState);
    } catch (err: any) {
      console.error('Camera toggle error:', err);
      alert(`Camera error: ${err.message || 'Failed to toggle camera. Check browser permissions.'}`);
    }
  };

  const toggleScreenShare = async () => {
    if (!localParticipant) return;
    try {
      const newState = !isScreenSharing;
      await localParticipant.setScreenShareEnabled(newState);
      setIsScreenSharing(newState);
    } catch (err: any) {
      alert(`Screen share error: ${err.message || 'Permission denied or unsupported'}`);
    }
  };

  // Leave Class
  const handleLeaveClass = async () => {
    try {
      await sessionApi.leaveSession(sessionId);
    } catch (err) {
      console.error('Leave session error:', err);
    } finally {
      if (room) room.disconnect();
      navigate('/dashboard');
    }
  };

  // End Class (Teacher Only)
  const handleEndClass = async () => {
    if (!confirm('Are you sure you want to end this class for all participants?')) return;

    try {
      // Broadcast SESSION_ENDED data event to all connected clients
      if (room && localParticipant) {
        const encoder = new TextEncoder();
        const payload = encoder.encode(JSON.stringify({ type: 'SESSION_ENDED' }));
        await localParticipant.publishData(payload, { reliable: true });
      }

      // Update backend PostgreSQL session status to COMPLETED
      await sessionApi.endSession(sessionId);
    } catch (err: any) {
      console.error('End session error:', err);
    } finally {
      if (room) room.disconnect();
      navigate('/dashboard');
    }
  };

  // Send Chat Message via LiveKit Data Channel
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || !localParticipant) return;

    const msgObj = {
      type: 'CHAT',
      id: `${Date.now()}_${Math.random()}`,
      senderName: joinData.participant_name,
      text: inputMessage.trim(),
      timestamp: Date.now(),
    };

    try {
      const encoder = new TextEncoder();
      const payload = encoder.encode(JSON.stringify(msgObj));
      await localParticipant.publishData(payload, { reliable: true });

      // Add locally
      setMessages((prev) => [
        ...prev,
        {
          id: msgObj.id,
          senderName: joinData.participant_name,
          senderIdentity: joinData.participant_identity,
          text: msgObj.text,
          timestamp: msgObj.timestamp,
        },
      ]);
      setInputMessage('');
    } catch (err: any) {
      console.error('Failed to send data message:', err);
    }
  };

  // Diagnostics & Official LiveKit Audio Event Monitor
  useEffect(() => {
    if (!room || !localParticipant) return;

    const runPlaybackDiagnostics = () => {
      console.log(`room.canPlaybackAudio: ${room.canPlaybackAudio}`);
      console.log(`room.state: ${room.state}`);

      // 1. Remote Audio Tracks Diagnostic
      room.remoteParticipants.forEach((p) => {
        const micPub = p.getTrackPublication(Track.Source.Microphone);
        const track = micPub?.track;

        console.log('REMOTE AUDIO PLAYBACK DEBUG:');
        console.log(`participantIdentity: ${p.identity}`);
        console.log(`trackSid: ${micPub?.trackSid || 'N/A'}`);
        console.log(`trackKind: ${track?.kind || 'N/A'}`);
        console.log(`trackMuted: ${micPub ? micPub.isMuted : 'N/A'}`);
        console.log(`trackEnabled: ${track?.mediaStreamTrack ? track.mediaStreamTrack.enabled : 'N/A'}`);
      });

      // 2. DOM HTMLAudioElement Inspection & Playback Attempt
      const audioElements = document.querySelectorAll('audio');
      console.log(`AUDIO ELEMENTS COUNT: ${audioElements.length}`);

      audioElements.forEach((audio, index) => {
        console.log('AUDIO ELEMENT:');
        console.log(`count: ${index + 1}`);
        console.log(`srcObjectExists: ${!!audio.srcObject}`);
        console.log(`muted: ${audio.muted}`);
        console.log(`volume: ${audio.volume}`);
        console.log(`paused: ${audio.paused}`);
        console.log(`readyState: ${audio.readyState}`);
        console.log(`currentTime: ${audio.currentTime}`);
        console.log(`autoplay: ${audio.autoplay}`);

        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log(`audio.play() = SUCCESS (Element #${index + 1})`);
            })
            .catch((err: any) => {
              console.log(`audio.play() = FAILED (Element #${index + 1})`);
              console.log(`error.name: ${err.name}`);
              console.log(`error.message: ${err.message}`);
            });
        }
      });
    };

    const handleAudioPlaybackStatusChanged = () => {
      console.log(`[LIVEKIT EVENT] AudioPlaybackStatusChanged triggered! New canPlaybackAudio status: ${room.canPlaybackAudio}`);
      runPlaybackDiagnostics();
    };

    const handleDeviceChange = async () => {
      console.log('[LIVEKIT AUDIO] Device change detected (earbuds connected/disconnected).');
      try {
        if (room) {
          try {
            await room.switchActiveDevice('audiooutput', 'default');
          } catch (e: any) {
            console.log('[LIVEKIT switchActiveDevice error]', e?.message);
          }
          if (!room.canPlaybackAudio) {
            await room.startAudio();
          }
        }
        const audioElements = document.querySelectorAll('audio');
        for (const audio of Array.from(audioElements)) {
          if ('setSinkId' in audio && typeof (audio as any).setSinkId === 'function') {
            try {
              await (audio as any).setSinkId('');
            } catch (err: any) {
              console.log('[AUDIO SINKID ERR]', err?.message);
            }
          }
          if (audio.srcObject && audio.paused) {
            audio.play().catch((err: any) => console.log('[AUDIO DEVICECHANGE PLAY ERR]', err?.message));
          }
        }
      } catch (err: any) {
        console.log('[AUDIO DEVICECHANGE ERR]', err?.message);
      }
    };

    room.on(RoomEvent.AudioPlaybackStatusChanged, handleAudioPlaybackStatusChanged);

    if (typeof window !== 'undefined' && navigator?.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    }

    runPlaybackDiagnostics();
    const interval = setInterval(runPlaybackDiagnostics, 3000);

    return () => {
      clearInterval(interval);
      room.off(RoomEvent.AudioPlaybackStatusChanged, handleAudioPlaybackStatusChanged);
      if (typeof window !== 'undefined' && navigator?.mediaDevices?.removeEventListener) {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      }
    };
  }, [room, localParticipant]);

  // Test Audio Sound & Unmute All Streams
  const handleTestAudioSound = () => {
    try {
      if (room) {
        room.switchActiveDevice('audiooutput', 'default').catch(() => {});
        room.startAudio().catch(() => {});
      }
      startAudio().catch(() => {});

      // Play soft diagnostic WebAudio chime
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.3); // A5

      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.5);

      // Force play & unmute all DOM audio elements and route to default output
      document.querySelectorAll('audio').forEach((el) => {
        el.muted = false;
        if ('setSinkId' in el && typeof (el as any).setSinkId === 'function') {
          (el as any).setSinkId('').catch(() => {});
        }
        if (el.srcObject) {
          el.play().catch(() => {});
        }
      });
    } catch (e) {
      console.error('Audio test error:', e);
    }
  };

  // Get screen share tracks
  const screenTracks = useTracks([{ source: Track.Source.ScreenShare, withPlaceholder: false }]);
  const rawScreenTrack = screenTracks.length > 0 ? screenTracks[0] : null;
  const screenShareTrack = rawScreenTrack && isTrackReference(rawScreenTrack) ? (rawScreenTrack as TrackReference) : null;

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-950 text-slate-900 font-sans">
      {/* Browser Autoplay Policy Banner */}
      {(!canPlayAudio || (room && !room.canPlaybackAudio)) && (
        <div className="bg-amber-500 text-white text-xs px-6 py-2.5 flex items-center justify-between z-30 shrink-0 shadow-sm font-medium">
          <span>Browser audio playback requires user permission. Click "Enable Audio" to unblock classroom sound.</span>
          <button
            onClick={async () => {
              console.log('[LIVEKIT MANUAL START AUDIO CLICKED]');
              try {
                if (room) {
                  try {
                    await room.switchActiveDevice('audiooutput', 'default');
                  } catch {}
                  await room.startAudio();
                }
                await startAudio();
                const audioElements = document.querySelectorAll('audio');
                for (const audio of Array.from(audioElements)) {
                  if ('setSinkId' in audio && typeof (audio as any).setSinkId === 'function') {
                    try { await (audio as any).setSinkId(''); } catch {}
                  }
                  if (audio.srcObject && audio.paused) {
                    audio.play().catch(() => {});
                  }
                }
              } catch (err) {
                console.error('startAudio error:', err);
              }
            }}
            className="px-3 py-1 bg-white hover:bg-amber-50 rounded-lg font-bold text-amber-800 text-xs shadow-sm transition-all cursor-pointer"
          >
            Enable Audio
          </button>
        </div>
      )}

      {/* 1. TOP BAR */}
      <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-slate-900 text-base tracking-tight">
                {classroom ? `${classroom.course_code}: ${classroom.title}` : 'EduSense Classroom'}
              </h1>
              <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-emerald-200 uppercase tracking-wider">
                LIVE
              </span>
            </div>
            <p className="text-xs text-slate-500">Interactive Real-time Session</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Attendance Status Badge / Roster Button */}
          {!isTeacher ? (
            <>
              <StudentAttendanceStatusBadge
                isCamOn={isCamOn}
                isVerifying={isVerifyingAttendance}
                attendanceData={attendanceData}
              />
              {/* Live Facial Analytics Sampling Status Indicator */}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs shadow-sm text-slate-700">
                <span className={`w-2 h-2 rounded-full ${analyticsStatus.active ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                <span className="font-semibold text-slate-700">Analytics:</span>
                <span className={analyticsStatus.active ? 'text-emerald-600 font-bold' : 'text-slate-500'}>
                  {analyticsStatus.active ? 'Active' : 'Paused'}
                </span>
                {analyticsStatus.dominantEmotion && analyticsStatus.dominantEmotion !== 'no_face_detected' && (
                  <span className="text-[11px] text-blue-600 font-semibold">
                    | Expression: <span className="capitalize">{analyticsStatus.dominantEmotion}</span>
                    {analyticsStatus.confidence !== null && analyticsStatus.confidence > 0 && (
                      <span className="text-slate-400 font-normal"> ({Math.round(analyticsStatus.confidence * 100)}%)</span>
                    )}
                  </span>
                )}
                {analyticsStatus.attentivenessScore !== null && (
                  <span className="text-[11px] text-slate-600 font-semibold">
                    | Attentiveness: {Math.round(analyticsStatus.attentivenessScore * 100)}%
                  </span>
                )}
              </div>
            </>
          ) : (
            <button
              onClick={() => setShowTeacherAttendanceModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl text-xs font-semibold text-blue-700 transition-all shadow-sm"
            >
              <Users className="w-3.5 h-3.5 text-blue-600" />
              <span>Attendance Roster</span>
            </button>
          )}

          {/* Audio Speaker Test & Unmute Button */}
          <button
            onClick={handleTestAudioSound}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 transition-all shadow-sm"
            title="Test speakers with audio chime and unmute all audio streams"
          >
            <Volume2 className="w-3.5 h-3.5 text-blue-600" />
            <span>Test Sound</span>
          </button>

          {/* Connection Status Indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700">
            {connectionState === ConnectionState.Connected ? (
              <>
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                <span className="text-slate-700 font-medium">Connected</span>
              </>
            ) : connectionState === ConnectionState.Reconnecting ? (
              <>
                <RefreshCw className="w-3 h-3 text-amber-500 animate-spin" />
                <span className="text-amber-600 font-medium">Reconnecting...</span>
              </>
            ) : (
              <>
                <div className="w-2 h-2 rounded-full bg-red-500"></div>
                <span className="text-red-600 font-medium">{connectionState}</span>
              </>
            )}
          </div>

          {/* Participant Count Badge */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 shadow-sm">
            <Users className="w-3.5 h-3.5 text-blue-600" />
            <span>{participants.length}</span>
          </div>
        </div>
      </header>

      {/* 2. MAIN AREA */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* VIDEO GRID AREA */}
        <main className="flex-1 p-4 bg-slate-950 overflow-y-auto flex flex-col justify-center">
          {screenShareTrack ? (
            /* Spotlight Screen Share Layout */
            <div className="h-full flex flex-col gap-4">
              <div className="flex-1 bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden relative">
                <VideoTrack trackRef={screenShareTrack} className="w-full h-full object-contain" />
                <div className="absolute top-3 left-3 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800 text-xs font-medium text-white flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-indigo-400" />
                  <span>Screen Share ({screenShareTrack.participant.name || screenShareTrack.participant.identity})</span>
                </div>
              </div>

              {/* Strip of small participant tiles */}
              <div className="h-32 flex gap-3 overflow-x-auto pb-2">
                {participants.map((p) => (
                  <ParticipantTile
                    key={p.sid}
                    participant={p}
                    compact
                    videoRef={p.isLocal ? localVideoRef : undefined}
                    analyticsStatus={p.isLocal ? analyticsStatus : null}
                  />
                ))}
              </div>
            </div>
          ) : (
            /* Standard Grid Layout */
            <div
              className={`grid gap-4 w-full h-full max-h-[85vh] ${
                participants.length === 1
                  ? 'grid-cols-1 max-w-4xl mx-auto'
                  : participants.length === 2
                  ? 'grid-cols-1 md:grid-cols-2'
                  : participants.length <= 4
                  ? 'grid-cols-2'
                  : participants.length <= 9
                  ? 'grid-cols-3'
                  : 'grid-cols-4'
              }`}
            >
              {participants.map((p) => (
                <ParticipantTile
                  key={p.sid}
                  participant={p}
                  videoRef={p.isLocal ? localVideoRef : undefined}
                  analyticsStatus={p.isLocal ? analyticsStatus : null}
                />
              ))}
            </div>
          )}

          {/* FLOATING LIVE CAPTION BAR */}
          {latestCaption && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 max-w-2xl w-[90%] z-20 pointer-events-none transition-all duration-300">
              <div className="bg-slate-900/95 backdrop-blur-md border border-slate-700/80 px-4 py-3 rounded-2xl shadow-2xl flex items-start gap-3 pointer-events-auto">
                <div className="w-8 h-8 rounded-full bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 flex items-center justify-center font-bold text-xs uppercase shrink-0 mt-0.5">
                  {latestCaption.speakerName.substring(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs font-bold text-white">{latestCaption.speakerName}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold uppercase ${
                      latestCaption.speakerRole === 'TEACHER' ? 'bg-purple-900/60 text-purple-300 border border-purple-700/50' : 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/50'
                    }`}>
                      {latestCaption.speakerRole}
                    </span>
                    {latestCaption.language && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                        {latestCaption.language.toUpperCase()}
                      </span>
                    )}
                    {latestCaption.sentimentLabel && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                        latestCaption.sentimentLabel === 'POSITIVE' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/40' :
                        latestCaption.sentimentLabel === 'NEGATIVE' ? 'bg-rose-950 text-rose-300 border border-rose-800/40' :
                        'bg-slate-800 text-slate-300'
                      }`}>
                        {latestCaption.sentimentLabel}
                      </span>
                    )}
                    {latestCaption.is_low_confidence && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/40">
                        Low Confidence (Please Retry)
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-slate-100 leading-snug">
                    "{latestCaption.text}"
                  </p>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* RIGHT DRAWER: PARTICIPANTS */}
        {showParticipants && (
          <aside className="w-80 md:w-88 bg-white border-l border-slate-200 flex flex-col z-10 shrink-0 text-slate-900 shadow-xl">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600" />
                <span>Participants ({participants.length})</span>
              </h3>
              <button
                onClick={() => setShowParticipants(false)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {participants.map((p) => {
                const isSpeaking = p.isSpeaking;
                const micPub = p.getTrackPublication(Track.Source.Microphone);
                const camPub = p.getTrackPublication(Track.Source.Camera);
                const isAudioMuted = !p.isMicrophoneEnabled || (micPub ? micPub.isMuted : true);
                const isVideoMuted = !p.isCameraEnabled || (camPub ? camPub.isMuted : true);
                const isSelf = p.isLocal;

                return (
                  <div
                    key={p.sid}
                    className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between hover:bg-slate-100/70 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center font-bold text-xs uppercase">
                        {p.name ? p.name.substring(0, 2) : p.identity.substring(0, 2)}
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                          <span>{p.name || p.identity}</span>
                          {isSelf && (
                            <span className="text-[10px] text-slate-500 font-normal">(You)</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-slate-400">
                      {isAudioMuted ? (
                        <MicOff className="w-4 h-4 text-red-500" />
                      ) : (
                        <Mic className={`w-4 h-4 ${isSpeaking ? 'text-emerald-600' : 'text-slate-500'}`} />
                      )}

                      {isVideoMuted ? (
                        <VideoOff className="w-4 h-4 text-red-500" />
                      ) : (
                        <VideoIcon className="w-4 h-4 text-slate-500" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        )}

        {/* RIGHT DRAWER: CHAT */}
        {showChat && (
          <aside className="w-80 md:w-88 bg-white border-l border-slate-200 flex flex-col z-10 shrink-0 text-slate-900 shadow-xl">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-blue-600" />
                <span>In-Room Chat</span>
              </h3>
              <button
                onClick={() => setShowChat(false)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 ? (
                <div className="text-center text-slate-400 text-xs py-8">
                  No messages yet. Send a message to class participants!
                </div>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-blue-600">{m.senderName}</span>
                      <span className="text-slate-400">
                        {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 break-words">
                      {m.text}
                    </div>
                  </div>
                ))
              )}
              <div ref={chatBottomRef} />
            </div>

            <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-200 flex gap-2 bg-white">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
              />
              <button
                type="submit"
                className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-sm transition-all"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </aside>
        )}

        {/* RIGHT DRAWER: 5-MINUTE FACIAL WINDOW ANALYTICS (TEACHER ONLY) */}
        {showFacialWindow && isTeacher && (
          <aside className="w-80 md:w-88 bg-white border-l border-slate-200 flex flex-col z-10 shrink-0 text-slate-900 shadow-xl">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-600" />
                <span>5-Minute Facial Analytics</span>
              </h3>
              <button
                onClick={() => setShowFacialWindow(false)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                <span className="text-[10px] uppercase font-bold text-blue-600 tracking-wider">
                  Current 5-Minute Window
                </span>
                <div className="flex items-baseline justify-between">
                  <span className="text-xl font-extrabold text-slate-900 uppercase">
                    {!facialWindowData || facialWindowData?.dominant_expression === 'insufficient_data'
                      ? 'INSUFFICIENT DATA'
                      : facialWindowData.dominant_expression}
                  </span>
                  <span className="text-xs text-slate-500 font-medium">
                    {facialWindowData?.students_with_valid_expression || 0} / {facialWindowData?.students_analyzed || 0} students
                  </span>
                </div>
                <div className="text-[11px] text-slate-500">
                  Window: {facialWindowData?.window_start ? new Date(facialWindowData.window_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '00:00'} – {facialWindowData?.window_end ? new Date(facialWindowData.window_end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '05:00'}
                </div>
              </div>

              {/* Distribution Breakdown */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Expression Distribution
                </h4>
                {['neutral', 'happy', 'sad', 'angry', 'fear'].map((em) => {
                  const pct = Math.round((facialWindowData?.expression_distribution?.[em] || 0) * 100);
                  return (
                    <div key={em} className="space-y-1">
                      <div className="flex justify-between text-xs capitalize text-slate-700">
                        <span>{em}</span>
                        <span className="font-bold text-blue-600">{pct}%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden border border-slate-200">
                        <div
                          className="bg-blue-600 h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2 text-[11px] text-amber-800 leading-relaxed">
                <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Facial-expression classification is based on visible facial characteristics and should be interpreted as a supportive classroom indicator.
                </span>
              </div>
            </div>
          </aside>
        )}

        {/* RIGHT DRAWER: TRANSCRIPTS & LIVE CAPTIONS */}
        {showTranscripts && (
          <aside className="w-80 md:w-96 bg-white border-l border-slate-200 flex flex-col z-10 shrink-0 text-slate-900 shadow-xl">
            {/* Header */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Subtitles className="w-4 h-4 text-blue-600" />
                <span>Speech-to-Text & Captions</span>
              </h3>
              <button
                onClick={() => setShowTranscripts(false)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Sub-tabs: Live, History, Upload */}
            <div className="flex border-b border-slate-200 bg-slate-50 p-1.5 gap-1.5">
              <button
                onClick={() => setTranscriptTab('live')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  transcriptTab === 'live' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Live Speech
              </button>
              <button
                onClick={() => {
                  setTranscriptTab('history');
                  loadSessionHistory();
                }}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  transcriptTab === 'history' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                History ({sessionTranscripts.length})
              </button>
              <button
                onClick={() => setTranscriptTab('upload')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  transcriptTab === 'upload' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Upload Audio
              </button>
            </div>

            {/* Tab 1: Live Speech & Sentiment Studio */}
            {transcriptTab === 'live' && (
              <div className="flex-1 flex flex-col min-h-0">
                {/* Language Selector & Engine Metadata */}
                <div className="p-3 bg-slate-50 border-b border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs text-slate-700 font-medium">
                      <Languages className="w-3.5 h-3.5 text-blue-600" />
                      <span>Target Language:</span>
                    </div>
                    <select
                      value={transcriptionLanguage}
                      onChange={(e) => setTranscriptionLanguage(e.target.value as any)}
                      className="bg-white border border-slate-200 text-xs text-slate-900 rounded-lg px-2.5 py-1 focus:outline-none focus:border-blue-500 font-medium shadow-sm"
                    >
                      <option value="auto">Auto-Detect</option>
                      <option value="en">English (en)</option>
                      <option value="kn">Kannada (kn)</option>
                      <option value="hi">Hindi (hi)</option>
                    </select>
                  </div>

                  {/* Microphone Recorder Control Panel */}
                  <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2.5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${isRecordingSpeech ? 'bg-rose-500 animate-ping' : 'bg-slate-400'}`} />
                        <span className="text-xs font-bold text-slate-900">
                          {isRecordingSpeech ? (
                            <span className="text-rose-600 font-mono">REC {formatTimer(recordingSeconds)}</span>
                          ) : isTranscribingSpeech ? (
                            <span className="text-blue-600">Processing Audio...</span>
                          ) : (
                            'Microphone Ready'
                          )}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono bg-slate-100 px-1.5 py-0.5 rounded">Whisper AI</span>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                      {!isRecordingSpeech ? (
                        <button
                          onClick={startRecordingSpeech}
                          disabled={isTranscribingSpeech}
                          className="flex-1 py-2 px-3 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 disabled:opacity-50 text-white font-semibold text-xs rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm"
                        >
                          <Mic className="w-3.5 h-3.5" />
                          <span>Record Speech</span>
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={stopAndTranscribeSpeech}
                            className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm"
                          >
                            <Square className="w-3.5 h-3.5 fill-white" />
                            <span>Stop & Transcribe</span>
                          </button>
                          <button
                            onClick={cancelRecordingSpeech}
                            className="py-2 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl border border-slate-200 transition-all"
                            title="Cancel recording"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                    </div>

                    {isTranscribingSpeech && (
                      <div className="flex items-center justify-center gap-2 py-1 text-xs text-blue-600">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Transcribing & scoring sentiment...</span>
                      </div>
                    )}
                  </div>

                  {/* Error / Silence Notification Banner */}
                  {speechError && (
                    <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <span className="font-semibold block">Notice:</span>
                        <p className="text-[11px] leading-relaxed text-rose-600">{speechError}</p>
                      </div>
                    </div>
                  )}

                  {!isMicOn && (
                    <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 flex items-center gap-1.5 font-medium">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>Microphone is currently muted in bottom bar. Unmute to speak.</span>
                    </div>
                  )}
                </div>

                {/* Main Content Area: Transcript Review / Edit or Stream */}
                <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
                  {/* Latest Transcript Review & Sentiment Evaluation Card */}
                  {editableTranscript && (
                    <div className="p-3.5 bg-blue-50/50 border border-blue-200 rounded-xl space-y-2.5 shadow-sm">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 text-blue-700 font-bold">
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Review & Correct Transcript</span>
                        </div>
                        {latestSpeechResult?.duration && (
                          <span className="text-[10px] text-slate-500 font-mono">
                            {latestSpeechResult.duration.toFixed(1)}s
                          </span>
                        )}
                      </div>

                      {/* Editable Textarea */}
                      <textarea
                        value={editableTranscript}
                        onChange={(e) => {
                          setEditableTranscript(e.target.value);
                          setHasSharedToClass(false);
                        }}
                        rows={3}
                        className="w-full bg-white border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-xl p-2.5 text-xs text-slate-900 leading-relaxed resize-none focus:outline-none transition-all shadow-sm"
                        placeholder="Transcribed words appear here. You can edit any word..."
                      />

                      {/* Sentiment & Intent Result Display */}
                      {(() => {
                        const sentiment = customSentimentResult || (latestSpeechResult?.sentiment_label ? {
                          sentiment_label: latestSpeechResult.sentiment_label,
                          sentiment_score: latestSpeechResult.sentiment_score,
                          confidence: latestSpeechResult.is_low_confidence ? 0.65 : 0.85,
                          is_question: Boolean(latestSpeechResult.is_question),
                          is_confusion: Boolean(latestSpeechResult.is_confusion),
                          language: latestSpeechResult.language,
                          language_supported: (latestSpeechResult.language || 'en') === 'en',
                          note: undefined,
                        } : null);

                        if (!sentiment) return null;

                        const isPos = sentiment.sentiment_label?.toLowerCase() === 'positive';
                        const isNeg = sentiment.sentiment_label?.toLowerCase() === 'negative';
                        const isUnsupported = sentiment.sentiment_label?.toLowerCase() === 'unsupported_language' || !sentiment.language_supported;

                        return (
                          <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2 shadow-sm">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                Text Sentiment Analysis
                              </span>
                              <div className="flex items-center gap-1.5">
                                {isUnsupported ? (
                                  <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                    Unsupported Language
                                  </span>
                                ) : (
                                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                                    isPos ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                    isNeg ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                                    'bg-slate-100 text-slate-700 border border-slate-200'
                                  }`}>
                                    {sentiment.sentiment_label}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Valence and Confidence Metrics */}
                            {!isUnsupported ? (
                              <div className="flex items-center gap-3 text-[11px] text-slate-600 font-mono">
                                {sentiment.sentiment_score !== null && sentiment.sentiment_score !== undefined && (
                                  <span>Score: <b className="text-slate-900">{sentiment.sentiment_score > 0 ? `+${sentiment.sentiment_score}` : sentiment.sentiment_score}</b></span>
                                )}
                                {sentiment.confidence !== null && sentiment.confidence !== undefined && (
                                  <span>Confidence: <b className="text-slate-900">{Math.round(sentiment.confidence * 100)}%</b></span>
                                )}
                              </div>
                            ) : (
                              <p className="text-[10px] text-amber-700 leading-normal">
                                ℹ️ Rule-based text sentiment is calibrated for English. Sentiment for this language is not currently supported.
                              </p>
                            )}

                            {/* Intent Badges */}
                            <div className="flex items-center gap-1.5 pt-0.5">
                              {sentiment.is_question && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
                                  ❓ Question Detected
                                </span>
                              )}
                              {sentiment.is_confusion && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-semibold">
                                  💡 Query / Confusion
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Review Actions */}
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={handleRerunSentiment}
                          disabled={isEvaluatingSentiment || !editableTranscript.trim()}
                          className="flex-1 py-1.5 px-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 shadow-sm"
                        >
                          <Sparkles className={`w-3.5 h-3.5 text-blue-600 ${isEvaluatingSentiment ? 'animate-spin' : ''}`} />
                          <span>{isEvaluatingSentiment ? 'Analyzing...' : 'Rerun Sentiment'}</span>
                        </button>
                        <button
                          onClick={handleShareToClassroom}
                          disabled={hasSharedToClass || !editableTranscript.trim()}
                          className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                            hasSharedToClass
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                          }`}
                        >
                          {hasSharedToClass ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Shared to Class!</span>
                            </>
                          ) : (
                            <>
                              <Share2 className="w-3.5 h-3.5" />
                              <span>Post to Captions</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Classroom Transcripts Feed Header */}
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-500 pt-1 border-t border-slate-200">
                    <span>Classroom Transcripts Stream</span>
                    <span className="text-[10px] font-mono text-slate-400">{liveTranscripts.length} entries</span>
                  </div>

                  {liveTranscripts.length === 0 ? (
                    <div className="text-center text-slate-400 text-xs py-8 px-4 space-y-2">
                      <Subtitles className="w-7 h-7 text-slate-300 mx-auto" />
                      <p className="font-medium text-slate-600">No transcripts posted yet</p>
                      <p className="text-[11px] text-slate-400">
                        Record your voice above or upload audio to generate accurate Whisper transcripts and text sentiment!
                      </p>
                    </div>
                  ) : (
                    liveTranscripts.map((t) => (
                      <div
                        key={t.id}
                        className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 shadow-sm"
                      >
                        <div className="flex items-center justify-between text-[11px]">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900">{t.speakerName}</span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase ${
                              t.speakerRole === 'TEACHER' ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}>
                              {t.speakerRole}
                            </span>
                          </div>
                          <span className="text-slate-400 font-mono text-[10px]">
                            {new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-xs text-slate-800 leading-relaxed font-sans">
                          "{t.text}"
                        </p>
                        <div className="flex items-center gap-2 pt-0.5">
                          {t.language && (
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white text-slate-600 border border-slate-200">
                              {t.language.toUpperCase()}
                            </span>
                          )}
                          {t.sentimentLabel && (
                            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                              t.sentimentLabel.toUpperCase() === 'POSITIVE' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                              t.sentimentLabel.toUpperCase() === 'NEGATIVE' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                              t.sentimentLabel.toUpperCase() === 'UNSUPPORTED_LANGUAGE' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                              'bg-white text-slate-600 border border-slate-200'
                            }`}>
                              {t.sentimentLabel.toUpperCase()}
                            </span>
                          )}
                          {t.is_low_confidence && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                              Low Confidence
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={transcriptsBottomRef} />
                </div>
              </div>
            )}

            {/* Tab 2: Session Transcripts History */}
            {transcriptTab === 'history' && (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">
                    Saved Session Transcripts
                  </span>
                  <button
                    onClick={loadSessionHistory}
                    disabled={isLoadingHistory}
                    className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoadingHistory ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-0">
                  {isLoadingHistory ? (
                    <div className="text-center text-slate-400 text-xs py-8">
                      Loading session transcripts...
                    </div>
                  ) : sessionTranscripts.length === 0 ? (
                    <div className="text-center text-slate-400 text-xs py-8">
                      No saved transcripts recorded for this session yet.
                    </div>
                  ) : (
                    sessionTranscripts.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 shadow-sm"
                      >
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-blue-600">{item.speaker_name}</span>
                          <span className="text-slate-400 text-[10px]">
                            {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-xs text-slate-800 leading-relaxed font-sans">
                          "{item.text}"
                        </p>
                        <div className="flex items-center gap-2 pt-0.5">
                          {item.language && (
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white text-slate-600 border border-slate-200">
                              {item.language.toUpperCase()}
                            </span>
                          )}
                          {item.sentiment_label && (
                            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                              item.sentiment_label === 'POSITIVE' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                              item.sentiment_label === 'NEGATIVE' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                              'bg-white text-slate-600 border border-slate-200'
                            }`}>
                              {item.sentiment_label}
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Tab 3: Upload Audio File */}
            {transcriptTab === 'upload' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
                <form onSubmit={handleAudioUpload} className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Target Language</label>
                    <select
                      value={transcriptionLanguage}
                      onChange={(e) => setTranscriptionLanguage(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-200 text-xs text-slate-900 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500 font-medium"
                    >
                      <option value="auto">Auto-Detect</option>
                      <option value="en">English (en)</option>
                      <option value="kn">Kannada (kn)</option>
                      <option value="hi">Hindi (hi)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Select Audio File</label>
                    <input
                      type="file"
                      accept="audio/*,.wav,.mp3,.m4a,.webm,.ogg,.flac"
                      onChange={(e) => setSelectedAudioFile(e.target.files?.[0] || null)}
                      className="w-full text-xs text-slate-700 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 bg-slate-50 border border-slate-200 rounded-xl p-2 cursor-pointer"
                    />
                  </div>

                  {uploadError && (
                    <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
                      {uploadError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={!selectedAudioFile || isUploadingAudio}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium text-xs rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm"
                  >
                    {isUploadingAudio ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Transcribing with Whisper AI...</span>
                      </>
                    ) : (
                      <>
                        <UploadCloud className="w-4 h-4" />
                        <span>Transcribe Audio File</span>
                      </>
                    )}
                  </button>
                </form>

                {uploadedTranscriptResult && (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 shadow-sm">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-blue-600">Transcription Result</span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        Lang: {uploadedTranscriptResult.language.toUpperCase()} | {uploadedTranscriptResult.duration.toFixed(1)}s
                      </span>
                    </div>
                    <p className="text-xs text-slate-800 leading-relaxed font-sans bg-white p-2.5 rounded-xl border border-slate-200">
                      "{uploadedTranscriptResult.text}"
                    </p>
                    {uploadedTranscriptResult.is_low_confidence && (
                      <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                        ⚠️ Low recognition confidence. Spoken audio may contain background noise or unclear speech. Please retry if inaccurate.
                      </div>
                    )}
                    {uploadedTranscriptResult.segments && uploadedTranscriptResult.segments.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                          Timestamped Segments ({uploadedTranscriptResult.segments.length})
                        </span>
                        <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                          {uploadedTranscriptResult.segments.map((seg) => (
                            <div key={seg.id} className="text-[11px] text-slate-700 flex items-start gap-1.5">
                              <span className="text-slate-400 font-mono shrink-0">
                                [{seg.start.toFixed(1)}s - {seg.end.toFixed(1)}s]
                              </span>
                              <span>{seg.text}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </aside>
        )}
      </div>

      {/* 3. BOTTOM CONTROL BAR */}
      <footer className="h-20 bg-white border-t border-slate-200 px-6 flex items-center justify-between shrink-0 z-20 shadow-sm">
        <div className="flex items-center gap-2">
          {/* Microphone Toggle */}
          <button
            onClick={toggleMicrophone}
            className={`p-3 rounded-2xl transition-all flex items-center justify-center ${
              isMicOn
                ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                : 'bg-red-600 text-white hover:bg-red-700 shadow-sm'
            }`}
            title={isMicOn ? 'Mute Microphone' : 'Unmute Microphone'}
          >
            {isMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </button>

          {/* Camera Toggle */}
          <button
            onClick={toggleCamera}
            className={`p-3 rounded-2xl transition-all flex items-center justify-center ${
              isCamOn
                ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                : 'bg-red-600 text-white hover:bg-red-700 shadow-sm'
            }`}
            title={isCamOn ? 'Turn Off Camera' : 'Turn On Camera'}
          >
            {isCamOn ? <VideoIcon className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </button>

          {/* Screen Share Toggle */}
          <button
            onClick={toggleScreenShare}
            className={`p-3 rounded-2xl transition-all flex items-center justify-center ${
              isScreenSharing
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
            }`}
            title="Screen Share"
          >
            <Monitor className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Participants Toggle */}
          <button
            onClick={() => {
              setShowParticipants(!showParticipants);
              if (showChat) setShowChat(false);
              if (showFacialWindow) setShowFacialWindow(false);
              if (showTranscripts) setShowTranscripts(false);
            }}
            className={`px-4 py-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 transition-all ${
              showParticipants ? 'bg-blue-50 text-blue-600 border border-blue-200 shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
            }`}
          >
            <Users className="w-4 h-4 text-blue-600" />
            <span>Participants</span>
          </button>

          {/* Chat Toggle */}
          <button
            onClick={() => {
              setShowChat(!showChat);
              if (showParticipants) setShowParticipants(false);
              if (showFacialWindow) setShowFacialWindow(false);
              if (showTranscripts) setShowTranscripts(false);
            }}
            className={`px-4 py-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 transition-all ${
              showChat ? 'bg-blue-50 text-blue-600 border border-blue-200 shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
            }`}
          >
            <MessageSquare className="w-4 h-4 text-blue-600" />
            <span>Chat</span>
          </button>

          {/* Live Captions & Transcripts Toggle */}
          <button
            onClick={() => {
              setShowTranscripts(!showTranscripts);
              if (showParticipants) setShowParticipants(false);
              if (showChat) setShowChat(false);
              if (showFacialWindow) setShowFacialWindow(false);
            }}
            className={`px-4 py-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 transition-all ${
              showTranscripts ? 'bg-blue-50 text-blue-600 border border-blue-200 shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
            }`}
          >
            <Subtitles className="w-4 h-4 text-blue-600" />
            <span>Transcripts</span>
            {isRecordingSpeech && (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse ml-0.5" />
            )}
          </button>

          {/* Teacher Facial Analytics Window Toggle */}
          {isTeacher && (
            <button
              onClick={() => {
                setShowFacialWindow(!showFacialWindow);
                if (showChat) setShowChat(false);
                if (showParticipants) setShowParticipants(false);
                if (showTranscripts) setShowTranscripts(false);
              }}
              className={`px-4 py-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 transition-all ${
                showFacialWindow ? 'bg-blue-50 text-blue-600 border border-blue-200 shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              <BarChart3 className="w-4 h-4 text-blue-600" />
              <span>Facial Analytics</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          {/* Student/Teacher Leave Class */}
          <button
            onClick={handleLeaveClass}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl border border-slate-200 transition-all"
          >
            <LogOut className="w-4 h-4" />
            <span>Leave Class</span>
          </button>

          {/* Teacher-Only End Class Button */}
          {isTeacher && (
            <button
              onClick={handleEndClass}
              className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs rounded-xl transition-all shadow-sm"
            >
              <Power className="w-4 h-4" />
              <span>End Class</span>
            </button>
          )}
        </div>
      </footer>

      {/* TEACHER ATTENDANCE ROSTER MODAL */}
      <TeacherAttendanceModal
        isOpen={showTeacherAttendanceModal}
        onClose={() => setShowTeacherAttendanceModal(false)}
        sessionId={sessionId}
      />
    </div>
  );
};

// PARTICIPANT VIDEO TILE COMPONENT
const ParticipantTile: React.FC<{
  participant: Participant;
  compact?: boolean;
  videoRef?: React.Ref<HTMLVideoElement>;
  analyticsStatus?: {
    active: boolean;
    dominantEmotion: string | null;
    confidence: number | null;
    predictionStatus: string | null;
    qualityStatus: string | null;
    isDistracted: boolean;
  } | null;
}> = ({
  participant,
  compact = false,
  videoRef,
  analyticsStatus,
}) => {
  const cameraPub = participant.getTrackPublication(Track.Source.Camera);
  const micPub = participant.getTrackPublication(Track.Source.Microphone);

  const isCameraActive =
    participant.isCameraEnabled &&
    cameraPub &&
    cameraPub.track &&
    !cameraPub.isMuted;

  const cameraTrack: TrackReference | null = isCameraActive
    ? {
        participant,
        source: Track.Source.Camera,
        publication: cameraPub,
      }
    : null;

  const isAudioMuted = !participant.isMicrophoneEnabled || (micPub ? micPub.isMuted : true);
  const isSpeaking = participant.isSpeaking;

  const displayName = participant.name || participant.identity;
  const initials = displayName ? displayName.substring(0, 2).toUpperCase() : 'P';

  return (
    <div
      className={`relative bg-slate-900 border rounded-2xl overflow-hidden flex flex-col items-center justify-center shadow-lg transition-all ${
        isSpeaking ? 'border-emerald-500 ring-2 ring-emerald-500/30' : 'border-slate-800'
      } ${compact ? 'w-44 h-full shrink-0' : 'w-full h-full'}`}
    >
      {/* Video Track Rendering */}
      {cameraTrack ? (
        <VideoTrack
          ref={videoRef}
          trackRef={cameraTrack}
          className="w-full h-full object-cover"
        />
      ) : (
        /* Fallback Avatar */
        <div className="flex flex-col items-center gap-3 p-4">
          <div className="w-16 h-16 rounded-full bg-indigo-600/30 border-2 border-indigo-500/40 text-indigo-200 flex items-center justify-center font-bold text-xl uppercase shadow-inner">
            {initials}
          </div>
          {!compact && (
            <span className="text-sm font-semibold text-slate-300">{displayName}</span>
          )}
        </div>
      )}

      {/* Live AI Facial Expression & Emotion Badge Overlay (For Local Student) */}
      {participant.isLocal && analyticsStatus && analyticsStatus.active && (
        <div className="absolute top-3 right-3 z-10 pointer-events-none">
          <div className="bg-slate-950/85 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-700/80 text-xs font-medium shadow-xl flex items-center gap-1.5 transition-all">
            {analyticsStatus.predictionStatus === 'no_face' ? (
              <span className="text-amber-400 flex items-center gap-1 font-semibold">
                <span>⚠️</span> No Face Detected
              </span>
            ) : analyticsStatus.qualityStatus && analyticsStatus.qualityStatus !== 'good' ? (
              <span className="text-amber-400 flex items-center gap-1 font-semibold">
                <span>⚠️</span> Low Lighting / Quality
              </span>
            ) : analyticsStatus.dominantEmotion === 'uncertain' || analyticsStatus.predictionStatus === 'low_confidence' ? (
              <span className="text-slate-300 flex items-center gap-1">
                <span>🤔</span> Evaluating Expression...
              </span>
            ) : analyticsStatus.dominantEmotion ? (
              <span className="flex items-center gap-1.5 font-semibold text-white">
                <span>
                  {analyticsStatus.dominantEmotion === 'happy' ? '😊' :
                   analyticsStatus.dominantEmotion === 'neutral' ? '😐' :
                   analyticsStatus.dominantEmotion === 'surprise' ? '😲' :
                   analyticsStatus.dominantEmotion === 'sad' ? '😔' :
                   analyticsStatus.dominantEmotion === 'angry' ? '😠' :
                   analyticsStatus.dominantEmotion === 'fear' ? '😨' :
                   analyticsStatus.dominantEmotion === 'disgust' ? '😣' : '😐'}
                </span>
                <span className="capitalize text-emerald-400">
                  {analyticsStatus.dominantEmotion}
                </span>
                {analyticsStatus.confidence !== null && analyticsStatus.confidence > 0 && (
                  <span className="text-[11px] text-slate-300 font-normal">
                    ({Math.round(analyticsStatus.confidence * 100)}%)
                  </span>
                )}
                {analyticsStatus.isDistracted && (
                  <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    Looking Away
                  </span>
                )}
              </span>
            ) : (
              <span className="text-slate-400">AI Emotion: Standby</span>
            )}
          </div>
        </div>
      )}

      {/* Name and Status Overlay */}
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-none z-10">
        <div className="bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800/80 text-xs font-semibold text-white flex items-center gap-2 shadow">
          <span>{displayName}{participant.isLocal ? ' (You)' : ''}</span>
          {isSpeaking && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          )}
        </div>

        <div className="p-1.5 bg-slate-950/80 backdrop-blur-md rounded-xl border border-slate-800/80 text-white shadow">
          {isAudioMuted ? (
            <MicOff className="w-3.5 h-3.5 text-red-400" />
          ) : (
            <Mic className={`w-3.5 h-3.5 ${isSpeaking ? 'text-emerald-400' : 'text-slate-300'}`} />
          )}
        </div>
      </div>
    </div>
  );
};

