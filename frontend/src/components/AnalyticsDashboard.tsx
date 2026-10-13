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
  Clock,
} from 'lucide-react';

interface AnalyticsDashboardProps {
  sessions: ClassSession[];
  isTeacher: boolean;
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  sessions,
  isTeacher,
}) => {
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
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

  // Auto-select first session if available
  useEffect(() => {
    if (sessions.length > 0 && !selectedSessionId) {
      setSelectedSessionId(sessions[0].id);
    }
  }, [sessions]);

  // Fetch analytics data when selectedSessionId changes
  const fetchAnalyticsData = async (sessionId: string) => {
    if (!sessionId) return;
    try {
      setLoading(true);
      setError(null);

      const [overviewData, attData, winData, sumData] = await Promise.all([
        analyticsApi.getSessionOverview(sessionId),
        attendanceApi.getSessionAttendance(sessionId).catch(() => null),
        analyticsApi.getClassroomFacialWindow(sessionId).catch(() => null),
        analyticsApi.getSessionFacialSummary(sessionId).catch(() => null),
      ]);

      setAnalyticsOverview(overviewData);
      setAttendanceSummary(attData);
      setFacialWindow(winData);
      setFacialSummary(sumData);
    } catch (err: any) {
      setError(err.message || 'Failed to load session analytics overview');
      setAnalyticsOverview(null);
      setFacialWindow(null);
      setFacialSummary(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSessionId) {
      fetchAnalyticsData(selectedSessionId);
    }
  }, [selectedSessionId]);

  const selectedSession = sessions.find((s) => s.id === selectedSessionId);

  // Background refresh for active sessions every 30s
  useEffect(() => {
    if (!selectedSessionId || selectedSession?.status !== 'ACTIVE') return;
    const interval = setInterval(async () => {
      try {
        const [overviewData, winData, sumData] = await Promise.all([
          analyticsApi.getSessionOverview(selectedSessionId).catch(() => null),
          analyticsApi.getClassroomFacialWindow(selectedSessionId).catch(() => null),
          analyticsApi.getSessionFacialSummary(selectedSessionId).catch(() => null),
        ]);
        if (overviewData) setAnalyticsOverview(overviewData);
        if (winData) setFacialWindow(winData);
        if (sumData) setFacialSummary(sumData);
      } catch {
        // Non-blocking refresh
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [selectedSessionId, selectedSession]);

  // Helper: Attendance record lookup
  const getStudentAttendance = (student: StudentEngagementSummary) => {
    if (!attendanceSummary || !attendanceSummary.records) return 'IN_ROOM';
    const rec = attendanceSummary.records.find(
      (r) =>
        r.student_id === student.student_id ||
        (student.student_id_number && r.student_id_number === student.student_id_number) ||
        (student.student_name && r.student_name === student.student_name)
    );
    return rec ? rec.status : 'IN_ROOM';
  };

  // Helper: Student has available engagement data
  const hasEngagementData = (s: StudentEngagementSummary) => {
    const hasFacial = !!(s.facial_summary && s.facial_summary.valid_samples > 0);
    const hasSpeech = !!(
      s.speech_sentiment &&
      (s.speech_sentiment.valid_analyzed_segments > 0 ||
        s.speech_sentiment.unsupported_language_segments > 0 ||
        s.speech_sentiment.total_segments > 0)
    );
    return hasFacial || hasSpeech || s.sample_count > 0;
  };

  // Helper: Student needs teacher attention or review
  const needsTeacherAttention = (s: StudentEngagementSummary) => {
    const speech = s.speech_sentiment;
    const facial = s.facial_summary;

    const speechNegative =
      speech?.dominant_status === 'analyzed' &&
      (speech.dominant_sentiment === 'negative' || speech.dominant_sentiment === 'confused');

    const facialNegative =
      facial?.status === 'analyzed' &&
      (facial.dominant_expression === 'sad' ||
        facial.dominant_expression === 'angry' ||
        facial.dominant_expression === 'fear');

    const highDistraction = s.distraction_count >= 2;
    const lowAttentiveness =
      (facial?.attentiveness_score !== null &&
        facial?.attentiveness_score !== undefined &&
        facial.attentiveness_score < 50) ||
      (s.attentiveness_subscore !== null &&
        s.attentiveness_subscore !== undefined &&
        s.attentiveness_subscore < 50);

    return !!(speechNegative || facialNegative || highDistraction || lowAttentiveness);
  };

  // Student metrics & list counts
  const studentSummaries = analyticsOverview?.student_summaries || [];

  const studentsWithDataCount = useMemo(() => {
    return studentSummaries.filter(hasEngagementData).length;
  }, [studentSummaries]);

  const studentsNeedingAttentionCount = useMemo(() => {
    return studentSummaries.filter(needsTeacherAttention).length;
  }, [studentSummaries]);

  // Filtered students for display table
  const displayedStudents = useMemo(() => {
    if (activeFilter === 'needs_attention') {
      return studentSummaries.filter(needsTeacherAttention);
    }
    if (activeFilter === 'with_data') {
      return studentSummaries.filter(hasEngagementData);
    }
    return studentSummaries;
  }, [studentSummaries, activeFilter]);

  // Attendance count calculation
  const totalPresentCount = attendanceSummary
    ? attendanceSummary.present_count + attendanceSummary.late_count
    : studentSummaries.length;
  const totalEnrolledCount = attendanceSummary?.total_students || studentSummaries.length;

  const totalSpeechSegments =
    analyticsOverview?.classroom_speech_sentiment?.total_student_transcripts ||
    studentSummaries.reduce((acc, s) => acc + (s.speech_sentiment?.total_segments || 0), 0);

  return (
    <div className="space-y-6">
      {/* 1. HEADER: Classroom Name, Session Title, Live/Ended Status & Selector */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="bg-indigo-950 text-indigo-300 text-xs font-semibold px-3 py-1 rounded-full border border-indigo-800/50 flex items-center gap-1.5">
              <span>{attendanceSummary?.classroom_title || selectedSession?.title || 'Classroom Analytics'}</span>
            </span>

            {/* Session Live / Ended Badge */}
            {selectedSession?.status === 'ACTIVE' ? (
              <span className="bg-emerald-950 text-emerald-300 text-xs font-semibold px-3 py-1 rounded-full border border-emerald-800/50 flex items-center gap-1.5 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>Live Class Session</span>
              </span>
            ) : selectedSession?.status === 'COMPLETED' ? (
              <span className="bg-slate-800 text-slate-300 text-xs font-semibold px-3 py-1 rounded-full border border-slate-700 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
                <span>Session Ended</span>
              </span>
            ) : (
              <span className="bg-blue-950 text-blue-300 text-xs font-semibold px-3 py-1 rounded-full border border-blue-800/50 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-400" />
                <span>Scheduled Session</span>
              </span>
            )}
          </div>

          <h2 className="text-xl font-bold text-white tracking-tight">
            {selectedSession?.title || 'Teacher Engagement Dashboard'}
          </h2>
          <p className="text-xs text-slate-400">
            {isTeacher
              ? 'Clear overview of student attendance, speech sentiment, visible facial expressions, and students needing review.'
              : 'Your personal session engagement and attendance insights.'}
          </p>
        </div>

        {/* Session Dropdown Selector & Refresh Action */}
        <div className="w-full md:w-auto flex items-end gap-2 shrink-0">
          <div className="w-full md:w-72">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Select Class Session
            </label>
            <div className="relative">
              <select
                value={selectedSessionId}
                onChange={(e) => setSelectedSessionId(e.target.value)}
                className="w-full appearance-none px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs font-semibold focus:outline-none focus:border-indigo-500 pr-10 cursor-pointer"
              >
                {sessions.length === 0 ? (
                  <option value="">No sessions available</option>
                ) : (
                  sessions.map((sess) => (
                    <option key={sess.id} value={sess.id}>
                      {sess.title} ({sess.status})
                    </option>
                  ))
                )}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
            </div>
          </div>

          <button
            onClick={() => selectedSessionId && fetchAnalyticsData(selectedSessionId)}
            disabled={loading || !selectedSessionId}
            title="Refresh analytics data"
            className="p-2.5 bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-xl transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* AI UNDERSTANDING & TRANSPARENCY NOTICE */}
      <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl flex items-start gap-3">
        <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-300 leading-relaxed">
          <strong className="text-white font-semibold">Teacher Insight Note:</strong> Speech sentiment describes the words detected, while facial analysis estimates visible expressions from camera frames. They are separate signals and do not prove a student's actual internal emotional state. Use these indicators to guide supportive classroom check-ins.
        </div>
      </div>

      {/* ERROR / RETRY VIEW */}
      {error && (
        <div className="p-6 bg-red-950/50 border border-red-800/60 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4 text-red-300">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <span className="text-xs font-medium">{error}</span>
          </div>
          <button
            onClick={() => selectedSessionId && fetchAnalyticsData(selectedSessionId)}
            className="px-4 py-2 bg-red-800 hover:bg-red-700 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-all shadow"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry Analytics</span>
          </button>
        </div>
      )}

      {/* LOADING STATE */}
      {loading ? (
        <div className="p-16 text-center bg-slate-900 border border-slate-800 rounded-3xl space-y-3">
          <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin mx-auto" />
          <p className="text-xs font-medium text-slate-300">Loading student attendance and engagement data...</p>
        </div>
      ) : !analyticsOverview || sessions.length === 0 ? (
        /* EMPTY STATE */
        <div className="p-12 text-center bg-slate-900/60 border border-slate-800 rounded-3xl space-y-3">
          <Users className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-sm font-bold text-slate-300">No Session Selected</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Choose a class session above to view student attendance, speech sentiment, visible facial expressions, and student check-ins.
          </p>
        </div>
      ) : (
        <>
          {/* 2. THREE SIMPLE SUMMARY CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Card 1: Students Present */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2 shadow-lg">
              <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                <span>Students Present</span>
                <Users className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-extrabold text-white">
                  {totalPresentCount}
                </span>
                <span className="text-xs text-slate-400">
                  of {totalEnrolledCount} enrolled
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {analyticsOverview.attendance_rate}% classroom attendance rate
              </p>
            </div>

            {/* Card 2: Students with Analytics Data */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2 shadow-lg">
              <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                <span>Students with Sufficient Data</span>
                <Sparkles className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-extrabold text-white">
                  {studentsWithDataCount}
                </span>
                <span className="text-xs text-slate-400">
                  of {studentSummaries.length} attending
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Have verified speech transcripts or facial expression samples
              </p>
            </div>

            {/* Card 3: Speech Segments Received */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2 shadow-lg">
              <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                <span>Speech Segments Received</span>
                <Mic className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-extrabold text-white">
                  {totalSpeechSegments}
                </span>
                <span className="text-xs text-cyan-400 font-medium">
                  Spoken utterances
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Spoken classroom responses transcribed via faster-whisper
              </p>
            </div>
          </div>

          {/* 3. STUDENT LIST / TABLE & QUICK FILTERS */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
            {/* Header & Filter Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-400" />
                  <span>Student Engagement & Analytics List</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Review student attendance, speech sentiment, visible facial expressions, and recent spoken transcripts.
                </p>
              </div>

              {/* Filter Toggles */}
              <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs shrink-0">
                <button
                  onClick={() => setActiveFilter('all')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                    activeFilter === 'all'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  All ({studentSummaries.length})
                </button>
                <button
                  onClick={() => setActiveFilter('needs_attention')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
                    activeFilter === 'needs_attention'
                      ? 'bg-amber-600 text-white shadow'
                      : 'text-amber-400/90 hover:text-amber-300'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Needs Attention ({studentsNeedingAttentionCount})</span>
                </button>
                <button
                  onClick={() => setActiveFilter('with_data')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                    activeFilter === 'with_data'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  With Data ({studentsWithDataCount})
                </button>
              </div>
            </div>

            {/* Table Content */}
            {displayedStudents.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-slate-800 rounded-2xl text-xs text-slate-500 space-y-1">
                <p className="font-semibold text-slate-400">No students match the current filter.</p>
                <p className="text-[11px] text-slate-500">
                  {activeFilter === 'needs_attention'
                    ? 'Great news! No students currently flag negative sentiment, confusion, or elevated distractions.'
                    : 'No student engagement records found.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                      <th className="pb-3 px-4">Student</th>
                      <th className="pb-3 px-3">Attendance</th>
                      <th className="pb-3 px-3">Speech Sentiment</th>
                      <th className="pb-3 px-3">Facial Expression</th>
                      <th className="pb-3 px-3">Latest Spoken Words</th>
                      <th className="pb-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-medium text-slate-300">
                    {displayedStudents.map((s, idx) => {
                      const attStatus = getStudentAttendance(s);
                      const needsReview = needsTeacherAttention(s);
                      const speech = s.speech_sentiment;
                      const facial = s.facial_summary;

                      return (
                        <tr key={s.student_id || idx} className="hover:bg-slate-800/40 transition-all">
                          {/* 1. Student Name & Identification */}
                          <td className="py-3.5 px-4 font-semibold text-white">
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-white text-xs">{s.student_name || 'Student'}</span>
                                {needsReview && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800/60">
                                    Needs Review
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-slate-400 font-mono">
                                {s.student_id_number || s.student_email || s.student_id.substring(0, 8)}
                              </span>
                            </div>
                          </td>

                          {/* 2. Attendance Status */}
                          <td className="py-3.5 px-3">
                            {attStatus === 'PRESENT' ? (
                              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800/50">
                                Present
                              </span>
                            ) : attStatus === 'LATE' ? (
                              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-950 text-amber-300 border border-amber-800/50">
                                Late
                              </span>
                            ) : attStatus === 'ABSENT' ? (
                              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-950 text-rose-300 border border-rose-800/50">
                                Absent
                              </span>
                            ) : attStatus === 'UNVERIFIED' ? (
                              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-950 text-slate-400 border border-slate-800">
                                Unverified
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-950 text-slate-300 border border-slate-800">
                                In Room
                              </span>
                            )}
                          </td>

                          {/* 3. Speech Sentiment */}
                          <td className="py-3.5 px-3">
                            {speech && speech.dominant_status === 'analyzed' && speech.dominant_sentiment ? (
                              <span
                                className={`inline-block font-semibold px-2 py-0.5 rounded text-[11px] border capitalize ${
                                  speech.dominant_sentiment === 'positive'
                                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60'
                                    : speech.dominant_sentiment === 'negative'
                                    ? 'bg-rose-950/80 text-rose-300 border-rose-800/60'
                                    : speech.dominant_sentiment === 'confused'
                                    ? 'bg-purple-950/80 text-purple-300 border-purple-800/60'
                                    : 'bg-slate-950 text-slate-200 border-slate-800'
                                }`}
                              >
                                {speech.dominant_sentiment}
                              </span>
                            ) : speech && speech.dominant_status === 'unsupported_language' ? (
                              <span className="font-medium text-amber-300 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/40 text-[10px] inline-block">
                                Sentiment unavailable for this language
                              </span>
                            ) : speech && speech.dominant_status === 'no_transcripts' ? (
                              <span className="text-slate-500 text-[11px]">No speech recorded</span>
                            ) : (
                              <span className="text-slate-500 text-[11px]">Not enough data yet</span>
                            )}
                          </td>

                          {/* 4. Facial Expression */}
                          <td className="py-3.5 px-3">
                            {facial && facial.status === 'analyzed' && facial.dominant_expression !== 'insufficient_data' ? (
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`font-semibold capitalize px-2 py-0.5 rounded text-[11px] border ${
                                    facial.dominant_expression === 'happy'
                                      ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60'
                                      : facial.dominant_expression === 'sad'
                                      ? 'bg-rose-950/80 text-rose-300 border-rose-800/60'
                                      : facial.dominant_expression === 'angry'
                                      ? 'bg-red-950/80 text-red-300 border-red-800/60'
                                      : facial.dominant_expression === 'fear'
                                      ? 'bg-amber-950/80 text-amber-300 border-amber-800/60'
                                      : 'bg-slate-950 text-slate-200 border-slate-800'
                                  }`}
                                >
                                  {facial.dominant_expression}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  ({facial.valid_samples} samples)
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-500 text-[11px]">Not enough data yet</span>
                            )}
                          </td>

                          {/* 5. Latest Spoken Words */}
                          <td className="py-3.5 px-3 max-w-[220px]">
                            {speech?.recent_snippets && speech.recent_snippets.length > 0 ? (
                              <div className="space-y-1">
                                <div
                                  className="text-xs text-slate-200 truncate font-sans max-w-[200px]"
                                  title={speech.recent_snippets[0].transcript_text}
                                >
                                  "{speech.recent_snippets[0].transcript_text}"
                                </div>
                                <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                                  <span className="px-1 py-0.2 rounded bg-slate-950 text-slate-300 font-mono text-[9px] border border-slate-800">
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
                              <span className="text-slate-600 text-[11px]">—</span>
                            )}
                          </td>

                          {/* 6. View Details Action */}
                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={() => setSelectedStudent(s)}
                              className="px-3 py-1.5 bg-indigo-950 hover:bg-indigo-900 text-indigo-300 hover:text-white rounded-xl text-xs font-semibold border border-indigo-800/50 transition-all flex items-center gap-1.5 ml-auto"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View Details</span>
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
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5 shadow-2xl">
                {/* Modal Header */}
                <div className="flex items-start justify-between border-b border-slate-800 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-white">
                        {selectedStudent.student_name || 'Student Details'}
                      </h3>
                      {needsTeacherAttention(selectedStudent) && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800/60 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Teacher Review Suggested</span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">
                      {selectedStudent.student_id_number || selectedStudent.student_email || selectedStudent.student_id}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedStudent(null)}
                    className="p-1.5 text-slate-400 hover:text-white bg-slate-950 border border-slate-800 rounded-xl"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* AI Guidance Callout */}
                <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-2xl flex items-start gap-2.5 text-xs text-slate-300 leading-relaxed">
                  <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-white">Two Separate Signals:</span> Speech sentiment analyzes the words spoken. Facial analysis estimates visible expressions on camera. Neither signal is proof of inner emotion.
                  </div>
                </div>

                {/* Section A: Speech Sentiment & Recent Transcripts */}
                <div className="p-4 bg-slate-950 border border-slate-800/80 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                      <Mic className="w-3.5 h-3.5" />
                      <span>Speech Sentiment (English text sentiment analysis)</span>
                    </span>
                    <span className="text-[11px] text-slate-400 font-semibold">
                      Analyzed Segments: {selectedStudent.speech_sentiment?.valid_analyzed_segments || 0}
                    </span>
                  </div>

                  {selectedStudent.speech_sentiment && selectedStudent.speech_sentiment.valid_analyzed_segments > 0 ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                        <div className="p-2 bg-slate-900 rounded-xl border border-slate-800">
                          <span className="text-slate-400 block text-[10px]">Positive</span>
                          <span className="text-emerald-400 font-bold">{selectedStudent.speech_sentiment.positive_count}</span>
                        </div>
                        <div className="p-2 bg-slate-900 rounded-xl border border-slate-800">
                          <span className="text-slate-400 block text-[10px]">Neutral</span>
                          <span className="text-slate-300 font-bold">{selectedStudent.speech_sentiment.neutral_count}</span>
                        </div>
                        <div className="p-2 bg-slate-900 rounded-xl border border-slate-800">
                          <span className="text-slate-400 block text-[10px]">Confused</span>
                          <span className="text-purple-300 font-bold">{selectedStudent.speech_sentiment.confused_count}</span>
                        </div>
                        <div className="p-2 bg-slate-900 rounded-xl border border-slate-800">
                          <span className="text-slate-400 block text-[10px]">Negative</span>
                          <span className="text-rose-400 font-bold">{selectedStudent.speech_sentiment.negative_count}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">
                      {selectedStudent.speech_sentiment?.unsupported_language_segments
                        ? 'Student spoke in Hindi or Kannada. Spoken words are recorded, but sentiment is unavailable for non-English speech.'
                        : 'No spoken speech segments analyzed for this student.'}
                    </p>
                  )}

                  {/* Recent Transcripts List */}
                  {selectedStudent.speech_sentiment?.recent_snippets && selectedStudent.speech_sentiment.recent_snippets.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-slate-800">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Recent Spoken Transcripts</span>
                      <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                        {selectedStudent.speech_sentiment.recent_snippets.map((snip) => (
                          <div key={snip.id} className="p-2 bg-slate-900 rounded-xl border border-slate-800/60 text-xs flex items-start justify-between gap-2">
                            <span className="text-slate-200">"{snip.transcript_text}"</span>
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800 shrink-0">
                              {(snip.language || 'en').toUpperCase()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Section B: Visible Facial Expression Analysis */}
                <div className="p-4 bg-slate-950 border border-slate-800/80 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                      <Smile className="w-3.5 h-3.5" />
                      <span>Facial Expression Analysis</span>
                    </span>
                    <span className="text-[11px] text-slate-400 font-semibold">
                      Valid Samples: {selectedStudent.facial_summary?.valid_samples || 0}
                    </span>
                  </div>

                  {selectedStudent.facial_summary && selectedStudent.facial_summary.status === 'analyzed' ? (
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800">
                          <span className="text-slate-400 block text-[10px]">Dominant Observed Expression</span>
                          <span className="text-white font-bold capitalize text-sm">
                            {selectedStudent.facial_summary.dominant_expression}
                          </span>
                        </div>
                        <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800">
                          <span className="text-slate-400 block text-[10px]">Attentiveness Subscore</span>
                          <span className="text-emerald-400 font-bold text-sm">
                            {selectedStudent.facial_summary.attentiveness_score !== null && selectedStudent.facial_summary.attentiveness_score !== undefined
                              ? `${selectedStudent.facial_summary.attentiveness_score}%`
                              : '—'}
                          </span>
                        </div>
                      </div>

                      {/* Distribution breakdown */}
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Observed Expression Distribution</span>
                        <div className="grid grid-cols-5 gap-1.5 text-center text-[10px]">
                          {['neutral', 'happy', 'sad', 'angry', 'fear'].map((em) => {
                            const pct = Math.round((selectedStudent.facial_summary?.expression_distribution?.[em] || 0) * 100);
                            return (
                              <div key={em} className="p-1.5 bg-slate-900 rounded-lg border border-slate-800">
                                <span className="text-slate-400 block capitalize">{em}</span>
                                <span className="text-indigo-300 font-bold">{pct}%</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">
                      Not enough data yet. Camera may be off or face was not clearly visible in video samples.
                    </p>
                  )}
                </div>

                {/* Section C: Attentiveness & Activity Signals */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-2xl flex items-center justify-between">
                    <span className="text-slate-400">Distraction Events Logged</span>
                    <span className={`font-bold ${selectedStudent.distraction_count > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                      {selectedStudent.distraction_count}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-2xl flex items-center justify-between">
                    <span className="text-slate-400">Questions & Inquiries</span>
                    <span className="font-bold text-indigo-300">
                      {selectedStudent.question_count}
                    </span>
                  </div>
                </div>

                {/* Footer Action */}
                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => setSelectedStudent(null)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold"
                  >
                    Close Details
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 5. COLLAPSIBLE ADVANCED ANALYTICS SECTION */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between text-left group"
            >
              <div className="space-y-0.5">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2 group-hover:text-white transition-all">
                  <span>Advanced Analytics & Detailed Distributions</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Detailed 5-minute temporal window facial breakdown, multilingual verbal speech coverage, and subscore models.
                </p>
              </div>
              <div className="p-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-400 group-hover:text-white transition-all">
                {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </button>

            {showAdvanced && (
              <div className="space-y-6 pt-4 border-t border-slate-800/80">
                {/* 5A. RESULTS OVER TIME (5-MINUTE FACIAL AGGREGATION) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-2">
                      <Smile className="w-4 h-4" />
                      <span>Results over time (5-minute temporal window)</span>
                    </h4>
                    {facialWindow?.window_start && (
                      <span className="text-[11px] text-slate-400 bg-slate-950 px-3 py-1 rounded-xl border border-slate-800 font-mono">
                        Current: {new Date(facialWindow.window_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – {new Date(facialWindow.window_end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>

                  {!facialWindow || facialWindow.students_analyzed === 0 ? (
                    <div className="p-6 text-center border border-dashed border-slate-800 rounded-2xl text-xs text-slate-500">
                      Facial expression samples over time are not available for this window yet.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-2">
                        <span className="text-[10px] uppercase font-bold text-slate-400">Dominant Expression in Current Window</span>
                        <div className="text-xl font-extrabold text-white uppercase">
                          {facialWindow.dominant_expression === 'insufficient_data' ? 'Not enough data yet' : facialWindow.dominant_expression}
                        </div>
                        <div className="text-xs text-slate-400">
                          {facialWindow.students_with_valid_expression} valid students of {facialWindow.students_analyzed} analyzed
                        </div>
                      </div>

                      <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-2">
                        <span className="text-[10px] uppercase font-bold text-slate-400">Expression Distribution in Current Window</span>
                        <div className="grid grid-cols-5 gap-1.5 text-center text-[10px]">
                          {['neutral', 'happy', 'sad', 'angry', 'fear'].map((em) => {
                            const pct = Math.round((facialWindow.expression_distribution?.[em] || 0) * 100);
                            return (
                              <div key={em} className="p-1.5 bg-slate-900 rounded-lg border border-slate-800">
                                <span className="text-slate-400 block capitalize">{em}</span>
                                <span className="text-indigo-300 font-bold">{pct}%</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {facialSummary && (
                    <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Overall Session Observed Expression</span>
                        <span className="text-base font-extrabold text-white uppercase">
                          {facialSummary.dominant_expression === 'insufficient_data' ? 'Not enough data yet' : facialSummary.dominant_expression}
                        </span>
                      </div>
                      <span className="text-slate-400">
                        Analyzed across {facialSummary.valid_windows} of {facialSummary.total_windows} temporal windows
                      </span>
                    </div>
                  )}
                </div>

                {/* 5B. CLASSROOM SPEECH COVERAGE & ENGLISH SENTIMENT AGGREGATION */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                    <Globe className="w-4 h-4" />
                    <span>Multilingual Speech Sentiment Coverage</span>
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase font-bold">Total Utterances</span>
                      <div className="text-2xl font-extrabold text-white">
                        {analyticsOverview.classroom_speech_sentiment?.total_student_transcripts || 0}
                      </div>
                      <span className="text-[11px] text-slate-500">Transcribed via faster-whisper</span>
                    </div>

                    <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase font-bold">English (Sentiment Analyzed)</span>
                      <div className="text-2xl font-extrabold text-emerald-400">
                        {analyticsOverview.classroom_speech_sentiment?.valid_analyzed_transcripts || 0}
                      </div>
                      <span className="text-[11px] text-slate-500">Evaluated via text sentiment analysis</span>
                    </div>

                    <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase font-bold">Kannada & Hindi Spoken</span>
                      <div className="text-2xl font-extrabold text-amber-400">
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
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-400" />
                <span>Generated Session Executive Report</span>
              </h3>
              <button
                onClick={() => window.print()}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all border border-slate-700"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Report</span>
              </button>
            </div>

            <div className="p-5 bg-slate-950 border border-slate-800/80 rounded-2xl space-y-3 text-xs leading-relaxed text-slate-300">
              <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Executive Summary for {selectedSession?.title}</span>
              </div>
              <p>
                Session conducted on {selectedSession?.created_at ? new Date(selectedSession.created_at).toLocaleDateString() : 'N/A'}. Enrolled student attendance reached <strong className="text-emerald-400">{analyticsOverview.attendance_rate}%</strong> ({totalPresentCount} of {totalEnrolledCount} present). A total of <strong className="text-cyan-400">{totalSpeechSegments}</strong> student speech utterances were received and processed.
              </p>
              <div className="pt-2 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] text-slate-400">
                <div>Students Needing Attention: <strong className="text-amber-400">{studentsNeedingAttentionCount}</strong></div>
                <div>Students with Analytics Data: <strong className="text-indigo-300">{studentsWithDataCount}</strong></div>
                <div>Questions & Queries Detected: <strong className="text-white">{analyticsOverview.total_questions}</strong></div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
