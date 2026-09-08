import React, { useState, useEffect } from 'react';
import { attendanceApi } from '../services/api';
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
  const [newStatus, setNewStatus] = useState<'PRESENT' | 'LATE' | 'ABSENT' | 'UNVERIFIED'>('PRESENT');
  const [reason, setReason] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

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

  const filteredRecords = summary?.records.filter(
    (r) =>
      r.student_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.student_id_number.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* HEADER */}
        <div className="p-6 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Classroom Attendance Roster
              </h3>
              <p className="text-xs text-slate-400">
                {summary ? `${summary.classroom_title} — ${summary.session_title}` : 'Real-time Attendance'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
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

        {/* SUMMARY STATS BAR */}
        {summary && (
          <div className="p-6 bg-slate-950/60 border-b border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-4 shrink-0">
            <div className="p-3 bg-slate-900 border border-emerald-500/30 rounded-2xl flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Present</p>
                <p className="text-lg font-extrabold text-white">{summary.present_count}</p>
              </div>
            </div>

            <div className="p-3 bg-slate-900 border border-amber-500/30 rounded-2xl flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Late</p>
                <p className="text-lg font-extrabold text-white">{summary.late_count}</p>
              </div>
            </div>

            <div className="p-3 bg-slate-900 border border-indigo-500/30 rounded-2xl flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Unverified</p>
                <p className="text-lg font-extrabold text-white">{summary.unverified_count}</p>
              </div>
            </div>

            <div className="p-3 bg-slate-900 border border-red-500/30 rounded-2xl flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-red-500/20 text-red-400 flex items-center justify-center font-bold">
                <XCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Absent</p>
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
              placeholder="Search student by name or ID..."
              className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
          <span className="text-xs text-slate-400 font-medium">
            Showing {filteredRecords.length} of {summary?.records.length || 0} students
          </span>
        </div>

        {/* ROSTER TABLE */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="p-4 bg-red-950/60 border border-red-800 text-red-300 text-xs rounded-xl mb-4 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {filteredRecords.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              No student records match the search filter.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase font-bold text-[10px] tracking-wider">
                  <th className="pb-3 px-2">Student</th>
                  <th className="pb-3 px-2">Status</th>
                  <th className="pb-3 px-2">First Verified</th>
                  <th className="pb-3 px-2">Last Verified</th>
                  <th className="pb-3 px-2">Duration</th>
                  <th className="pb-3 px-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredRecords.map((r) => {
                  const statusColors = {
                    PRESENT: 'bg-emerald-950 text-emerald-300 border-emerald-800/50',
                    LATE: 'bg-amber-950 text-amber-300 border-amber-800/50',
                    UNVERIFIED: 'bg-indigo-950 text-indigo-300 border-indigo-800/50',
                    ABSENT: 'bg-red-950 text-red-300 border-red-800/50',
                  };

                  const durationMins = Math.floor(r.presence_duration_seconds / 60);

                  return (
                    <tr key={r.id} className="hover:bg-slate-800/30 transition-all">
                      <td className="py-3 px-2">
                        <div>
                          <p className="font-bold text-white">{r.student_name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">ID: {r.student_id_number}</p>
                        </div>
                      </td>

                      <td className="py-3 px-2">
                        <div className="flex flex-col items-start gap-1">
                          <span
                            className={`text-[10px] font-bold px-2.5 py-0.5 rounded border uppercase tracking-wider ${
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

                      <td className="py-3 px-2 text-slate-300 font-mono text-[11px]">
                        {r.first_verified_at ? new Date(r.first_verified_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>

                      <td className="py-3 px-2 text-slate-300 font-mono text-[11px]">
                        {r.last_verified_at ? new Date(r.last_verified_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>

                      <td className="py-3 px-2 text-slate-300 font-mono text-[11px]">
                        {durationMins > 0 ? `${durationMins} mins` : r.verification_count > 0 ? '< 1 min' : '0 mins'}
                      </td>

                      <td className="py-3 px-2 text-right">
                        <button
                          onClick={() => {
                            setEditingRecord(r);
                            setNewStatus(r.status);
                            setReason(r.correction_reason || '');
                          }}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl border border-slate-700 transition-all text-xs font-semibold flex items-center gap-1 ml-auto"
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
          )}
        </div>
      </div>

      {/* MODAL: MANUAL ATTENDANCE CORRECTION */}
      {editingRecord && (
        <div className="fixed inset-0 z-60 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h4 className="text-base font-bold text-white">Manual Attendance Override</h4>
              <button
                onClick={() => setEditingRecord(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-2xl space-y-1 text-xs">
              <p className="text-slate-400">Student: <strong className="text-white">{editingRecord.student_name}</strong> ({editingRecord.student_id_number})</p>
              <p className="text-slate-400">Current Status: <strong className="text-indigo-400">{editingRecord.status}</strong></p>
            </div>

            <form onSubmit={handleUpdateStatus} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  New Status
                </label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as any)}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-500"
                >
                  <option value="PRESENT">PRESENT</option>
                  <option value="LATE">LATE</option>
                  <option value="UNVERIFIED">UNVERIFIED</option>
                  <option value="ABSENT">ABSENT</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Correction Reason
                </label>
                <textarea
                  rows={3}
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Student experienced network issue or arrived with physical approval."
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingRecord(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/20"
                >
                  {isUpdating ? 'Saving...' : 'Save Manual Change'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
