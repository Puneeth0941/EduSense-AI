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
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
          <Clock className="w-3 h-3" />
          <span>Temporarily Not Detected</span>
        </span>
      );
    }
    if (val.includes('REQUIRED') || val.includes('MISSING_CONFIRMED')) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
          <AlertCircle className="w-3 h-3" />
          <span>Verification Required</span>
        </span>
      );
    }
    if (val === 'PARTIAL' || val.includes('PARTIAL')) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
          <Activity className="w-3 h-3" />
          <span>Partial Attendance</span>
        </span>
      );
    }
    if (val === 'ABSENT') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
          <XCircle className="w-3 h-3" />
          <span>Absent</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
        <CheckCircle2 className="w-3 h-3" />
        <span>Present</span>
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
      <div className="relative w-full max-w-5xl bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* MODAL HEADER */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 border border-blue-100 rounded-xl text-blue-600">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Classroom Attendance & Verification Roster
              </h3>
              <p className="text-xs text-slate-500">
                {summary ? `${summary.classroom_title} — ${summary.session_title}` : 'Real-time Time-Based Attendance'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportToExcel}
              disabled={isExporting || loading}
              title="Export attendance report to Excel (.xlsx)"
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors text-xs font-semibold flex items-center gap-1.5 shadow-xs disabled:opacity-50"
            >
              {isExporting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
              ) : (
                <FileSpreadsheet className="w-3.5 h-3.5 text-white" />
              )}
              <span>{isExporting ? 'Exporting...' : 'Export to Excel'}</span>
            </button>

            <button
              onClick={fetchAttendance}
              disabled={loading}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-200 transition-colors text-xs font-semibold flex items-center gap-1"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* EXPORT FEEDBACK ALERTS */}
        {exportError && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{exportError}</span>
            </div>
            <button onClick={() => setExportError(null)} className="text-red-700 hover:text-red-900 text-xs font-bold">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {exportSuccess && (
          <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{exportSuccess}</span>
            </div>
            <button onClick={() => setExportSuccess(null)} className="text-emerald-700 hover:text-emerald-900 text-xs font-bold">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* SUMMARY STATS BAR */}
        {summary && (
          <div className="p-4 bg-slate-50 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
            <div className="p-3 bg-white border border-emerald-200 rounded-xl flex items-center gap-3 shadow-xs">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Present (&ge; 75%)</p>
                <p className="text-base font-extrabold text-slate-900">{summary.present_count}</p>
              </div>
            </div>

            <div className="p-3 bg-white border border-purple-200 rounded-xl flex items-center gap-3 shadow-xs">
              <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                <Activity className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Partial (&lt; 75%)</p>
                <p className="text-base font-extrabold text-slate-900">{summary.partial_count || 0}</p>
              </div>
            </div>

            <div className="p-3 bg-white border border-amber-200 rounded-xl flex items-center gap-3 shadow-xs">
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Late / In Progress</p>
                <p className="text-base font-extrabold text-slate-900">{summary.late_count + summary.unverified_count}</p>
              </div>
            </div>

            <div className="p-3 bg-white border border-red-200 rounded-xl flex items-center gap-3 shadow-xs">
              <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center font-bold">
                <XCircle className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Absent (0%)</p>
                <p className="text-base font-extrabold text-slate-900">{summary.absent_count}</p>
              </div>
            </div>
          </div>
        )}

        {/* SEARCH BAR */}
        <div className="px-5 py-2.5 bg-white border-b border-slate-200 flex items-center gap-3 shrink-0">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search enrolled student by name or USN..."
              className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <span className="text-xs text-slate-500 font-medium">
            Showing {filteredRecords.length} of {summary?.records.length || 0} enrolled students
          </span>
        </div>

        {/* ROSTER TABLE */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading && !summary && (
            <div className="flex flex-col items-center justify-center py-16 space-y-2">
              <RefreshCw className="w-6 h-6 text-blue-600 animate-spin" />
              <p className="text-xs text-slate-500 font-medium">Loading classroom attendance records...</p>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{error}</span>
              </div>
              <button
                onClick={fetchAttendance}
                className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-800 rounded font-bold text-xs"
              >
                Retry
              </button>
            </div>
          )}

          {!loading && summary && summary.records.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 space-y-1 text-center">
              <Users className="w-8 h-8 text-slate-400 mb-1" />
              <p className="text-sm font-bold text-slate-700">No Attendance Records Found</p>
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
            <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-bold text-[10px] tracking-wider">
                    <th className="py-2.5 px-3">Student</th>
                    <th className="py-2.5 px-3">Verification State</th>
                    <th className="py-2.5 px-3">Present Duration</th>
                    <th className="py-2.5 px-3">Attendance %</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRecords.map((r) => {
                    const statusColors: Record<string, string> = {
                      PRESENT: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                      PARTIAL: 'bg-purple-50 text-purple-700 border-purple-200',
                      LATE: 'bg-amber-50 text-amber-700 border-amber-200',
                      UNVERIFIED: 'bg-blue-50 text-blue-700 border-blue-200',
                      ABSENT: 'bg-red-50 text-red-700 border-red-200',
                    };

                    const durationMins = Math.floor((r.presence_duration_seconds || 0) / 60);
                    const attPct = r.attendance_percentage !== undefined ? r.attendance_percentage : 0;

                    return (
                      <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-3">
                          <div>
                            <p className="font-bold text-slate-900 text-xs">{r.student_name || 'Student'}</p>
                            <p className="text-[10px] text-slate-500 font-mono">USN: {r.student_id_number || 'N/A'}</p>
                          </div>
                        </td>

                        <td className="py-3 px-3">
                          {getVerificationStateBadge(r.verification_state, r.status)}
                        </td>

                        <td className="py-3 px-3 text-slate-700 font-mono text-xs">
                          {durationMins > 0 ? `${durationMins} mins` : (r.presence_duration_seconds || 0) > 0 ? `${r.presence_duration_seconds}s` : '0 mins'}
                        </td>

                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  attPct >= 75 ? 'bg-emerald-500' : attPct > 0 ? 'bg-purple-500' : 'bg-red-500'
                                }`}
                                style={{ width: `${Math.min(100, Math.max(0, attPct))}%` }}
                              />
                            </div>
                            <span className="font-mono text-xs font-bold text-slate-800">
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
                              <span className="text-[9px] text-blue-600 flex items-center gap-1 font-medium">
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
                            className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 rounded-lg border border-slate-200 transition-colors text-xs font-medium inline-flex items-center gap-1 shadow-2xs"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-blue-600" />
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
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
            <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 shadow-xl">
              <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-2">
                <h4 className="font-bold text-sm text-slate-900">Manual Attendance Status Override</h4>
                <button
                  onClick={() => setEditingRecord(null)}
                  className="text-slate-400 hover:text-slate-700 text-xs font-bold"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleUpdateStatus} className="space-y-4">
                <div>
                  <p className="text-xs text-slate-500">Student Name</p>
                  <p className="text-sm font-bold text-slate-900">{editingRecord.student_name}</p>
                  <p className="text-xs text-slate-500 font-mono">USN: {editingRecord.student_id_number}</p>
                </div>

                <div>
                  <label className="text-xs text-slate-700 font-semibold mb-1 block">New Attendance Status</label>
                  <select
                    value={newStatus}
                    onChange={(e: any) => setNewStatus(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="PRESENT">PRESENT (&ge; 75%)</option>
                    <option value="PARTIAL">PARTIAL ATTENDANCE (&lt; 75%)</option>
                    <option value="ABSENT">ABSENT (0%)</option>
                    <option value="LATE">LATE</option>
                    <option value="UNVERIFIED">UNVERIFIED</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-700 font-semibold mb-1 block">Reason for Override</label>
                  <input
                    type="text"
                    required
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Excused medical leave, camera malfunction..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setEditingRecord(null)}
                    className="px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isUpdating}
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs"
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
