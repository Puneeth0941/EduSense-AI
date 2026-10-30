import React, { useState, useEffect } from 'react';
import { attendanceApi, triggerFileDownload } from '../services/api';
import type { SessionAttendanceSummaryResponse, AttendanceRecordResponse } from '../types';
import {
  Users,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  RefreshCw,
  X,
  Edit3,
  ShieldCheck,
  Search,
  FileSpreadsheet,
  Loader2,
  Activity,
} from 'lucide-react';

interface TeacherAttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
}

export const TeacherAttendanceModal: React.FC<TeacherAttendanceModalProps> = ({
  isOpen,
  onClose,
  sessionId,
}) => {
  const [summary, setSummary] = useState<SessionAttendanceSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Manual editing modal state
  const [editingRecord, setEditingRecord] = useState<AttendanceRecordResponse | null>(null);
  const [newStatus, setNewStatus] = useState<'PRESENT' | 'PARTIAL' | 'LATE' | 'ABSENT' | 'UNVERIFIED'>('PRESENT');
  const [reason, setReason] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Excel Export state
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  const handleExportToExcel = async () => {
    try {
      setIsExporting(true);
      setExportError(null);
      setExportSuccess(null);
      const { blob, filename } = await attendanceApi.exportAttendanceExcel({ sessionId });
      triggerFileDownload(blob, filename);
      setExportSuccess(`Report downloaded: ${filename}`);
      setTimeout(() => setExportSuccess(null), 4000);
    } catch (err: any) {
      setExportError(err.message || 'Failed to export attendance to Excel');
    } finally {
      setIsExporting(false);
    }
  };

  const fetchAttendance = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await attendanceApi.getSessionAttendance(sessionId);
      setSummary(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch session attendance data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setSummary(null);
      setError(null);
      setSearchTerm('');
      fetchAttendance();
      const interval = setInterval(fetchAttendance, 15000); // Periodic 15s refresh
      return () => clearInterval(interval);
    }
  }, [isOpen, sessionId]);

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;

    try {
      setIsUpdating(true);
      await attendanceApi.updateAttendanceRecord(editingRecord.id, newStatus, reason);
      setEditingRecord(null);
      setReason('');
      await fetchAttendance();
    } catch (err: any) {
      alert(`Failed to update attendance: ${err.message || 'Error'}`);
    } finally {
      setIsUpdating(false);
    }
  };

  if (!isOpen) return null;

  const filteredRecords = (summary?.records || []).filter(
    (r) =>
      r.student_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.student_id_number.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getVerificationStateBadge = (state?: string, status?: string) => {
    const val = (state || status || 'PRESENT').toUpperCase();
    if (val.includes('TEMPORARILY') || val === 'TEMPORARILY_NOT_DETECTED') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800/50">
          <Clock className="w-3 h-3" />
          <span>Temporarily Not Detected</span>
        </span>
      );
    }
    if (val.includes('REQUIRED') || val.includes('MISSING_CONFIRMED')) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-800/50">
          <AlertCircle className="w-3 h-3" />
          <span>Identity Verification Required</span>
        </span>
      );
    }
    if (val === 'PARTIAL' || val.includes('PARTIAL')) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-800/50">
          <Activity className="w-3 h-3" />
          <span>Partial Attendance</span>
        </span>
      );
    }
    if (val === 'ABSENT') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-red-950 text-red-300 border border-red-800/50">
          <XCircle className="w-3 h-3" />
          <span>Absent</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/50">
        <CheckCircle2 className="w-3 h-3" />
        <span>Present</span>
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="relative w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* MODAL HEADER */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl text-indigo-400">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Classroom Attendance & Verification Dashboard
              </h3>
              <p className="text-xs text-slate-400">
                {summary ? `${summary.classroom_title} — ${summary.session_title}` : 'Real-time Time-Based Attendance'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleExportToExcel}
              disabled={isExporting || loading}
              title="Export 3-section attendance report to Excel (.xlsx)"
              className="px-3.5 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl transition-all text-xs font-semibold flex items-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50"
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
              ) : (
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              )}
              <span>{isExporting ? 'Exporting...' : 'Export Attendance to Excel'}</span>
            </button>

            <button
              onClick={fetchAttendance}
              disabled={loading}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition-all text-xs font-semibold flex items-center gap-1.5"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
              <span>Refresh</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* EXPORT FEEDBACK ALERTS */}
        {exportError && (
          <div className="mx-6 mt-4 p-3.5 bg-red-950/60 border border-red-800/80 rounded-xl text-red-300 text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{exportError}</span>
            </div>
            <button onClick={() => setExportError(null)} className="text-red-400 hover:text-white text-xs font-bold">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {exportSuccess && (
          <div className="mx-6 mt-4 p-3.5 bg-emerald-950/60 border border-emerald-800/80 rounded-xl text-emerald-300 text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{exportSuccess}</span>
            </div>
            <button onClick={() => setExportSuccess(null)} className="text-emerald-400 hover:text-white text-xs font-bold">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* SUMMARY STATS BAR */}
        {summary && (
          <div className="p-6 bg-slate-950/60 border-b border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-4 shrink-0">
            <div className="p-3 bg-slate-900 border border-emerald-500/30 rounded-2xl flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Present (&ge; 75%)</p>
                <p className="text-lg font-extrabold text-white">{summary.present_count}</p>
              </div>
            </div>

            <div className="p-3 bg-slate-900 border border-purple-500/30 rounded-2xl flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Partial (&lt; 75%)</p>
                <p className="text-lg font-extrabold text-white">{summary.partial_count || 0}</p>
              </div>
            </div>

            <div className="p-3 bg-slate-900 border border-amber-500/30 rounded-2xl flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Late / In Progress</p>
                <p className="text-lg font-extrabold text-white">{summary.late_count + summary.unverified_count}</p>
              </div>
            </div>

            <div className="p-3 bg-slate-900 border border-red-500/30 rounded-2xl flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-red-500/20 text-red-400 flex items-center justify-center font-bold">
                <XCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Absent (0%)</p>
                <p className="text-lg font-extrabold text-white">{summary.absent_count}</p>
              </div>
            </div>
          </div>
        )}

        {/* SEARCH BAR */}
        <div className="px-6 py-3 bg-slate-900/80 border-b border-slate-800 flex items-center gap-3 shrink-0">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search enrolled student by name or USN..."
              className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
          <span className="text-xs text-slate-400 font-medium">
            Showing {filteredRecords.length} of {summary?.records.length || 0} enrolled students
          </span>
        </div>

        {/* ROSTER TABLE */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && !summary && (
            <div className="flex flex-col items-center justify-center py-16 space-y-3">
              <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
              <p className="text-xs text-slate-400 font-medium">Loading classroom attendance records...</p>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-950/60 border border-red-800 text-red-300 text-xs rounded-xl mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{error}</span>
              </div>
              <button
                onClick={fetchAttendance}
                className="px-3 py-1 bg-red-900/60 hover:bg-red-800 text-white rounded-lg font-bold text-xs"
              >
                Retry
              </button>
            </div>
          )}

          {!loading && summary && summary.records.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 space-y-2 text-center">
              <Users className="w-10 h-10 text-slate-600 mb-1" />
              <p className="text-sm font-bold text-slate-300">No Attendance Records Found</p>
              <p className="text-xs text-slate-500 max-w-sm">
                No students enrolled in this course or session. Enrolled students will populate here with live time tracking.
              </p>
            </div>
          )}

          {!loading && summary && summary.records.length > 0 && filteredRecords.length === 0 && (
            <div className="text-center py-12 text-slate-500 text-xs">
              No student records match search filter "{searchTerm}".
            </div>
          )}

          {!loading && filteredRecords.length > 0 && (
            <div className="overflow-x-auto rounded-2xl border border-slate-800">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-800/40 border-b border-slate-800 text-slate-400 uppercase font-bold text-[10px] tracking-wider">
                    <th className="py-3 px-3">Student</th>
                    <th className="py-3 px-3">Verification State</th>
                    <th className="py-3 px-3">Present Duration</th>
                    <th className="py-3 px-3">Attendance %</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredRecords.map((r) => {
                    const statusColors: Record<string, string> = {
                      PRESENT: 'bg-emerald-950 text-emerald-300 border-emerald-800/50',
                      PARTIAL: 'bg-purple-950 text-purple-300 border-purple-800/50',
                      LATE: 'bg-amber-950 text-amber-300 border-amber-800/50',
                      UNVERIFIED: 'bg-indigo-950 text-indigo-300 border-indigo-800/50',
                      ABSENT: 'bg-red-950 text-red-300 border-red-800/50',
                    };

                    const durationMins = Math.floor((r.presence_duration_seconds || 0) / 60);
                    const attPct = r.attendance_percentage !== undefined ? r.attendance_percentage : 0;

                    return (
                      <tr key={r.id} className="hover:bg-slate-800/30 transition-all">
                        <td className="py-3 px-3">
                          <div>
                            <p className="font-bold text-white text-xs">{r.student_name || 'Student'}</p>
                            <p className="text-[10px] text-slate-400 font-mono">USN: {r.student_id_number || 'N/A'}</p>
                          </div>
                        </td>

                        <td className="py-3 px-3">
                          {getVerificationStateBadge(r.verification_state, r.status)}
                        </td>

                        <td className="py-3 px-3 text-slate-300 font-mono text-xs">
                          {durationMins > 0 ? `${durationMins} mins` : (r.presence_duration_seconds || 0) > 0 ? `${r.presence_duration_seconds}s` : '0 mins'}
                        </td>

                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-slate-800 h-1.5 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  attPct >= 75 ? 'bg-emerald-500' : attPct > 0 ? 'bg-purple-500' : 'bg-red-500'
                                }`}
                                style={{ width: `${Math.min(100, Math.max(0, attPct))}%` }}
                              />
                            </div>
                            <span className="font-mono text-xs font-bold text-slate-200">
                              {attPct.toFixed(1)}%
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-3">
                          <div className="flex flex-col items-start gap-1">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                                statusColors[r.status] || statusColors.UNVERIFIED
                              }`}
                            >
                              {r.status}
                            </span>
                            {r.is_manually_corrected && (
                              <span className="text-[9px] text-indigo-400 flex items-center gap-1 font-medium">
                                <ShieldCheck className="w-3 h-3" />
                                <span>Manual ({r.corrected_by_name || 'Teacher'})</span>
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-3 text-right">
                          <button
                            onClick={() => {
                              setEditingRecord(r);
                              setNewStatus((r.status as any) || 'PRESENT');
                              setReason(r.correction_reason || '');
                            }}
                            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl border border-slate-700 transition-all text-xs font-semibold inline-flex items-center gap-1 ml-auto"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-indigo-400" />
                            <span>Edit</span>
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

        {/* MANUAL EDIT DIALOG */}
        {editingRecord && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-bold text-sm text-white">Manual Status Override</h4>
                <button
                  onClick={() => setEditingRecord(null)}
                  className="text-slate-400 hover:text-white text-xs font-bold"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleUpdateStatus} className="space-y-4">
                <div>
                  <p className="text-xs text-slate-400">Student</p>
                  <p className="text-sm font-bold text-white">{editingRecord.student_name}</p>
                  <p className="text-xs text-slate-500 font-mono">ID: {editingRecord.student_id_number}</p>
                </div>

                <div>
                  <label className="text-xs text-slate-300 font-semibold mb-1 block">New Attendance Status</label>
                  <select
                    value={newStatus}
                    onChange={(e: any) => setNewStatus(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="PRESENT">PRESENT (&ge; 75%)</option>
                    <option value="PARTIAL">PARTIAL ATTENDANCE (&lt; 75%)</option>
                    <option value="ABSENT">ABSENT (0%)</option>
                    <option value="LATE">LATE</option>
                    <option value="UNVERIFIED">UNVERIFIED</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-300 font-semibold mb-1 block">Reason for Override</label>
                  <input
                    type="text"
                    required
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Excused, Camera hardware malfunction..."
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingRecord(null)}
                    className="px-4 py-2 bg-slate-800 text-slate-300 hover:text-white rounded-xl text-xs font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isUpdating}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
                  >
                    {isUpdating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                    <span>Save Override</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
