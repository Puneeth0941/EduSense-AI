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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
      <div className="relative w-full max-w-3xl bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* HEADER */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 border border-blue-100 rounded-xl text-blue-600">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">{classroom.title}</h3>
                <span className="text-xs px-2 py-0.5 rounded-md font-mono font-bold bg-blue-50 text-blue-700 border border-blue-100">
                  {classroom.course_code}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {classroom.department || 'Department N/A'} • {classroom.semester ? `Sem ${classroom.semester}` : 'Semester N/A'} •{' '}
                <span className="text-blue-600 font-semibold">{enrolledStudents.length} enrolled student(s)</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* FEEDBACK BANNERS */}
        {error && (
          <div className="mx-5 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-5 mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* NAVIGATION TABS */}
        <div className="px-5 pt-3 border-b border-slate-200 flex items-center gap-2">
          <button
            onClick={() => setActiveTab('enrolled')}
            className={`pb-2.5 px-3 text-xs font-bold transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === 'enrolled'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Enrolled Students ({enrolledStudents.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('add')}
            className={`pb-2.5 px-3 text-xs font-bold transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === 'add'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>Enroll New Students</span>
          </button>
        </div>

        {/* CONTENT BODY */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {activeTab === 'enrolled' && (
            <div className="space-y-4">
              {/* SEARCH BAR */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter enrolled students by Name, USN, or Department..."
                  value={searchEnrolled}
                  onChange={(e) => setSearchEnrolled(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-2">
                  <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                  <p className="text-xs text-slate-500">Loading enrolled students...</p>
                </div>
              ) : filteredEnrolled.length === 0 ? (
                <div className="text-center py-12 space-y-1 bg-slate-50 border border-slate-200 rounded-xl p-6">
                  <Users className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-sm font-bold text-slate-700">No Enrolled Students</p>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    {searchEnrolled
                      ? `No enrolled students match "${searchEnrolled}".`
                      : 'No students are currently enrolled in this course. Switch to the "Enroll New Students" tab to add students.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                        <th className="py-2.5 px-3">Student Name</th>
                        <th className="py-2.5 px-3">USN</th>
                        <th className="py-2.5 px-3">Department</th>
                        <th className="py-2.5 px-3">Face Profile</th>
                        <th className="py-2.5 px-3">Enrolled Date</th>
                        <th className="py-2.5 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredEnrolled.map((s) => (
                        <tr key={s.enrollment_id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-2.5 px-3">
                            <p className="font-bold text-slate-900">{s.full_name}</p>
                            <p className="text-[10px] text-slate-400">{s.email}</p>
                          </td>
                          <td className="py-2.5 px-3 font-mono font-medium text-slate-700">
                            {s.student_id_number}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">
                            {s.department || 'N/A'}
                          </td>
                          <td className="py-2.5 px-3">
                            {s.has_face_enrolled ? (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                                <ScanFace className="w-3 h-3" />
                                <span>Verified</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-bold">
                                <AlertCircle className="w-3 h-3" />
                                <span>No Face Data</span>
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 font-mono text-[10px]">
                            {new Date(s.enrolled_at).toLocaleDateString()}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              onClick={() => handleRemoveStudent(s.student_id, s.full_name)}
                              disabled={removingId === s.student_id}
                              className="px-2.5 py-1 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg border border-red-200 transition-colors text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50"
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
            <div className="space-y-4">
              {/* QUICK ENROLL BY USN */}
              <form onSubmit={handleQuickEnrollUsn} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <UserPlus className="w-3.5 h-3.5 text-blue-600" />
                  <span>Quick Enroll by Student USN / Roll Number</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. 4CB23AI073"
                    value={quickUsn}
                    onChange={(e) => setQuickUsn(e.target.value)}
                    className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 font-mono uppercase"
                  />
                  <button
                    type="submit"
                    disabled={isEnrolling || !quickUsn.trim()}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5 shrink-0 shadow-xs"
                  >
                    {isEnrolling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                    <span>Enroll</span>
                  </button>
                </div>
              </form>

              {/* SEARCH REGISTERED STUDENTS */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Institutional Registered Students
                  </h4>
                  <span className="text-[11px] text-slate-500">
                    {registeredStudents.length} total registered
                  </span>
                </div>

                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search registered students by Name, USN, or Department..."
                    value={searchAvailable}
                    onChange={(e) => setSearchAvailable(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>

                <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100 bg-white">
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
                          className="p-3 flex items-center justify-between hover:bg-slate-50/70 transition-colors"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-slate-900 text-xs">{s.full_name}</p>
                              <span className="font-mono text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                                {s.student_id_number}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {s.email} {s.department ? `• ${s.department}` : ''}
                            </p>
                          </div>

                          <div>
                            {isAlreadyEnrolled ? (
                              <span className="text-[10px] font-bold px-2 py-1 rounded bg-slate-100 text-slate-500 border border-slate-200">
                                Enrolled
                              </span>
                            ) : (
                              <button
                                onClick={() => handleEnrollByStudentId(s.student_id, s.full_name)}
                                disabled={isEnrolling}
                                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1 shadow-2xs"
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
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold transition-colors shadow-2xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
