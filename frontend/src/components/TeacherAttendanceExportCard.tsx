import React, { useState } from 'react';
import { attendanceApi, triggerFileDownload } from '../services/api';
import type { Classroom, ClassSession, TeacherAttendanceSummaryResponse } from '../types';
import {
  FileSpreadsheet,
  Download,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Users,
  BookOpen,
  RotateCcw,
} from 'lucide-react';

interface TeacherAttendanceExportCardProps {
  classrooms: Classroom[];
  sessions: ClassSession[];
  teacherAttendance: TeacherAttendanceSummaryResponse | null;
  onOpenSessionAttendance?: (sessionId: string) => void;
}

export const TeacherAttendanceExportCard: React.FC<TeacherAttendanceExportCardProps> = ({
  classrooms,
  sessions,
  teacherAttendance,
  onOpenSessionAttendance,
}) => {
  // Filter States
  const [selectedClassroomId, setSelectedClassroomId] = useState<string>('');
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Status & Feedback States
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  // Filter sessions based on selected classroom
  const availableSessions = selectedClassroomId
    ? sessions.filter((s) => s.classroom_id === selectedClassroomId)
    : sessions;

  // Preset quick date filters
  const applyDatePreset = (preset: 'today' | '7days' | '30days' | 'clear') => {
    const today = new Date();
    const formatYMD = (d: Date) => d.toISOString().split('T')[0];

    if (preset === 'today') {
      const todayStr = formatYMD(today);
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === '7days') {
      const past = new Date();
      past.setDate(today.getDate() - 7);
      setStartDate(formatYMD(past));
      setEndDate(formatYMD(today));
    } else if (preset === '30days') {
      const past = new Date();
      past.setDate(today.getDate() - 30);
      setStartDate(formatYMD(past));
      setEndDate(formatYMD(today));
    } else if (preset === 'clear') {
      setStartDate('');
      setEndDate('');
    }
  };

  const handleExport = async () => {
    try {
      setIsExporting(true);
      setExportError(null);
      setExportSuccess(null);

      // Validate date order if both are chosen
      if (startDate && endDate && startDate > endDate) {
        throw new Error('Start date cannot be after end date.');
      }

      const params: {
        sessionId?: string;
        classroomId?: string;
        startDate?: string;
        endDate?: string;
      } = {};

      if (selectedSessionId) {
        params.sessionId = selectedSessionId;
      } else if (selectedClassroomId) {
        params.classroomId = selectedClassroomId;
      }

      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      const { blob, filename } = await attendanceApi.exportAttendanceExcel(params);
      triggerFileDownload(blob, filename);

      setExportSuccess(`Attendance report successfully downloaded: ${filename}`);
      setTimeout(() => setExportSuccess(null), 6000);
    } catch (err: any) {
      setExportError(err.message || 'Failed to generate and export attendance report.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl space-y-6">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800/80">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="bg-emerald-950 text-emerald-300 text-xs font-semibold px-3 py-1 rounded-full border border-emerald-800/50 flex items-center gap-1.5">
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>Excel Export Engine</span>
            </span>
            <span className="text-slate-500 text-xs">•</span>
            <span className="text-slate-400 text-xs font-medium">PostgreSQL & OpenPyXL</span>
          </div>
          <h3 className="text-xl md:text-2xl font-bold text-white tracking-tight">
            Teacher Attendance Report Export
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
            Export verified present student attendance records, USNs, facial emotions, and speech sentiment into formatted Microsoft Excel (.xlsx) workbooks matching the official template.
          </p>
        </div>

        {/* QUICK STATS PILLS */}
        {teacherAttendance && (
          <div className="flex items-center gap-3 bg-slate-950/60 p-3 rounded-2xl border border-slate-800 shrink-0">
            <div className="text-center px-3 border-r border-slate-800">
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Classrooms</p>
              <p className="text-base font-extrabold text-white">{teacherAttendance.total_classrooms}</p>
            </div>
            <div className="text-center px-3 border-r border-slate-800">
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Sessions</p>
              <p className="text-base font-extrabold text-white">{teacherAttendance.total_sessions_conducted}</p>
            </div>
            <div className="text-center px-3">
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Overall Rate</p>
              <p className="text-base font-extrabold text-emerald-400">{teacherAttendance.overall_attendance_rate}%</p>
            </div>
          </div>
        )}
      </div>

      {/* ERROR & SUCCESS NOTIFICATIONS */}
      {exportError && (
        <div className="p-4 bg-red-950/60 border border-red-800 text-red-300 text-xs rounded-2xl flex items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <span className="font-medium">{exportError}</span>
          </div>
          <button
            onClick={() => setExportError(null)}
            className="text-red-400 hover:text-white text-xs font-bold px-2 py-1 rounded-lg hover:bg-red-900/40"
          >
            Dismiss
          </button>
        </div>
      )}

      {exportSuccess && (
        <div className="p-4 bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs rounded-2xl flex items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span className="font-medium">{exportSuccess}</span>
          </div>
          <button
            onClick={() => setExportSuccess(null)}
            className="text-emerald-400 hover:text-white text-xs font-bold px-2 py-1 rounded-lg hover:bg-emerald-900/40"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* FILTER CONTROLS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. CLASSROOM FILTER */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
            <span>Classroom</span>
          </label>
          <select
            value={selectedClassroomId}
            onChange={(e) => {
              setSelectedClassroomId(e.target.value);
              setSelectedSessionId(''); // Reset session if classroom changes
            }}
            className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 font-medium"
          >
            <option value="">All Classrooms</option>
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} ({c.course_code})
              </option>
            ))}
          </select>
        </div>

        {/* 2. SESSION FILTER */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-indigo-400" />
            <span>Session</span>
          </label>
          <select
            value={selectedSessionId}
            onChange={(e) => setSelectedSessionId(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 font-medium"
          >
            <option value="">All Sessions (Classroom / Date Range)</option>
            {availableSessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} ({s.status})
              </option>
            ))}
          </select>
        </div>

        {/* 3. START DATE */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-indigo-400" />
            <span>Start Date</span>
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 font-medium"
          />
        </div>

        {/* 4. END DATE */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-indigo-400" />
            <span>End Date</span>
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 font-medium"
          />
        </div>
      </div>

      {/* DATE PRESETS & ACTION BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-slate-400 font-medium mr-1">Quick Date Range:</span>
          <button
            type="button"
            onClick={() => applyDatePreset('today')}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-[11px] font-semibold border border-slate-700 transition-all"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => applyDatePreset('7days')}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-[11px] font-semibold border border-slate-700 transition-all"
          >
            Last 7 Days
          </button>
          <button
            type="button"
            onClick={() => applyDatePreset('30days')}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-[11px] font-semibold border border-slate-700 transition-all"
          >
            Last 30 Days
          </button>
          {(startDate || endDate) && (
            <button
              type="button"
              onClick={() => applyDatePreset('clear')}
              className="px-2.5 py-1 bg-slate-950 hover:bg-slate-900 text-slate-400 hover:text-slate-200 rounded-lg text-[11px] font-semibold border border-slate-800 transition-all flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Dates</span>
            </button>
          )}
        </div>

        {/* PRIMARY EXPORT BUTTON */}
        <div className="flex items-center gap-3">
          <button
            id="export-attendance-btn"
            onClick={handleExport}
            disabled={isExporting}
            className="w-full sm:w-auto px-5 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:from-emerald-700 active:to-teal-700 text-white font-bold text-xs rounded-xl transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 cursor-pointer"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Generating Excel Report...</span>
              </>
            ) : (
              <>
                <FileSpreadsheet className="w-4 h-4 text-emerald-100" />
                <span>Export Attendance to Excel</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* RECENT SESSIONS ATTENDANCE QUICK LAUNCH */}
      {sessions.length > 0 && onOpenSessionAttendance && (
        <div className="pt-4 border-t border-slate-800/80">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Recent Conducted Sessions (Quick Roster View)
            </h4>
            <span className="text-[11px] text-slate-500">Click to view or edit live attendance</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {sessions.slice(0, 3).map((sess) => (
              <div
                key={sess.id}
                className="p-3 bg-slate-950/70 border border-slate-800/90 hover:border-indigo-500/40 rounded-2xl flex items-center justify-between gap-3 transition-all group"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[10px] font-bold text-indigo-400 uppercase">
                      {sess.course_code || 'CS'}
                    </span>
                    <span className="text-slate-600 text-[10px]">•</span>
                    <span className="text-[10px] text-slate-500">
                      {sess.actual_end_time
                        ? new Date(sess.actual_end_time).toLocaleDateString()
                        : new Date(sess.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-white truncate">{sess.title}</p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => onOpenSessionAttendance(sess.id)}
                    className="p-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all"
                    title="Open Roster Modal"
                  >
                    <Users className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        setIsExporting(true);
                        setExportError(null);
                        const { blob, filename } = await attendanceApi.exportAttendanceExcel({ sessionId: sess.id });
                        triggerFileDownload(blob, filename);
                        setExportSuccess(`Exported ${filename}`);
                      } catch (err: any) {
                        setExportError(err.message || 'Export failed');
                      } finally {
                        setIsExporting(false);
                      }
                    }}
                    disabled={isExporting}
                    className="p-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all"
                    title="Export this session directly to Excel"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
