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
    if (score >= 70) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (score >= 50) return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-red-50 text-red-700 border-red-200';
  };

  return (
    <div className="space-y-6">
      {/* HEADER & SESSION SELECTOR */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="bg-blue-50 text-blue-700 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-blue-100 flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5 text-blue-600" />
              <span>Personal Analytics</span>
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Personal Engagement Dashboard</h2>
          <p className="text-xs text-slate-500">
            Review your engagement metrics, attentiveness subscores, distraction events, and attendance summary.
          </p>
        </div>

        {/* Session Dropdown Selector */}
        <div className="w-full md:w-72 shrink-0">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
            Select Class Session
          </label>
          <div className="relative">
            <select
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500 appearance-none pr-8 font-medium"
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
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* TRANSPARENCY DISCLAIMER NOTE */}
      <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl flex items-start gap-3">
        <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-900 leading-relaxed">
          <strong className="font-semibold text-amber-950">AI Transparency Note:</strong> Attentiveness is estimated from 3D head-pose geometry. Facial analysis reflects visible camera observations and does not prove internal emotional states.
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
            onClick={() => selectedSessionId && fetchStudentAnalytics(selectedSessionId)}
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
          <p className="text-xs font-medium text-slate-600">Loading your personal engagement analytics...</p>
        </div>
      ) : !engagementSummary || sessions.length === 0 ? (
        /* EMPTY STATE */
        <div className="p-12 text-center bg-white border border-slate-200 rounded-xl space-y-2 shadow-xs">
          <Activity className="w-8 h-8 text-slate-400 mx-auto" />
          <h3 className="text-sm font-bold text-slate-700">No Personal Analytics Data for this Session</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Join an active class session to enable periodic engagement sampling and track your attentiveness scores.
          </p>
        </div>
      ) : (
        <>
          {/* PERSONAL KPI STAT CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: My Engagement Score */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2 shadow-xs">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span>My Engagement Score</span>
                <TrendingUp className="w-4 h-4 text-blue-600" />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-slate-900">
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
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-blue-600 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, engagementSummary.composite_score || 0)}%` }}
                />
              </div>
            </div>

            {/* Card 2: My Attentiveness Score */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2 shadow-xs">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span>Attentiveness Score</span>
                <Activity className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-slate-900">
                  {engagementSummary.attentiveness_subscore !== null && engagementSummary.attentiveness_subscore !== undefined
                    ? `${engagementSummary.attentiveness_subscore}%`
                    : 'N/A'}
                </span>
                <span className="text-[11px] text-slate-400">3D head pose</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-emerald-600 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, engagementSummary.attentiveness_subscore || 0)}%` }}
                />
              </div>
            </div>

            {/* Card 3: My Attendance Rate */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2 shadow-xs">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span>Overall Attendance</span>
                <UserCheck className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-slate-900">
                  {studentAttendance ? `${studentAttendance.attendance_percentage}%` : 'N/A'}
                </span>
                {studentAttendance && (
                  <span className="text-xs text-slate-500">
                    {studentAttendance.present_count + studentAttendance.late_count} / {studentAttendance.total_sessions}
                  </span>
                )}
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, studentAttendance?.attendance_percentage || 0)}%` }}
                />
              </div>
            </div>

            {/* Card 4: My Distractions & Questions */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2 shadow-xs">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span>Distractions & Questions</span>
                <AlertTriangle className="w-4 h-4 text-amber-600" />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-slate-900">
                  {engagementSummary.distraction_count}
                </span>
                <span className="text-xs text-slate-500">
                  {engagementSummary.question_count} queries
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Recorded in this session</p>
            </div>
          </div>

          {/* DETAILED PERSONAL SUBSCORES */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-xs">
            <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2">
              <Award className="w-4 h-4 text-blue-600" />
              <span>Session Performance Subscores — {selectedSession?.title}</span>
            </h3>

            <div className="space-y-4">
              {/* Attentiveness */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-700">Head Pose Attentiveness</span>
                  <span className="text-emerald-700 font-bold">
                    {engagementSummary.attentiveness_subscore !== null && engagementSummary.attentiveness_subscore !== undefined
                      ? `${engagementSummary.attentiveness_subscore}%`
                      : 'N/A'}
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-lg h-2.5 overflow-hidden border border-slate-200">
                  <div
                    className="bg-emerald-600 h-full rounded-md transition-all duration-700"
                    style={{ width: `${Math.min(100, engagementSummary.attentiveness_subscore || 0)}%` }}
                  />
                </div>
              </div>

              {/* Participation */}
              {engagementSummary.participation_subscore !== null && engagementSummary.participation_subscore !== undefined && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-700">Participation Frequency</span>
                    <span className="text-blue-700 font-bold">{engagementSummary.participation_subscore}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-lg h-2.5 overflow-hidden border border-slate-200">
                    <div
                      className="bg-blue-600 h-full rounded-md transition-all duration-700"
                      style={{ width: `${Math.min(100, engagementSummary.participation_subscore)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Sentiment */}
              {engagementSummary.sentiment_subscore !== null && engagementSummary.sentiment_subscore !== undefined && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-700">Interaction & Sentiment Score</span>
                    <span className="text-purple-700 font-bold">{engagementSummary.sentiment_subscore}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-lg h-2.5 overflow-hidden border border-slate-200">
                    <div
                      className="bg-purple-600 h-full rounded-md transition-all duration-700"
                      style={{ width: `${Math.min(100, engagementSummary.sentiment_subscore)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-2">
              <div>Sample Count: <strong className="text-slate-900">{engagementSummary.sample_count}</strong> samples</div>
              <div>Distractions: <strong className="text-amber-700">{engagementSummary.distraction_count}</strong></div>
              <div>Questions Logged: <strong className="text-blue-700">{engagementSummary.question_count}</strong></div>
            </div>
          </div>

          {/* FACIAL OBSERVATION SUMMARY */}
          {engagementSummary.facial_summary && engagementSummary.facial_summary.status === 'analyzed' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-xs">
              <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-600" />
                <span>Observed Facial Analysis — {engagementSummary.facial_summary.valid_samples} Valid Samples</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-500">Dominant Expression</span>
                  <div className="text-lg font-bold text-slate-900 capitalize">
                    {engagementSummary.facial_summary.dominant_expression === 'insufficient_data'
                      ? 'Not enough data'
                      : engagementSummary.facial_summary.dominant_expression}
                  </div>
                  <span className="text-[11px] text-slate-500">
                    Observed across {engagementSummary.facial_summary.valid_windows} window(s)
                  </span>
                </div>
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <span className="text-[10px] uppercase font-bold text-slate-500">Expression Distribution</span>
                  <div className="grid grid-cols-5 gap-1.5 text-center text-[10px]">
                    {['neutral', 'happy', 'sad', 'angry', 'fear'].map((em) => {
                      const pct = Math.round((engagementSummary.facial_summary?.expression_distribution?.[em] || 0) * 100);
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
            </div>
          )}
        </>
      )}
    </div>
  );
};
