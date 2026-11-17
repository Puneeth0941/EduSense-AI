import React, { useState, useEffect, useMemo } from 'react';
import { analyticsApi, attendanceApi } from '../services/api';
import type {
  ClassSession,
  SessionAnalyticsOverview,
  SessionAttendanceSummaryResponse,
  FacialWindowAnalytics,
  SessionFacialSummary,
  StudentEngagementSummary,
} from '../types';
import {
  Users,
  Sparkles,
  Mic,
  Smile,
  RefreshCw,
  Info,
  CheckCircle2,
  FileText,
  Printer,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Eye,
  X,
  Globe,
} from 'lucide-react';

interface AnalyticsDashboardProps {
  sessions: ClassSession[];
  isTeacher: boolean;
  initialSessionId?: string;
  onSelectSession?: (sessionId: string) => void;
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  sessions,
  isTeacher: _isTeacher,
  initialSessionId,
  onSelectSession,
}) => {
  const [selectedSessionId, setSelectedSessionId] = useState<string>(initialSessionId || '');
  const [analyticsOverview, setAnalyticsOverview] = useState<SessionAnalyticsOverview | null>(null);
  const [attendanceSummary, setAttendanceSummary] = useState<SessionAttendanceSummaryResponse | null>(null);
  const [facialWindow, setFacialWindow] = useState<FacialWindowAnalytics | null>(null);
  const [facialSummary, setFacialSummary] = useState<SessionFacialSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filter tabs: 'all' | 'needs_attention' | 'with_data'
  const [activeFilter, setActiveFilter] = useState<'all' | 'needs_attention' | 'with_data'>('all');

  // Student details modal state
  const [selectedStudent, setSelectedStudent] = useState<StudentEngagementSummary | null>(null);

  // Collapsible Advanced Analytics section
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  // Deduplicate sessions by ID to ensure clean dropdown and state
  const uniqueSessions = useMemo(() => {
    const map = new Map<string, ClassSession>();
    sessions.forEach((s) => {
      if (s && s.id && !map.has(s.id)) {
        map.set(s.id, s);
      }
    });
    return Array.from(map.values());
  }, [sessions]);

  // Sync selected session when sessions list updates
  useEffect(() => {
    if (uniqueSessions.length > 0) {
      const exists = uniqueSessions.some((s) => s.id === selectedSessionId);
      if (!selectedSessionId || !exists) {
        const targetId = (initialSessionId && uniqueSessions.some((s) => s.id === initialSessionId))
          ? initialSessionId
          : uniqueSessions[0].id;
        setSelectedSessionId(targetId);
      }
    }
  }, [uniqueSessions, initialSessionId]);

  // Fetch all analytics data for selected session
  const fetchSessionAnalytics = async (sessionId: string) => {
    if (!sessionId) return;
    try {
      setLoading(true);
      setError(null);

      // Fetch overview, attendance summary, and facial data in parallel
      const [overviewData, attData, facialWinData, facialSummData] = await Promise.all([
        analyticsApi.getSessionOverview(sessionId).catch((err) => {
          console.warn('[ANALYTICS] Overview fetch warning:', err);
          return null;
        }),
        attendanceApi.getSessionAttendance(sessionId).catch((err) => {
          console.warn('[ANALYTICS] Attendance fetch warning:', err);
          return null;
        }),
        (typeof analyticsApi.getFacialWindowAnalytics === 'function'
          ? analyticsApi.getFacialWindowAnalytics(sessionId)
          : analyticsApi.getClassroomFacialWindow(sessionId)
        ).catch((err) => {
          console.warn('[ANALYTICS] Facial window fetch warning:', err);
          return null;
        }),
        analyticsApi.getSessionFacialSummary(sessionId).catch((err) => {
          console.warn('[ANALYTICS] Facial summary fetch warning:', err);
          return null;
        }),
      ]);

      setAnalyticsOverview(overviewData);
      setAttendanceSummary(attData);
      setFacialWindow(facialWinData);
      setFacialSummary(facialSummData);
    } catch (err: any) {
      console.error('[ANALYTICS] Fetch session analytics error:', err);
      setError(err.message || 'Failed to fetch session analytics data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSessionId) {
      fetchSessionAnalytics(selectedSessionId);
    }
  }, [selectedSessionId]);

  const selectedSession = uniqueSessions.find((s) => s.id === selectedSessionId) || sessions.find((s) => s.id === selectedSessionId);

  // Quick stats calculations
  const totalPresentCount = attendanceSummary?.present_count ?? 0;
  const totalEnrolledCount = (attendanceSummary as any)?.total_enrolled ?? attendanceSummary?.total_students ?? 0;
  const studentSummaries = analyticsOverview?.student_summaries || [];

  // Students with sufficient speech or facial data
  const studentsWithDataCount = useMemo(() => {
    return studentSummaries.filter(
      (s) =>
        (s.speech_sentiment && s.speech_sentiment.valid_analyzed_segments > 0) ||
        (s.facial_summary && s.facial_summary.valid_samples > 0)
    ).length;
  }, [studentSummaries]);

  // Students who may need teacher attention
  const studentsNeedingAttentionCount = useMemo(() => {
    return studentSummaries.filter((s) => {
      const isNegSpeech = s.speech_sentiment?.dominant_sentiment === 'negative';
      const isConfused = s.speech_sentiment?.dominant_sentiment === 'confused';
      const hasManyDistractions = (s.distraction_count || 0) >= 3;
      return isNegSpeech || isConfused || hasManyDistractions;
    }).length;
  }, [studentSummaries]);

  // Total speech segments in session
  const totalSpeechSegments =
    analyticsOverview?.classroom_speech_sentiment?.total_student_transcripts ?? 0;

  // Filtered student list for table
  const displayedStudents = useMemo(() => {
    if (activeFilter === 'needs_attention') {
      return studentSummaries.filter((s) => {
        const isNegSpeech = s.speech_sentiment?.dominant_sentiment === 'negative';
        const isConfused = s.speech_sentiment?.dominant_sentiment === 'confused';
        const hasManyDistractions = (s.distraction_count || 0) >= 3;
        return isNegSpeech || isConfused || hasManyDistractions;
      });
    }
    if (activeFilter === 'with_data') {
      return studentSummaries.filter(
        (s) =>
          (s.speech_sentiment && s.speech_sentiment.valid_analyzed_segments > 0) ||
          (s.facial_summary && s.facial_summary.valid_samples > 0)
      );
    }
    return studentSummaries;
  }, [studentSummaries, activeFilter]);

  // Map attendance record to student
  const getStudentAttendance = (student: StudentEngagementSummary) => {
    if (!attendanceSummary?.records) return 'UNKNOWN';
    const rec = attendanceSummary.records.find((r) => r.student_id === student.student_id);
    return rec ? rec.status : 'IN_ROOM';
  };

  // Flag if student needs teacher attention
  const needsTeacherAttention = (student: StudentEngagementSummary) => {
    const isNeg = student.speech_sentiment?.dominant_sentiment === 'negative';
    const isConfused = student.speech_sentiment?.dominant_sentiment === 'confused';
    const highDistractions = (student.distraction_count || 0) >= 3;
    return isNeg || isConfused || highDistractions;
  };

  return (
    <div className="space-y-6">
      {/* 1. TOP HEADER & SESSION SELECTOR */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="bg-blue-50 text-blue-700 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-blue-100 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-blue-600" />
              <span>Multimodal Analytics</span>
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Classroom Engagement & Attendance Analytics</h2>
          <p className="text-xs text-slate-500">
            Monitor real-time student attendance, speech sentiment, visible facial expressions, and student check-ins.
          </p>
        </div>

        {/* Controls: Selector & Refresh */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="w-full md:w-72">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Select Class Session
            </label>
            <div className="relative">
              <select
                value={selectedSessionId}
                onChange={(e) => {
                  const newId = e.target.value;
                  setSelectedSessionId(newId);
                  if (onSelectSession) onSelectSession(newId);
                }}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500 appearance-none pr-8 font-medium"
              >
                {uniqueSessions.length === 0 ? (
                  <option value="">No sessions available</option>
                ) : (
                  uniqueSessions.map((sess) => (
                    <option key={sess.id} value={sess.id}>
                      {sess.title} ({sess.status})
                    </option>
                  ))
                )}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
            </div>
          </div>

          <button
            onClick={() => selectedSessionId && fetchSessionAnalytics(selectedSessionId)}
            disabled={loading || !selectedSessionId}
            title="Refresh analytics data"
            className="mt-4 p-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg border border-slate-200 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* AI GUIDANCE BANNER */}
      <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl flex items-start gap-3">
        <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-900 leading-relaxed">
          <strong className="font-semibold text-amber-950">AI Transparency Note:</strong> Speech sentiment analyzes the words spoken. Facial analysis reflects visible camera expressions. These serve as supportive classroom engagement indicators and do not prove a student's internal emotional state.
        </div>
      </div>

      {/* ERROR / RETRY VIEW */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between text-red-700 text-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
          <button
            onClick={() => selectedSessionId && fetchSessionAnalytics(selectedSessionId)}
            className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-800 rounded font-bold text-xs"
          >
            Retry
          </button>
        </div>
      )}

      {/* LOADING STATE */}
      {loading ? (
        <div className="p-16 text-center bg-white border border-slate-200 rounded-xl space-y-2 shadow-xs">
          <RefreshCw className="w-6 h-6 text-blue-600 animate-spin mx-auto" />
          <p className="text-xs font-medium text-slate-600">Loading student attendance and engagement data...</p>
        </div>
      ) : uniqueSessions.length === 0 ? (
        /* NO SESSIONS AT ALL */
        <div className="p-12 text-center bg-white border border-slate-200 rounded-xl space-y-2 shadow-xs">
          <Users className="w-8 h-8 text-slate-400 mx-auto" />
          <h3 className="text-sm font-bold text-slate-700">No Class Sessions Available</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            There are currently no active or completed class sessions for your courses. Start a class session to begin recording analytics.
          </p>
        </div>
      ) : !selectedSessionId ? (
        /* SESSIONS EXIST BUT NONE SELECTED */
        <div className="p-12 text-center bg-white border border-slate-200 rounded-xl space-y-2 shadow-xs">
          <Users className="w-8 h-8 text-slate-400 mx-auto" />
          <h3 className="text-sm font-bold text-slate-700">No Session Selected</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Choose a class session above to view student attendance, speech sentiment, visible facial expressions, and student check-ins.
          </p>
        </div>
      ) : !analyticsOverview ? (
        /* SESSION SELECTED BUT OVERVIEW RETURNED EMPTY/ERROR */
        <div className="p-12 text-center bg-white border border-slate-200 rounded-xl space-y-3 shadow-xs">
          <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
          <h3 className="text-sm font-bold text-slate-800">
            Analytics Not Available for {selectedSession?.title || 'Selected Session'}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {error || 'No analytics or attendance records have been captured for this session yet.'}
          </p>
          <button
            onClick={() => selectedSessionId && fetchSessionAnalytics(selectedSessionId)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry Loading Analytics</span>
          </button>
        </div>
      ) : (
        <>
          {/* 2. THREE SUMMARY CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Card 1: Students Present */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2 shadow-xs">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span>Students Present</span>
                <Users className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-slate-900">
                  {totalPresentCount}
                </span>
                <span className="text-xs text-slate-500">
                  of {totalEnrolledCount} enrolled
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                {analyticsOverview.attendance_rate}% classroom attendance rate
              </p>
            </div>

            {/* Card 2: Students with Analytics Data */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2 shadow-xs">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span>Students with Sufficient Data</span>
                <Sparkles className="w-4 h-4 text-blue-600" />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-slate-900">
                  {studentsWithDataCount}
                </span>
                <span className="text-xs text-slate-500">
                  of {studentSummaries.length} attending
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Have verified speech transcripts or facial expression samples
              </p>
            </div>

            {/* Card 3: Speech Segments Received */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2 shadow-xs">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span>Speech Segments Received</span>
                <Mic className="w-4 h-4 text-cyan-600" />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-slate-900">
                  {totalSpeechSegments}
                </span>
                <span className="text-xs text-cyan-700 font-medium">
                  Spoken utterances
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Spoken classroom responses transcribed via faster-whisper
              </p>
            </div>
          </div>

          {/* 3. STUDENT LIST / TABLE & QUICK FILTERS */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-xs">
            {/* Header & Filter Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-600" />
                  <span>Student Engagement & Analytics List</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Review student attendance, speech sentiment, visible facial expressions, and recent spoken transcripts.
                </p>
              </div>

              {/* Filter Toggles */}
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs shrink-0">
                <button
                  onClick={() => setActiveFilter('all')}
                  className={`px-3 py-1.5 rounded-md font-semibold transition-colors ${
                    activeFilter === 'all'
                      ? 'bg-white text-blue-600 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All ({studentSummaries.length})
                </button>
                <button
                  onClick={() => setActiveFilter('needs_attention')}
                  className={`px-3 py-1.5 rounded-md font-semibold transition-colors flex items-center gap-1.5 ${
                    activeFilter === 'needs_attention'
                      ? 'bg-amber-100 text-amber-800 shadow-2xs font-bold'
                      : 'text-amber-700 hover:text-amber-900'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Needs Attention ({studentsNeedingAttentionCount})</span>
                </button>
                <button
                  onClick={() => setActiveFilter('with_data')}
                  className={`px-3 py-1.5 rounded-md font-semibold transition-colors ${
                    activeFilter === 'with_data'
                      ? 'bg-white text-blue-600 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  With Data ({studentsWithDataCount})
                </button>
              </div>
            </div>

            {/* Table Content */}
            {displayedStudents.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-slate-200 rounded-xl text-xs text-slate-500 space-y-1">
                <p className="font-semibold text-slate-600">No students match the current filter.</p>
                <p className="text-[11px] text-slate-400">
                  {activeFilter === 'needs_attention'
                    ? 'No students currently flag negative sentiment or elevated distractions.'
                    : 'No student engagement records found.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                      <th className="py-2.5 px-3">Student</th>
                      <th className="py-2.5 px-3">Attendance</th>
                      <th className="py-2.5 px-3">Speech Sentiment</th>
                      <th className="py-2.5 px-3">Facial Expression</th>
                      <th className="py-2.5 px-3">Latest Spoken Words</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {displayedStudents.map((s, idx) => {
                      const attStatus = getStudentAttendance(s);
                      const needsReview = needsTeacherAttention(s);
                      const speech = s.speech_sentiment;
                      const facial = s.facial_summary;

                      return (
                        <tr key={s.student_id || idx} className="hover:bg-slate-50/70 transition-colors">
                          {/* 1. Student Name & Identification */}
                          <td className="py-3 px-3 font-semibold text-slate-900">
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-slate-900 text-xs">{s.student_name || 'Student'}</span>
                                {needsReview && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200">
                                    Review
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-slate-500 font-mono">
                                {s.student_id_number || s.student_email || s.student_id.substring(0, 8)}
                              </span>
                            </div>
                          </td>

                          {/* 2. Attendance Status */}
                          <td className="py-3 px-3">
                            {attStatus === 'PRESENT' ? (
                              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Present
                              </span>
                            ) : attStatus === 'LATE' ? (
                              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                Late
                              </span>
                            ) : attStatus === 'ABSENT' ? (
                              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                Absent
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                In Room
                              </span>
                            )}
                          </td>

                          {/* 3. Speech Sentiment */}
                          <td className="py-3 px-3">
                            {speech && speech.dominant_status === 'analyzed' && speech.dominant_sentiment ? (
                              <span
                                className={`inline-block font-semibold px-2 py-0.5 rounded text-[11px] border capitalize ${
                                  speech.dominant_sentiment === 'positive'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : speech.dominant_sentiment === 'negative'
                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                    : speech.dominant_sentiment === 'confused'
                                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                                    : 'bg-slate-100 text-slate-700 border-slate-200'
                                }`}
                              >
                                {speech.dominant_sentiment}
                              </span>
                            ) : speech && speech.dominant_status === 'unsupported_language' ? (
                              <span className="font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-[10px] inline-block">
                                Non-English
                              </span>
                            ) : speech && speech.dominant_status === 'no_transcripts' ? (
                              <span className="text-slate-400 text-[11px]">No speech recorded</span>
                            ) : (
                              <span className="text-slate-400 text-[11px]">Not enough data</span>
                            )}
                          </td>

                          {/* 4. Facial Expression */}
                          <td className="py-3 px-3">
                            {facial && facial.status === 'analyzed' && facial.dominant_expression !== 'insufficient_data' ? (
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`font-semibold capitalize px-2 py-0.5 rounded text-[11px] border ${
                                    facial.dominant_expression === 'happy'
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : facial.dominant_expression === 'sad'
                                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                                      : facial.dominant_expression === 'angry'
                                      ? 'bg-red-50 text-red-700 border-red-200'
                                      : facial.dominant_expression === 'fear'
                                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                                      : 'bg-slate-100 text-slate-700 border-slate-200'
                                  }`}
                                >
                                  {facial.dominant_expression}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  ({facial.valid_samples} samples)
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[11px]">Not enough data</span>
                            )}
                          </td>

                          {/* 5. Latest Spoken Words */}
                          <td className="py-3 px-3 max-w-[220px]">
                            {speech?.recent_snippets && speech.recent_snippets.length > 0 ? (
                              <div className="space-y-0.5">
                                <div
                                  className="text-xs text-slate-800 truncate max-w-[200px]"
                                  title={speech.recent_snippets[0].transcript_text}
                                >
                                  "{speech.recent_snippets[0].transcript_text}"
                                </div>
                                <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                                  <span className="px-1 py-0.2 rounded bg-slate-100 text-slate-600 font-mono text-[9px] border border-slate-200">
                                    {(speech.recent_snippets[0].language || 'en').toUpperCase()}
                                  </span>
                                  <span>
                                    {new Date(speech.recent_snippets[0].timestamp).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[11px]">—</span>
                            )}
                          </td>

                          {/* 6. View Details Action */}
                          <td className="py-3 px-3 text-right">
                            <button
                              onClick={() => setSelectedStudent(s)}
                              className="px-2.5 py-1 bg-white hover:bg-slate-50 text-blue-600 rounded-lg text-xs font-semibold border border-slate-200 transition-colors inline-flex items-center gap-1 shadow-2xs ml-auto"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Details</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 4. STUDENT DETAILS MODAL */}
          {selectedStudent && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
              <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-xl">
                {/* Modal Header */}
                <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-slate-900">
                        {selectedStudent.student_name || 'Student Details'}
                      </h3>
                      {needsTeacherAttention(selectedStudent) && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Review Suggested</span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">
                      {selectedStudent.student_id_number || selectedStudent.student_email || selectedStudent.student_id}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedStudent(null)}
                    className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* AI Guidance Callout */}
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-2.5 text-xs text-blue-900 leading-relaxed">
                  <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-blue-950">Multimodal Indicators:</span> Speech sentiment analyzes the words spoken. Facial analysis estimates visible camera expressions. These are supportive indicators.
                  </div>
                </div>

                {/* Section A: Speech Sentiment & Recent Transcripts */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1.5">
                      <Mic className="w-3.5 h-3.5" />
                      <span>Speech Sentiment Analysis</span>
                    </span>
                    <span className="text-[11px] text-slate-500 font-semibold">
                      Analyzed Segments: {selectedStudent.speech_sentiment?.valid_analyzed_segments || 0}
                    </span>
                  </div>

                  {selectedStudent.speech_sentiment && selectedStudent.speech_sentiment.valid_analyzed_segments > 0 ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                        <div className="p-2 bg-white rounded-lg border border-slate-200 shadow-2xs">
                          <span className="text-slate-500 block text-[10px]">Positive</span>
                          <span className="text-emerald-700 font-bold">{selectedStudent.speech_sentiment.positive_count}</span>
                        </div>
                        <div className="p-2 bg-white rounded-lg border border-slate-200 shadow-2xs">
                          <span className="text-slate-500 block text-[10px]">Neutral</span>
                          <span className="text-slate-700 font-bold">{selectedStudent.speech_sentiment.neutral_count}</span>
                        </div>
                        <div className="p-2 bg-white rounded-lg border border-slate-200 shadow-2xs">
                          <span className="text-slate-500 block text-[10px]">Confused</span>
                          <span className="text-purple-700 font-bold">{selectedStudent.speech_sentiment.confused_count}</span>
                        </div>
                        <div className="p-2 bg-white rounded-lg border border-slate-200 shadow-2xs">
                          <span className="text-slate-500 block text-[10px]">Negative</span>
                          <span className="text-rose-700 font-bold">{selectedStudent.speech_sentiment.negative_count}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      {selectedStudent.speech_sentiment?.unsupported_language_segments
                        ? 'Student spoke in Hindi or Kannada. Spoken words are recorded, but sentiment is unavailable for non-English speech.'
                        : 'No spoken speech segments analyzed for this student.'}
                    </p>
                  )}

                  {/* Recent Transcripts List */}
                  {selectedStudent.speech_sentiment?.recent_snippets && selectedStudent.speech_sentiment.recent_snippets.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-slate-200">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Recent Spoken Transcripts</span>
                      <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                        {selectedStudent.speech_sentiment.recent_snippets.map((snip) => (
                          <div key={snip.id} className="p-2 bg-white rounded-lg border border-slate-200 text-xs flex items-start justify-between gap-2 shadow-2xs">
                            <span className="text-slate-800">"{snip.transcript_text}"</span>
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                              {(snip.language || 'en').toUpperCase()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Section B: Visible Facial Expression Analysis */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-700 flex items-center gap-1.5">
                      <Smile className="w-3.5 h-3.5" />
                      <span>Facial Expression Analysis</span>
                    </span>
                    <span className="text-[11px] text-slate-500 font-semibold">
                      Valid Samples: {selectedStudent.facial_summary?.valid_samples || 0}
                    </span>
                  </div>

                  {selectedStudent.facial_summary && selectedStudent.facial_summary.status === 'analyzed' ? (
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="p-2.5 bg-white rounded-lg border border-slate-200 shadow-2xs">
                          <span className="text-slate-500 block text-[10px]">Dominant Expression</span>
                          <span className="text-slate-900 font-bold capitalize text-sm">
                            {selectedStudent.facial_summary.dominant_expression === 'insufficient_data'
                              ? 'Not enough data'
                              : selectedStudent.facial_summary.dominant_expression}
                          </span>
                        </div>
                        <div className="p-2.5 bg-white rounded-lg border border-slate-200 shadow-2xs">
                          <span className="text-slate-500 block text-[10px]">Attentiveness Score</span>
                          <span className="text-emerald-700 font-bold text-sm">
                            {selectedStudent.facial_summary.attentiveness_score !== null && selectedStudent.facial_summary.attentiveness_score !== undefined
                              ? `${selectedStudent.facial_summary.attentiveness_score}%`
                              : '—'}
                          </span>
                        </div>
                      </div>

                      {/* Distribution breakdown */}
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Expression Distribution</span>
                        <div className="grid grid-cols-5 gap-1.5 text-center text-[10px]">
                          {['neutral', 'happy', 'sad', 'angry', 'fear'].map((em) => {
                            const pct = Math.round((selectedStudent.facial_summary?.expression_distribution?.[em] || 0) * 100);
                            return (
                              <div key={em} className="p-1.5 bg-white rounded-md border border-slate-200 shadow-2xs">
                                <span className="text-slate-500 block capitalize">{em}</span>
                                <span className="text-blue-700 font-bold">{pct}%</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      Not enough data yet. Camera may be off or face was not clearly visible in video samples.
                    </p>
                  )}
                </div>

                {/* Section C: Attentiveness & Activity Signals */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                    <span className="text-slate-500">Distraction Events Logged</span>
                    <span className={`font-bold ${selectedStudent.distraction_count > 0 ? 'text-amber-700' : 'text-slate-700'}`}>
                      {selectedStudent.distraction_count}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                    <span className="text-slate-500">Questions & Inquiries</span>
                    <span className="font-bold text-blue-700">
                      {selectedStudent.question_count}
                    </span>
                  </div>
                </div>

                {/* Footer Action */}
                <div className="flex justify-end pt-2 border-t border-slate-100">
                  <button
                    onClick={() => setSelectedStudent(null)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                  >
                    Close Details
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 5. COLLAPSIBLE ADVANCED ANALYTICS SECTION */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-xs">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between text-left group"
            >
              <div className="space-y-0.5">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2 group-hover:text-blue-600 transition-colors">
                  <span>Advanced Analytics & Detailed Distributions</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Detailed 5-minute temporal window facial breakdown, multilingual verbal speech coverage, and subscore models.
                </p>
              </div>
              <div className="p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 group-hover:text-slate-800 transition-colors">
                {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </button>

            {showAdvanced && (
              <div className="space-y-5 pt-4 border-t border-slate-100">
                {/* 5A. RESULTS OVER TIME (5-MINUTE FACIAL AGGREGATION) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-blue-700 flex items-center gap-1.5">
                      <Smile className="w-4 h-4" />
                      <span>Results over time (5-minute temporal window)</span>
                    </h4>
                    {facialWindow?.window_start && (
                      <span className="text-[11px] text-slate-600 bg-slate-50 px-2.5 py-0.5 rounded-md border border-slate-200 font-mono">
                        {new Date(facialWindow.window_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – {new Date(facialWindow.window_end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>

                  {!facialWindow || facialWindow.students_analyzed === 0 ? (
                    <div className="p-6 text-center border border-dashed border-slate-200 rounded-xl text-xs text-slate-500">
                      Facial expression samples over time are not available for this window yet.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                        <span className="text-[10px] uppercase font-bold text-slate-500">Dominant Expression in Current Window</span>
                        <div className="text-xl font-bold text-slate-900 uppercase">
                          {facialWindow.dominant_expression === 'insufficient_data' ? 'Not enough data' : facialWindow.dominant_expression}
                        </div>
                        <div className="text-xs text-slate-500">
                          {facialWindow.students_with_valid_expression} valid students of {facialWindow.students_analyzed} analyzed
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                        <span className="text-[10px] uppercase font-bold text-slate-500">Expression Distribution</span>
                        <div className="grid grid-cols-5 gap-1.5 text-center text-[10px]">
                          {['neutral', 'happy', 'sad', 'angry', 'fear'].map((em) => {
                            const pct = Math.round((facialWindow.expression_distribution?.[em] || 0) * 100);
                            return (
                              <div key={em} className="p-1.5 bg-white rounded-md border border-slate-200 shadow-2xs">
                                <span className="text-slate-500 block capitalize">{em}</span>
                                <span className="text-blue-700 font-bold">{pct}%</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {facialSummary && (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-500 block">Overall Session Observed Expression</span>
                        <span className="text-base font-bold text-slate-900 uppercase">
                          {facialSummary.dominant_expression === 'insufficient_data' ? 'Not enough data' : facialSummary.dominant_expression}
                        </span>
                      </div>
                      <span className="text-slate-500">
                        Analyzed across {facialSummary.valid_windows} of {facialSummary.total_windows} temporal windows
                      </span>
                    </div>
                  )}
                </div>

                {/* 5B. CLASSROOM SPEECH COVERAGE */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1.5">
                    <Globe className="w-4 h-4" />
                    <span>Multilingual Speech Sentiment Coverage</span>
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                      <span className="text-[10px] text-slate-500 uppercase font-bold">Total Utterances</span>
                      <div className="text-2xl font-bold text-slate-900">
                        {analyticsOverview.classroom_speech_sentiment?.total_student_transcripts || 0}
                      </div>
                      <span className="text-[11px] text-slate-500">Transcribed via faster-whisper</span>
                    </div>

                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                      <span className="text-[10px] text-slate-500 uppercase font-bold">English (Sentiment Analyzed)</span>
                      <div className="text-2xl font-bold text-emerald-700">
                        {analyticsOverview.classroom_speech_sentiment?.valid_analyzed_transcripts || 0}
                      </div>
                      <span className="text-[11px] text-slate-500">Evaluated via text sentiment analysis</span>
                    </div>

                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                      <span className="text-[10px] text-slate-500 uppercase font-bold">Kannada & Hindi Spoken</span>
                      <div className="text-2xl font-bold text-amber-700">
                        {analyticsOverview.classroom_speech_sentiment?.unsupported_language_transcripts || 0}
                      </div>
                      <span className="text-[11px] text-slate-500">Sentiment unavailable for this language</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 6. GENERATED REPORT & PRINT FUNCTIONALITY */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                <span>Generated Session Executive Report</span>
              </h3>
              <button
                onClick={() => window.print()}
                className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-200 shadow-2xs"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Report</span>
              </button>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs leading-relaxed text-slate-700">
              <div className="flex items-center gap-2 text-blue-700 font-semibold text-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Executive Summary for {selectedSession?.title}</span>
              </div>
              <p>
                Session conducted on {selectedSession?.created_at ? new Date(selectedSession.created_at).toLocaleDateString() : 'N/A'}. Enrolled student attendance reached <strong className="text-emerald-700">{analyticsOverview.attendance_rate}%</strong> ({totalPresentCount} of {totalEnrolledCount} present). A total of <strong className="text-cyan-700">{totalSpeechSegments}</strong> student speech utterances were received and processed.
              </p>
              <div className="pt-2 border-t border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] text-slate-500">
                <div>Students Needing Attention: <strong className="text-amber-700">{studentsNeedingAttentionCount}</strong></div>
                <div>Students with Analytics Data: <strong className="text-blue-700">{studentsWithDataCount}</strong></div>
                <div>Questions & Queries Detected: <strong className="text-slate-900">{analyticsOverview.total_questions}</strong></div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
