import React, { useState, useEffect } from 'react';
import { classroomApi } from '../services/api';
import type { Classroom, EnrolledStudent, RegisteredStudent } from '../types';
import {
  Users,
  UserPlus,
  Trash2,
  Search,
  CheckCircle2,
  AlertCircle,
  X,
  ScanFace,
  GraduationCap,
  Loader2,
} from 'lucide-react';

interface CourseEnrollmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  classroom: Classroom;
  onEnrollmentUpdated?: () => void;
}

export const CourseEnrollmentModal: React.FC<CourseEnrollmentModalProps> = ({
  isOpen,
  onClose,
  classroom,
  onEnrollmentUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'enrolled' | 'add'>('enrolled');
  const [enrolledStudents, setEnrolledStudents] = useState<EnrolledStudent[]>([]);
  const [registeredStudents, setRegisteredStudents] = useState<RegisteredStudent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Search & input
  const [searchEnrolled, setSearchEnrolled] = useState('');
  const [searchAvailable, setSearchAvailable] = useState('');
  const [quickUsn, setQuickUsn] = useState('');
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const fetchEnrolled = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await classroomApi.listEnrolledStudents(classroom.id);
      setEnrolledStudents(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch enrolled students.');
    } finally {
      setLoading(false);
    }
  };

  const fetchRegistered = async () => {
    try {
      const data = await classroomApi.listRegisteredStudents();
      setRegisteredStudents(data);
    } catch {
      // Non-blocking
    }
  };

  useEffect(() => {
    if (isOpen) {
      setActiveTab('enrolled');
      setError(null);
      setSuccessMsg(null);
      setSearchEnrolled('');
      setSearchAvailable('');
      setQuickUsn('');
      fetchEnrolled();
      fetchRegistered();
    }
  }, [isOpen, classroom.id]);

  const handleEnrollByStudentId = async (studentId: string, studentName: string) => {
    try {
      setIsEnrolling(true);
      setError(null);
      await classroomApi.enrollStudent(classroom.id, { student_id: studentId });
      setSuccessMsg(`Successfully enrolled ${studentName} into ${classroom.title}`);
      await fetchEnrolled();
      if (onEnrollmentUpdated) onEnrollmentUpdated();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to enroll student.');
    } finally {
      setIsEnrolling(false);
    }
  };

  const handleQuickEnrollUsn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickUsn.trim()) return;

    try {
      setIsEnrolling(true);
      setError(null);
      const res = await classroomApi.enrollStudent(classroom.id, { student_id_number: quickUsn.trim() });
      setSuccessMsg(`Enrolled student ${res.full_name} (${res.student_id_number})`);
      setQuickUsn('');
      await fetchEnrolled();
      if (onEnrollmentUpdated) onEnrollmentUpdated();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Student not found or already enrolled.');
    } finally {
      setIsEnrolling(false);
    }
  };

  const handleRemoveStudent = async (studentId: string, studentName: string) => {
    if (!confirm(`Are you sure you want to remove ${studentName} from this course?`)) return;

    try {
      setRemovingId(studentId);
      setError(null);
      await classroomApi.removeStudent(classroom.id, studentId);
      setSuccessMsg(`Removed ${studentName} from course.`);
      await fetchEnrolled();
      if (onEnrollmentUpdated) onEnrollmentUpdated();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to remove student from course.');
    } finally {
      setRemovingId(null);
    }
  };

  if (!isOpen) return null;

  const enrolledIds = new Set(enrolledStudents.map((s) => s.student_id));

  const filteredEnrolled = enrolledStudents.filter(
    (s) =>
      s.full_name.toLowerCase().includes(searchEnrolled.toLowerCase()) ||
      s.student_id_number.toLowerCase().includes(searchEnrolled.toLowerCase()) ||
      (s.department && s.department.toLowerCase().includes(searchEnrolled.toLowerCase()))
  );

  const filteredAvailable = registeredStudents.filter(
    (s) =>
      s.full_name.toLowerCase().includes(searchAvailable.toLowerCase()) ||
      s.student_id_number.toLowerCase().includes(searchAvailable.toLowerCase()) ||
      (s.department && s.department.toLowerCase().includes(searchAvailable.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* HEADER */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl text-indigo-400">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white">{classroom.title}</h3>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-mono bg-indigo-950 text-indigo-300 border border-indigo-800/50">
                  {classroom.course_code}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {classroom.department || 'Department N/A'} • {classroom.semester || 'Semester N/A'} •{' '}
                <span className="text-indigo-400 font-semibold">{enrolledStudents.length} enrolled student(s)</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* FEEDBACK BANNERS */}
        {error && (
          <div className="mx-6 mt-4 p-3.5 bg-red-950/60 border border-red-800 text-red-300 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-6 mt-4 p-3.5 bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs rounded-xl flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* NAVIGATION TABS */}
        <div className="px-6 pt-4 border-b border-slate-800/80 flex items-center gap-2">
          <button
            onClick={() => setActiveTab('enrolled')}
            className={`pb-3 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'enrolled'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Enrolled Students ({enrolledStudents.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('add')}
            className={`pb-3 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'add'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>Enroll New Students</span>
          </button>
        </div>

        {/* CONTENT BODY */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === 'enrolled' && (
            <div className="space-y-4">
              {/* SEARCH BAR */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter enrolled students by Name, USN, or Department..."
                  value={searchEnrolled}
                  onChange={(e) => setSearchEnrolled(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-800/70 border border-slate-700/60 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-all"
                />
              </div>

              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-2">
                  <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
                  <p className="text-xs text-slate-400">Loading enrolled students...</p>
                </div>
              ) : filteredEnrolled.length === 0 ? (
                <div className="text-center py-12 space-y-2">
                  <Users className="w-10 h-10 text-slate-600 mx-auto" />
                  <p className="text-sm font-bold text-slate-300">No Enrolled Students</p>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    {searchEnrolled
                      ? `No enrolled students match "${searchEnrolled}".`
                      : 'No students are currently enrolled in this course. Switch to the "Enroll New Students" tab to add students.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-800/40 border-b border-slate-800 text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                        <th className="py-2.5 px-3">Student Name</th>
                        <th className="py-2.5 px-3">USN</th>
                        <th className="py-2.5 px-3">Department</th>
                        <th className="py-2.5 px-3">Face Profile</th>
                        <th className="py-2.5 px-3">Enrolled Date</th>
                        <th className="py-2.5 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {filteredEnrolled.map((s) => (
                        <tr key={s.enrollment_id} className="hover:bg-slate-800/20 transition-all">
                          <td className="py-3 px-3">
                            <p className="font-bold text-white">{s.full_name}</p>
                            <p className="text-[10px] text-slate-400">{s.email}</p>
                          </td>
                          <td className="py-3 px-3 font-mono font-medium text-slate-300">
                            {s.student_id_number}
                          </td>
                          <td className="py-3 px-3 text-slate-400">
                            {s.department || 'N/A'}
                          </td>
                          <td className="py-3 px-3">
                            {s.has_face_enrolled ? (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/50 font-bold">
                                <ScanFace className="w-3 h-3" />
                                <span>Verified</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-950 text-amber-400 border border-amber-800/50 font-bold">
                                <AlertCircle className="w-3 h-3" />
                                <span>No Face Data</span>
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-slate-400 font-mono text-[10px]">
                            {new Date(s.enrolled_at).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <button
                              onClick={() => handleRemoveStudent(s.student_id, s.full_name)}
                              disabled={removingId === s.student_id}
                              className="px-2.5 py-1 text-red-400 hover:text-red-300 hover:bg-red-950/60 rounded-lg border border-red-900/40 transition-all text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50"
                            >
                              {removingId === s.student_id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Trash2 className="w-3 h-3" />
                              )}
                              <span>Remove</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'add' && (
            <div className="space-y-5">
              {/* QUICK ENROLL BY USN */}
              <form onSubmit={handleQuickEnrollUsn} className="p-4 bg-slate-800/40 border border-slate-700/60 rounded-2xl space-y-2">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <UserPlus className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Quick Enroll by Student USN / Roll Number</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. 4CB23AI073"
                    value={quickUsn}
                    onChange={(e) => setQuickUsn(e.target.value)}
                    className="flex-1 px-3.5 py-2 bg-slate-900/80 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono uppercase"
                  />
                  <button
                    type="submit"
                    disabled={isEnrolling || !quickUsn.trim()}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                  >
                    {isEnrolling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                    <span>Enroll Student</span>
                  </button>
                </div>
              </form>

              {/* SEARCH REGISTERED STUDENTS */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Institutional Registered Students
                  </h4>
                  <span className="text-[11px] text-slate-400">
                    {registeredStudents.length} total registered
                  </span>
                </div>

                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search registered students by Name, USN, or Department..."
                    value={searchAvailable}
                    onChange={(e) => setSearchAvailable(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-slate-800/70 border border-slate-700/60 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-all"
                  />
                </div>

                <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-800 divide-y divide-slate-800/50">
                  {filteredAvailable.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-500">
                      No registered students found matching filter.
                    </div>
                  ) : (
                    filteredAvailable.map((s) => {
                      const isAlreadyEnrolled = enrolledIds.has(s.student_id);
                      return (
                        <div
                          key={s.student_id}
                          className="p-3 flex items-center justify-between hover:bg-slate-800/30 transition-all"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-white text-xs">{s.full_name}</p>
                              <span className="font-mono text-[10px] text-indigo-400 bg-indigo-950/60 px-1.5 py-0.5 rounded">
                                {s.student_id_number}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              {s.email} {s.department ? `• ${s.department}` : ''}
                            </p>
                          </div>

                          <div>
                            {isAlreadyEnrolled ? (
                              <span className="text-[10px] font-bold px-2 py-1 rounded bg-slate-800 text-slate-400 border border-slate-700/50">
                                Enrolled
                              </span>
                            ) : (
                              <button
                                onClick={() => handleEnrollByStudentId(s.student_id, s.full_name)}
                                disabled={isEnrolling}
                                className="px-3 py-1 bg-indigo-600/80 hover:bg-indigo-600 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1"
                              >
                                <UserPlus className="w-3 h-3" />
                                <span>Enroll</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/40 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
