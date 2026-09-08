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
import { sessionApi, classroomApi, attendanceApi } from '../services/api';
import type { JoinSessionResponse, ChatMessage, Classroom, ClassSession, AttendanceVerificationResponse } from '../types';
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
      <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-center items-center font-sans space-y-4">
        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-400 text-sm">Authenticating & generating secure LiveKit token...</p>
      </div>
    );
  }

  if (error || !joinData) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-center items-center font-sans p-6 space-y-4">
        <div className="p-4 bg-red-950/60 border border-red-800 rounded-2xl max-w-md w-full text-center space-y-3">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
          <h2 className="text-lg font-bold text-red-200">Classroom Join Failed</h2>
          <p className="text-sm text-slate-300">{error || 'Unable to connect to session'}</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-xl text-sm transition-all"
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
      serverUrl={joinData.server_url}
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
  const [showTeacherAttendanceModal, setShowTeacherAttendanceModal] = useState(false);

  // Local media states
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  // Attendance state for student
  const [attendanceData, setAttendanceData] = useState<AttendanceVerificationResponse | null>(null);
  const [isVerifyingAttendance, setIsVerifyingAttendance] = useState(false);
  const isVerifyingRef = useRef(false);

  // Periodic Face Attendance Sampling Effect (Student camera ON)
  useEffect(() => {
    if (isTeacher || !isCamOn || !sessionId) return;

    const captureAndVerifyFrame = async () => {
      if (isVerifyingRef.current) return; // Debounce / Throttling

      // Sample base64 image from local student video DOM element
      const allVideos = Array.from(document.querySelectorAll('video'));
      // Prefer local participant video element to avoid sampling remote teacher/student video
      const targetVideo = allVideos.find(v =>
        v.closest('[data-lk-local-participant="true"]') !== null ||
        v.getAttribute('data-lk-local-participant') === 'true' ||
        v.classList.contains('lk-local-participant')
      ) || allVideos.find(v => v.videoWidth > 0 && v.videoHeight > 0);

      let sampleB64: string | null = null;

      if (targetVideo && targetVideo.videoWidth > 0 && targetVideo.videoHeight > 0) {
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
    // Periodic interval every 10s
    const interval = setInterval(captureAndVerifyFrame, 10000);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [isTeacher, isCamOn, sessionId]);

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

  // Listen for LiveKit Data Messages (Real-time chat & End session events)
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

    room.on(RoomEvent.AudioPlaybackStatusChanged, handleAudioPlaybackStatusChanged);

    runPlaybackDiagnostics();
    const interval = setInterval(runPlaybackDiagnostics, 3000);

    return () => {
      clearInterval(interval);
      room.off(RoomEvent.AudioPlaybackStatusChanged, handleAudioPlaybackStatusChanged);
    };
  }, [room, localParticipant]);

  // Test Audio Sound & Unmute All Streams
  const handleTestAudioSound = () => {
    try {
      if (room) {
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

      // Force play & unmute all DOM audio elements
      document.querySelectorAll('audio').forEach((el) => {
        el.muted = false;
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
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* Browser Autoplay Policy Banner */}
      {(!canPlayAudio || (room && !room.canPlaybackAudio)) && (
        <div className="bg-amber-600 text-white text-xs px-6 py-2 flex items-center justify-between z-30 shrink-0 shadow">
          <span>Browser audio playback requires user permission. Click "Enable Audio" to unblock classroom sound.</span>
          <button
            onClick={async () => {
              console.log('[LIVEKIT MANUAL START AUDIO CLICKED]');
              try {
                if (room) await room.startAudio();
                await startAudio();
              } catch (err) {
                console.error('startAudio error:', err);
              }
            }}
            className="px-3 py-1 bg-amber-800 hover:bg-amber-900 rounded-lg font-bold text-white text-xs shadow transition-all cursor-pointer"
          >
            Enable Audio
          </button>
        </div>
      )}

      {/* 1. TOP BAR */}
      <header className="h-16 bg-slate-900/90 border-b border-slate-800 px-6 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-white text-base tracking-tight">
                {classroom ? `${classroom.course_code}: ${classroom.title}` : 'EduSense Classroom'}
              </h1>
              <span className="bg-emerald-950 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-800 uppercase tracking-wider">
                LIVE
              </span>
            </div>
            <p className="text-xs text-slate-400">Interactive Real-time Session</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Attendance Status Badge / Roster Button */}
          {!isTeacher ? (
            <StudentAttendanceStatusBadge
              isCamOn={isCamOn}
              isVerifying={isVerifyingAttendance}
              attendanceData={attendanceData}
            />
          ) : (
            <button
              onClick={() => setShowTeacherAttendanceModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-800/60 rounded-xl text-xs font-semibold text-indigo-300 transition-all shadow"
            >
              <Users className="w-3.5 h-3.5 text-indigo-400" />
              <span>Attendance Roster</span>
            </button>
          )}

          {/* Audio Speaker Test & Unmute Button */}
          <button
            onClick={handleTestAudioSound}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs font-medium text-indigo-300 transition-all shadow"
            title="Test speakers with audio chime and unmute all audio streams"
          >
            <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
            <span>Test Sound</span>
          </button>

          {/* Connection Status Indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs">
            {connectionState === ConnectionState.Connected ? (
              <>
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
                <span className="text-slate-300 font-medium">Connected</span>
              </>
            ) : connectionState === ConnectionState.Reconnecting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                <span className="text-amber-300 font-medium">Reconnecting...</span>
              </>
            ) : (
              <>
                <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
                <span className="text-red-300 font-medium">{connectionState}</span>
              </>
            )}
          </div>

          {/* Participant Count Badge */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-semibold text-slate-200">
            <Users className="w-4 h-4 text-indigo-400" />
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
                  <ParticipantTile key={p.sid} participant={p} compact />
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
                <ParticipantTile key={p.sid} participant={p} />
              ))}
            </div>
          )}
        </main>

        {/* RIGHT DRAWER: PARTICIPANTS */}
        {showParticipants && (
          <aside className="w-80 bg-slate-900 border-l border-slate-800 flex flex-col z-10 shrink-0">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-400" />
                <span>Participants ({participants.length})</span>
              </h3>
              <button
                onClick={() => setShowParticipants(false)}
                className="text-slate-400 hover:text-white text-sm"
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
                    className="p-3 bg-slate-950 border border-slate-800/80 rounded-xl flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 flex items-center justify-center font-bold text-xs uppercase">
                        {p.name ? p.name.substring(0, 2) : p.identity.substring(0, 2)}
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                          <span>{p.name || p.identity}</span>
                          {isSelf && (
                            <span className="text-[10px] text-slate-400 font-normal">(You)</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-slate-400">
                      {isAudioMuted ? (
                        <MicOff className="w-4 h-4 text-red-400" />
                      ) : (
                        <Mic className={`w-4 h-4 ${isSpeaking ? 'text-emerald-400' : 'text-slate-400'}`} />
                      )}

                      {isVideoMuted ? (
                        <VideoOff className="w-4 h-4 text-red-400" />
                      ) : (
                        <VideoIcon className="w-4 h-4 text-slate-400" />
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
          <aside className="w-80 bg-slate-900 border-l border-slate-800 flex flex-col z-10 shrink-0">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-indigo-400" />
                <span>In-Room Chat</span>
              </h3>
              <button
                onClick={() => setShowChat(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 ? (
                <div className="text-center text-slate-500 text-xs py-8">
                  No messages yet. Send a message to class participants!
                </div>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-indigo-300">{m.senderName}</span>
                      <span className="text-slate-500">
                        {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="p-2.5 bg-slate-950 border border-slate-800/80 rounded-xl text-xs text-slate-200 break-words">
                      {m.text}
                    </div>
                  </div>
                ))
              )}
              <div ref={chatBottomRef} />
            </div>

            <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-800 flex gap-2">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </aside>
        )}
      </div>

      {/* 3. BOTTOM CONTROL BAR */}
      <footer className="h-20 bg-slate-900 border-t border-slate-800 px-6 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-2">
          {/* Microphone Toggle */}
          <button
            onClick={toggleMicrophone}
            className={`p-3 rounded-2xl transition-all flex items-center justify-center ${
              isMicOn
                ? 'bg-slate-800 text-white hover:bg-slate-700'
                : 'bg-red-600 text-white hover:bg-red-500 shadow-lg shadow-red-600/20'
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
                ? 'bg-slate-800 text-white hover:bg-slate-700'
                : 'bg-red-600 text-white hover:bg-red-500 shadow-lg shadow-red-600/20'
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
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                : 'bg-slate-800 text-white hover:bg-slate-700'
            }`}
            title="Screen Share"
          >
            <Monitor className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* Participants Toggle */}
          <button
            onClick={() => {
              setShowParticipants(!showParticipants);
              if (showChat) setShowChat(false);
            }}
            className={`px-4 py-2.5 rounded-xl font-medium text-xs flex items-center gap-2 transition-all ${
              showParticipants ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Participants</span>
          </button>

          {/* Chat Toggle */}
          <button
            onClick={() => {
              setShowChat(!showChat);
              if (showParticipants) setShowParticipants(false);
            }}
            className={`px-4 py-2.5 rounded-xl font-medium text-xs flex items-center gap-2 transition-all ${
              showChat ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Chat</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* Student/Teacher Leave Class */}
          <button
            onClick={handleLeaveClass}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs rounded-xl transition-all"
          >
            <LogOut className="w-4 h-4" />
            <span>Leave Class</span>
          </button>

          {/* Teacher-Only End Class Button */}
          {isTeacher && (
            <button
              onClick={handleEndClass}
              className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white font-medium text-xs rounded-xl transition-all shadow-lg shadow-red-600/20"
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
const ParticipantTile: React.FC<{ participant: Participant; compact?: boolean }> = ({
  participant,
  compact = false,
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
        <VideoTrack trackRef={cameraTrack} className="w-full h-full object-cover" />
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

