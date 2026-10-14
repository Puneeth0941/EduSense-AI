import React, { useState, useEffect } from 'react';
import { analyticsApi, attendanceApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { ClassSession, StudentEngagementSummary, StudentAttendanceSummaryResponse } from '../types';
import {
  BarChart3,
  TrendingUp,
  UserCheck,
  AlertTriangle,
  RefreshCw,
  Info,
  ChevronDown,
  Activity,
  Award,
} from 'lucide-react';

interface StudentPersonalAnalyticsProps {
  sessions: ClassSession[];
  studentAttendance?: StudentAttendanceSummaryResponse | null;
}

export const StudentPersonalAnalytics: React.FC<StudentPersonalAnalyticsProps> = ({
  sessions,
  studentAttendance: initialStudentAttendance,
}) => {
  const { user } = useAuth();
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [engagementSummary, setEngagementSummary] = useState<StudentEngagementSummary | null>(null);
  const [studentAttendance, setStudentAttendance] = useState<StudentAttendanceSummaryResponse | null>(
    initialStudentAttendance || null
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const studentProfileId = user?.student_profile?.id;

  // Auto-select first session
  useEffect(() => {
    if (sessions.length > 0 && !selectedSessionId) {
      setSelectedSessionId(sessions[0].id);
    }
  }, [sessions]);

  // Fetch overall attendance summary if missing
  useEffect(() => {
    if (!studentAttendance) {
      attendanceApi
        .getStudentSummary()
        .then((data) => setStudentAttendance(data))
        .catch(() => {});
    }
  }, []);

  // Fetch student's own engagement summary for selected session
  const fetchStudentAnalytics = async (sessionId: string) => {
    if (!sessionId || !studentProfileId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await analyticsApi.getStudentEngagement(sessionId, studentProfileId);
      setEngagementSummary(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load your personal engagement analytics.');
      setEngagementSummary(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSessionId && studentProfileId) {
      fetchStudentAnalytics(selectedSessionId);
    }
  }, [selectedSessionId, studentProfileId]);

  const selectedSession = sessions.find((s) => s.id === selectedSessionId);

  const getEngagementBadgeColor = (score: number) => {
    if (score >= 70) return 'bg-emerald-950 text-emerald-400 border-emerald-800/50';
    if (score >= 50) return 'bg-amber-950 text-amber-400 border-amber-800/50';
    return 'bg-red-950 text-red-400 border-red-800/50';
  };

  return (
    <div className="space-y-6">
      {/* HEADER & SESSION SELECTOR */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="bg-indigo-950 text-indigo-300 text-xs font-semibold px-3 py-1 rounded-full border border-indigo-800/50 flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5 text-indigo-400" />
              <span>My Personal Analytics</span>
            </span>
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">Personal Engagement Dashboard</h2>
          <p className="text-xs text-slate-400">
            Review your own engagement, attentiveness subscores, distraction logs, and attendance summary.
          </p>
        </div>

        {/* Session Dropdown Selector */}
        <div className="w-full md:w-72 shrink-0">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
            Select Class Session
          </label>
          <div className="relative">
            <select
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 appearance-none pr-10 shadow-inner"
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
      </div>

      {/* TRANSPARENCY DISCLAIMER NOTE */}
      <div className="p-4 bg-amber-950/40 border border-amber-800/50 rounded-2xl flex items-start gap-3">
        <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-300/90 leading-relaxed">
          <strong className="font-semibold text-amber-200">AI Transparency Note:</strong> Attentiveness is estimated from 3D head-pose geometry. Primary EmotiEffLib (EfficientNet ONNX) with FERPlus ONNX fallback provides supportive classroom indicators. Facial analysis reflects visible camera observations and does not prove a student's internal emotional state.
        </div>
      </div>

      {/* ERROR / RETRY VIEW */}
      {error && (
        <div className="p-6 bg-red-950/50 border border-red-800/60 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4 text-red-300">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-red-400 shrink-0" />
            <span className="text-xs font-medium">{error}</span>
          </div>
          <button
            onClick={() => selectedSessionId && fetchStudentAnalytics(selectedSessionId)}
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
          <p className="text-xs font-medium text-slate-300">Loading your personal engagement analytics...</p>
        </div>
      ) : !engagementSummary || sessions.length === 0 ? (
        /* EMPTY STATE */
        <div className="p-12 text-center bg-slate-900/60 border border-slate-800 rounded-3xl space-y-3">
          <Activity className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-sm font-bold text-slate-300">No Personal Analytics Data for this Session</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Join an active class session to enable periodic engagement sampling and track your attentiveness scores.
          </p>
        </div>
      ) : (
        <>
          {/* PERSONAL KPI STAT CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: My Engagement Score */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2 shadow-lg">
              <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                <span>My Engagement Score</span>
                <TrendingUp className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-extrabold text-white">
                  {engagementSummary.composite_score !== null && engagementSummary.composite_score !== undefined
                    ? `${engagementSummary.composite_score}%`
                    : 'N/A'}
                </span>
                {engagementSummary.composite_score !== null && engagementSummary.composite_score !== undefined && (
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${getEngagementBadgeColor(
                      engagementSummary.composite_score
                    )}`}
                  >
                    {engagementSummary.composite_score >= 70
                      ? 'HIGH'
                      : engagementSummary.composite_score >= 50
                      ? 'MODERATE'
                      : 'LOW'}
                  </span>
                )}
              </div>
              <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-indigo-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, engagementSummary.composite_score || 0)}%` }}
                />
              </div>
            </div>

            {/* Card 2: My Attentiveness Score */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2 shadow-lg">
              <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                <span>My Attentiveness Score</span>
                <Activity className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-extrabold text-white">
                  {engagementSummary.attentiveness_subscore !== null && engagementSummary.attentiveness_subscore !== undefined
                    ? `${engagementSummary.attentiveness_subscore}%`
                    : 'N/A'}
                </span>
                <span className="text-[11px] text-slate-500">3D head pose</span>
              </div>
              <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, engagementSummary.attentiveness_subscore || 0)}%` }}
                />
              </div>
            </div>

            {/* Card 3: My Attendance Rate */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2 shadow-lg">
              <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                <span>My Overall Attendance</span>
                <UserCheck className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-extrabold text-white">
                  {studentAttendance ? `${studentAttendance.attendance_percentage}%` : 'N/A'}
                </span>
                {studentAttendance && (
                  <span className="text-xs text-slate-400">
                    {studentAttendance.present_count + studentAttendance.late_count} / {studentAttendance.total_sessions}
                  </span>
                )}
              </div>
              <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-indigo-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, studentAttendance?.attendance_percentage || 0)}%` }}
                />
              </div>
            </div>

            {/* Card 4: My Distractions & Questions */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2 shadow-lg">
              <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                <span>Distractions & Questions</span>
                <AlertTriangle className="w-4 h-4 text-amber-400" />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-extrabold text-white">
                  {engagementSummary.distraction_count}
                </span>
                <span className="text-xs text-slate-400">
                  {engagementSummary.question_count} questions asked
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Logged in this session</p>
            </div>
          </div>

          {/* DETAILED PERSONAL SUBSCORES */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Award className="w-4 h-4 text-indigo-400" />
              <span>Session Performance Subscores — {selectedSession?.title}</span>
            </h3>

            <div className="space-y-4">
              {/* Attentiveness */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-300">Head Pose Attentiveness</span>
                  <span className="text-emerald-400 font-bold">
                    {engagementSummary.attentiveness_subscore !== null && engagementSummary.attentiveness_subscore !== undefined
                      ? `${engagementSummary.attentiveness_subscore}%`
                      : 'N/A'}
                  </span>
                </div>
                <div className="w-full bg-slate-950 rounded-xl h-3 overflow-hidden p-0.5 border border-slate-800">
                  <div
                    className="bg-gradient-to-r from-emerald-600 to-emerald-400 h-full rounded-lg transition-all duration-700"
                    style={{ width: `${Math.min(100, engagementSummary.attentiveness_subscore || 0)}%` }}
                  />
                </div>
              </div>

              {/* Participation */}
              {engagementSummary.participation_subscore !== null && engagementSummary.participation_subscore !== undefined && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-300">Participation Frequency</span>
                    <span className="text-indigo-400 font-bold">{engagementSummary.participation_subscore}%</span>
                  </div>
                  <div className="w-full bg-slate-950 rounded-xl h-3 overflow-hidden p-0.5 border border-slate-800">
                    <div
                      className="bg-gradient-to-r from-indigo-600 to-indigo-400 h-full rounded-lg transition-all duration-700"
                      style={{ width: `${Math.min(100, engagementSummary.participation_subscore)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Sentiment */}
              {engagementSummary.sentiment_subscore !== null && engagementSummary.sentiment_subscore !== undefined && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-300">Interaction & Sentiment Score</span>
                    <span className="text-purple-400 font-bold">{engagementSummary.sentiment_subscore}%</span>
                  </div>
                  <div className="w-full bg-slate-950 rounded-xl h-3 overflow-hidden p-0.5 border border-slate-800">
                    <div
                      className="bg-gradient-to-r from-purple-600 to-purple-400 h-full rounded-lg transition-all duration-700"
                      style={{ width: `${Math.min(100, engagementSummary.sentiment_subscore)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2">
              <div>Sample Count: <strong className="text-white">{engagementSummary.sample_count}</strong> samples</div>
              <div>Distractions: <strong className="text-amber-400">{engagementSummary.distraction_count}</strong></div>
              <div>Questions Logged: <strong className="text-indigo-300">{engagementSummary.question_count}</strong></div>
            </div>
          </div>

          {/* FACIAL OBSERVATION SUMMARY */}
          {engagementSummary.facial_summary && engagementSummary.facial_summary.status === 'analyzed' && (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-400" />
                <span>Observed Facial Analysis — {engagementSummary.facial_summary.valid_samples} Valid Samples</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Dominant Expression</span>
                  <div className="text-lg font-extrabold text-white capitalize">
                    {engagementSummary.facial_summary.dominant_expression === 'insufficient_data'
                      ? 'Not enough data yet'
                      : engagementSummary.facial_summary.dominant_expression}
                  </div>
                  <span className="text-[11px] text-slate-500">
                    Observed across {engagementSummary.facial_summary.valid_windows} window(s)
                  </span>
                </div>
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-2">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Observed Expression Distribution</span>
                  <div className="grid grid-cols-5 gap-1.5 text-center text-[10px]">
                    {['neutral', 'happy', 'sad', 'angry', 'fear'].map((em) => {
                      const pct = Math.round((engagementSummary.facial_summary?.expression_distribution?.[em] || 0) * 100);
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
            </div>
          )}
        </>
      )}
    </div>
  );
};
