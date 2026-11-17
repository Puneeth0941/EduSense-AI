import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { classroomApi, sessionApi, faceApi, attendanceApi, triggerFileDownload } from '../services/api';
import type { Classroom, ClassSession, EnrollmentStatusResponse, StudentAttendanceSummaryResponse, TeacherAttendanceSummaryResponse } from '../types';
import { Sidebar } from '../components/Sidebar';
import { TopHeader } from '../components/TopHeader';
import { QuickStats } from '../components/QuickStats';
import { JoinClassModal } from '../components/JoinClassModal';
import { FaceVerificationModal } from '../components/FaceVerificationModal';
import { TeacherAttendanceModal } from '../components/TeacherAttendanceModal';
import { AnalyticsDashboard } from '../components/AnalyticsDashboard';
import { StudentPersonalAnalytics } from '../components/StudentPersonalAnalytics';
import { TeacherAttendanceExportCard } from '../components/TeacherAttendanceExportCard';
import { CourseEnrollmentModal } from '../components/CourseEnrollmentModal';

import {
  Plus,
  Video,
  BookOpen,
  Calendar,
  AlertCircle,
  X,
  Play,
  Clock,
  Sparkles,
  FileText,
  ScanFace,
  ShieldCheck,
  ChevronRight,
  Users,
  FileSpreadsheet,
  GraduationCap,
  CheckCircle2,
  SquareX,
  Search,
  Settings as SettingsIcon,
  User,
  Camera,
  Activity,
  Layers,
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [activeSessions, setActiveSessions] = useState<ClassSession[]>([]);
  const [recentSessions, setRecentSessions] = useState<ClassSession[]>([]);
  const [upcomingSessions, setUpcomingSessions] = useState<ClassSession[]>([]);
  const [selectedAttendanceSessionId, setSelectedAttendanceSessionId] = useState<string | null>(null);
  const [faceStatus, setFaceStatus] = useState<EnrollmentStatusResponse | null>(null);
  const [studentAttendance, setStudentAttendance] = useState<StudentAttendanceSummaryResponse | null>(null);
  const [teacherAttendance, setTeacherAttendance] = useState<TeacherAttendanceSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search filter for classes tab
  const [classSearchQuery, setClassSearchQuery] = useState('');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [enrollmentClassroom, setEnrollmentClassroom] = useState<Classroom | null>(null);
  const [showStudentJoinModal, setShowStudentJoinModal] = useState(false);
  const [joinCourseCode, setJoinCourseCode] = useState('');
  const [isJoiningCourse, setIsJoiningCourse] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  // Create Classroom Form
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCourseCode, setNewCourseCode] = useState('');
  const [newDepartment, setNewDepartment] = useState('');
  const [newSemester, setNewSemester] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Start Session Form
  const [selectedClassroom, setSelectedClassroom] = useState<Classroom | null>(null);
  const [sessionTitle, setSessionTitle] = useState('');
  const [isLaunchingSession, setIsLaunchingSession] = useState(false);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);
      const classData = await classroomApi.listClassrooms();
      const uniqueClasses = Array.from(new Map(classData.map((c) => [c.id, c])).values());
      setClassrooms(uniqueClasses);

      // Check active sessions
      const activeList: ClassSession[] = [];
      const seenSessionIds = new Set<string>();
      for (const c of uniqueClasses) {
        const sess = await sessionApi.getActiveSessionForClassroom(c.id);
        if (sess && sess.status === 'ACTIVE' && !seenSessionIds.has(sess.id)) {
          seenSessionIds.add(sess.id);
          activeList.push(sess);
        }
      }
      setActiveSessions(activeList);

      // Fetch recent completed sessions
      try {
        const recentList = await sessionApi.getRecentSessions();
        setRecentSessions(recentList);
      } catch {
        setRecentSessions([]);
      }

      // Fetch upcoming scheduled sessions
      try {
        const upcomingList = await sessionApi.getUpcomingSessions();
        setUpcomingSessions(upcomingList);
      } catch {
        setUpcomingSessions([]);
      }

      // Fetch Face Enrollment & Attendance Summaries
      if (user?.role === 'STUDENT') {
        try {
          const statusRes = await faceApi.getEnrollmentStatus();
          setFaceStatus(statusRes);
          const attRes = await attendanceApi.getStudentSummary();
          setStudentAttendance(attRes);
        } catch {
          // Non-blocking
        }
      } else if (user?.role === 'TEACHER') {
        try {
          const tAttRes = await attendanceApi.getTeacherSummary();
          setTeacherAttendance(tAttRes);
        } catch {
          // Non-blocking
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const isTeacher = user?.role === 'TEACHER';

  // Create Classroom / Course submit
  const handleCreateClassroom = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsCreating(true);
      await classroomApi.createClassroom({
        title: newTitle,
        description: newDescription || undefined,
        course_code: newCourseCode,
        department: newDepartment || undefined,
        semester: newSemester || undefined,
      });
      setShowCreateModal(false);
      setNewTitle('');
      setNewDescription('');
      setNewCourseCode('');
      setNewDepartment('');
      setNewSemester('');
      setActionSuccessMsg('Course created successfully!');
      await fetchDashboardData();
      setTimeout(() => setActionSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to create course');
    } finally {
      setIsCreating(false);
    }
  };

  // Student join course using course code
  const handleJoinCourseByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCourseCode.trim()) return;

    try {
      setIsJoiningCourse(true);
      setError(null);
      const joined = await classroomApi.joinCourse(joinCourseCode.trim());
      setShowStudentJoinModal(false);
      setJoinCourseCode('');
      setActionSuccessMsg(`Successfully joined ${joined.title} (${joined.course_code})`);
      await fetchDashboardData();
      setTimeout(() => setActionSuccessMsg(null), 3500);
    } catch (err: any) {
      setError(err.message || 'Failed to join course. Please verify course code.');
    } finally {
      setIsJoiningCourse(false);
    }
  };

  // End active session with final attendance calculation
  const handleEndSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to end this class session? Attendance will be finalized and classified.')) return;

    try {
      setLoading(true);
      await sessionApi.endSession(sessionId);
      setActionSuccessMsg('Class session ended and attendance finalized.');
      await fetchDashboardData();
      setTimeout(() => setActionSuccessMsg(null), 3500);
    } catch (err: any) {
      setError(err.message || 'Failed to end session');
    } finally {
      setLoading(false);
    }
  };

  // Launch Session submit
  const handleLaunchSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClassroom) return;

    try {
      setIsLaunchingSession(true);
      const session = await sessionApi.createSession(selectedClassroom.id, {
        title: sessionTitle || `${selectedClassroom.title} Live Session`,
      });
      await sessionApi.startSession(session.id);
      navigate(`/classroom/${session.id}?classId=${selectedClassroom.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to start class session');
    } finally {
      setIsLaunchingSession(false);
      setSelectedClassroom(null);
    }
  };

  // Filtered classrooms for My Classes tab
  const filteredClassrooms = classrooms.filter((c) => {
    if (!classSearchQuery) return true;
    const q = classSearchQuery.toLowerCase();
    return (
      c.title.toLowerCase().includes(q) ||
      c.course_code.toLowerCase().includes(q) ||
      (c.department && c.department.toLowerCase().includes(q))
    );
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex">
      {/* 1. LEFT SIDEBAR */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* RIGHT MAIN AREA */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* 2. TOP HEADER */}
        <TopHeader pageTitle={activeTab} />

        {/* MAIN CONTAINER */}
        <main className="flex-1 p-6 md:p-8 space-y-6 max-w-7xl w-full mx-auto">
          {error && (
            <div className="flex items-center justify-between p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs shadow-xs">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                <span className="font-medium">{error}</span>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-xs font-semibold text-red-600 hover:text-red-800 underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {actionSuccessMsg && (
            <div className="flex items-center gap-2 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold shadow-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{actionSuccessMsg}</span>
            </div>
          )}

          {/* TAB 1: ANALYTICS */}
          {activeTab === 'analytics' ? (
            isTeacher ? (
              <AnalyticsDashboard
                sessions={[...activeSessions, ...recentSessions]}
                isTeacher={isTeacher}
              />
            ) : (
              <StudentPersonalAnalytics
                sessions={[...activeSessions, ...recentSessions]}
                studentAttendance={studentAttendance}
              />
            )
          ) : /* TAB 2: REPORTS */
          activeTab === 'reports' ? (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-2">
                <div className="flex items-center gap-2">
                  <span className="bg-blue-50 text-blue-700 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-blue-100 uppercase">
                    Reporting & Data Hub
                  </span>
                </div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">Academic Attendance & Analytics Reports</h2>
                <p className="text-xs text-slate-500 leading-relaxed max-w-3xl">
                  Download institutional attendance records formatted according to official university guidelines or review aggregated engagement reports across all sessions.
                </p>
              </div>

              {isTeacher ? (
                <>
                  <TeacherAttendanceExportCard
                    classrooms={classrooms}
                    sessions={[...activeSessions, ...recentSessions, ...upcomingSessions]}
                    teacherAttendance={teacherAttendance}
                    onOpenSessionAttendance={(sessId) => setSelectedAttendanceSessionId(sessId)}
                  />
                  <div className="pt-4">
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">
                      Session Engagement Analytics
                    </h3>
                    <AnalyticsDashboard
                      sessions={[...activeSessions, ...recentSessions]}
                      isTeacher={isTeacher}
                    />
                  </div>
                </>
              ) : (
                <StudentPersonalAnalytics
                  sessions={[...activeSessions, ...recentSessions]}
                  studentAttendance={studentAttendance}
                />
              )}
            </div>
          ) : /* TAB 3: ATTENDANCE */
          activeTab === 'attendance' ? (
            isTeacher ? (
              <div className="space-y-6">
                <TeacherAttendanceExportCard
                  classrooms={classrooms}
                  sessions={[...activeSessions, ...recentSessions, ...upcomingSessions]}
                  teacherAttendance={teacherAttendance}
                  onOpenSessionAttendance={(sessId) => setSelectedAttendanceSessionId(sessId)}
                />
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-4 shadow-xs">
                <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center mx-auto">
                  <Users className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Student Attendance Records</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Your attendance is verified continuously and automatically via ArcFace facial recognition during active class sessions.
                </p>
                {studentAttendance && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-xl mx-auto pt-4">
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                      <p className="text-[10px] text-slate-500 font-bold uppercase">Sessions</p>
                      <p className="text-xl font-extrabold text-slate-900">{studentAttendance.total_sessions}</p>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                      <p className="text-[10px] text-slate-500 font-bold uppercase">Present</p>
                      <p className="text-xl font-extrabold text-emerald-600">{studentAttendance.present_count}</p>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                      <p className="text-[10px] text-slate-500 font-bold uppercase">Late</p>
                      <p className="text-xl font-extrabold text-amber-600">{studentAttendance.late_count}</p>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                      <p className="text-[10px] text-slate-500 font-bold uppercase">Rate</p>
                      <p className="text-xl font-extrabold text-blue-600">{studentAttendance.attendance_percentage}%</p>
                    </div>
                  </div>
                )}
              </div>
            )
          ) : /* TAB 4: MY CLASSES (DEDICATED FULL VIEW) */
          activeTab === 'classes' ? (
            <div className="space-y-6">
              {/* Header & Controls */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight">My Classes & Courses</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    {isTeacher
                      ? 'Create and manage your course offerings, enroll student cohorts, and launch live video classrooms.'
                      : 'Browse enrolled courses, join new subjects using course codes, and enter ongoing live sessions.'}
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {isTeacher ? (
                    <button
                      onClick={() => setShowCreateModal(true)}
                      className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg transition-colors shadow-xs"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Create Classroom</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowStudentJoinModal(true)}
                      className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg transition-colors shadow-xs"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Join with Course Code</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Search Bar */}
              <div className="relative max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  placeholder="Filter courses by title, code or department..."
                  value={classSearchQuery}
                  onChange={(e) => setClassSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Classrooms Grid */}
              {loading ? (
                <div className="py-12 text-center text-slate-400 text-xs animate-pulse">
                  Loading courses...
                </div>
              ) : filteredClassrooms.length === 0 ? (
                <div className="p-8 text-center bg-white border border-slate-200 rounded-xl space-y-2 shadow-xs">
                  <BookOpen className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-sm font-semibold text-slate-700">No classrooms found</p>
                  <p className="text-xs text-slate-500">
                    {isTeacher
                      ? 'Create your first course offering to start holding sessions.'
                      : 'Join a course with a course code provided by your instructor.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {filteredClassrooms.map((c) => (
                    <div
                      key={c.id}
                      className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4 hover:border-slate-300 hover:shadow-xs transition-all"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                              {c.course_code}
                            </span>
                            {c.department && (
                              <span className="text-[10px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                {c.department}
                              </span>
                            )}
                            {c.semester && (
                              <span className="text-[10px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                Sem {c.semester}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            {new Date(c.created_at).toLocaleDateString()}
                          </span>
                        </div>

                        <h4 className="text-base font-bold text-slate-900 leading-snug">{c.title}</h4>
                        {c.description && (
                          <p className="text-xs text-slate-500 line-clamp-2">{c.description}</p>
                        )}

                        <div className="flex items-center justify-between pt-1">
                          {c.teacher_name && (
                            <p className="text-xs text-slate-500 font-medium">Instructor: {c.teacher_name}</p>
                          )}
                          <span className="flex items-center gap-1 text-[11px] text-blue-700 font-medium bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                            <Users className="w-3.5 h-3.5 text-blue-600" />
                            <span>{c.enrolled_student_count ?? 0} Enrolled</span>
                          </span>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                        {isTeacher ? (
                          <>
                            <button
                              onClick={() => setEnrollmentClassroom(c)}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium rounded-lg text-xs transition-colors border border-slate-200"
                              title="Manage Enrolled Students"
                            >
                              <Users className="w-3.5 h-3.5 text-blue-600" />
                              <span>Students ({c.enrolled_student_count ?? 0})</span>
                            </button>

                            <button
                              onClick={() => {
                                setSelectedClassroom(c);
                                setSessionTitle(`${c.title} Live Class`);
                              }}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-xs transition-colors shadow-xs"
                            >
                              <Video className="w-3.5 h-3.5" />
                              <span>Launch</span>
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => {
                              const activeSess = activeSessions.find((s) => s.classroom_id === c.id);
                              if (activeSess) {
                                navigate(`/classroom/${activeSess.id}?classId=${c.id}`);
                              } else {
                                alert('No active live session is currently running for this classroom.');
                              }
                            }}
                            className="w-full flex items-center justify-center gap-2 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg text-xs transition-colors shadow-xs"
                          >
                            <Play className="w-4 h-4" />
                            <span>Enter Classroom</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : /* TAB 5: SCHEDULE (DEDICATED FULL VIEW) */
          activeTab === 'schedule' ? (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight">Class Timetable & Schedule</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Keep track of scheduled lectures, upcoming timetable slots, and ended session history with attendance logs.
                  </p>
                </div>

                {isTeacher && classrooms.length > 0 && (
                  <button
                    onClick={() => {
                      setSelectedClassroom(classrooms[0]);
                      setSessionTitle(`${classrooms[0].title} Live Session`);
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg transition-colors shadow-xs shrink-0"
                  >
                    <Video className="w-4 h-4" />
                    <span>Launch Immediate Session</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Upcoming Schedule */}
                <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-xs">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                      <Clock className="w-4 h-4 text-blue-600" />
                      <span>Upcoming Scheduled Sessions ({upcomingSessions.length})</span>
                    </h3>
                  </div>

                  {upcomingSessions.length === 0 ? (
                    <div className="p-8 text-center border border-dashed border-slate-200 rounded-xl space-y-1">
                      <p className="text-xs text-slate-600 font-medium">No sessions currently scheduled</p>
                      <p className="text-[11px] text-slate-400">Scheduled sessions from instructors will appear here.</p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                      {upcomingSessions.map((sess) => (
                        <div
                          key={sess.id}
                          className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between hover:border-slate-300 transition-colors"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                SCHEDULED
                              </span>
                              {sess.course_code && (
                                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
                                  {sess.course_code}
                                </span>
                              )}
                            </div>
                            <h4 className="text-sm font-bold text-slate-900 leading-tight">{sess.title}</h4>
                            <p className="text-[11px] text-slate-500">
                              {sess.scheduled_start_time
                                ? new Date(sess.scheduled_start_time).toLocaleString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : 'Date TBA'}
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            {isTeacher && (
                              <button
                                onClick={async () => {
                                  try {
                                    await sessionApi.startSession(sess.id);
                                    navigate(`/classroom/${sess.id}?classId=${sess.classroom_id}`);
                                  } catch (err: any) {
                                    setError(err.message || 'Failed to start scheduled session');
                                  }
                                }}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors shadow-xs"
                              >
                                <Play className="w-3.5 h-3.5" />
                                <span>Start Now</span>
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* Completed Sessions */}
                <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-xs">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-600" />
                      <span>Completed Sessions Log ({recentSessions.length})</span>
                    </h3>
                  </div>

                  {recentSessions.length === 0 ? (
                    <div className="p-8 text-center border border-dashed border-slate-200 rounded-xl space-y-1">
                      <p className="text-xs text-slate-600 font-medium">No completed class sessions recorded</p>
                      <p className="text-[11px] text-slate-400">
                        Past class sessions will archive here with attendance records.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                      {recentSessions.map((sess) => (
                        <div
                          key={sess.id}
                          className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between hover:border-slate-300 transition-colors"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                ✓ COMPLETED
                              </span>
                              {sess.course_code && (
                                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
                                  {sess.course_code}
                                </span>
                              )}
                            </div>
                            <h4 className="text-sm font-bold text-slate-900 leading-tight">{sess.title}</h4>
                            <p className="text-[11px] text-slate-500">
                              {sess.actual_end_time
                                ? new Date(sess.actual_end_time).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                                : new Date(sess.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            {isTeacher && (
                              <>
                                <button
                                  onClick={() => setSelectedAttendanceSessionId(sess.id)}
                                  className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                                  title="View attendance roster"
                                >
                                  <Users className="w-3.5 h-3.5" />
                                  <span>Roster</span>
                                </button>
                                <button
                                  onClick={async () => {
                                    try {
                                      const { blob, filename } = await attendanceApi.exportAttendanceExcel({ sessionId: sess.id });
                                      triggerFileDownload(blob, filename);
                                    } catch (err: any) {
                                      alert(`Export failed: ${err.message || 'Error'}`);
                                    }
                                  }}
                                  className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                                  title="Export to Excel"
                                >
                                  <FileSpreadsheet className="w-3.5 h-3.5" />
                                  <span>Export</span>
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </div>
          ) : /* TAB 6: SETTINGS (DEDICATED FULL VIEW) */
          activeTab === 'settings' ? (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">Account & Platform Settings</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Manage your authenticated profile details, facial recognition hardware access, and platform connection status.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Profile Card */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
                  <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                    <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                      <User className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">{user?.full_name}</h3>
                      <p className="text-xs text-slate-500">{user?.email}</p>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1.5 border-b border-slate-100">
                      <span className="text-slate-500">Account Role</span>
                      <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 uppercase text-[10px]">
                        {user?.role}
                      </span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-100">
                      <span className="text-slate-500">User ID</span>
                      <span className="font-mono text-slate-700 text-[11px] truncate max-w-[200px]">{user?.id}</span>
                    </div>
                    {user?.student_profile && (
                      <div className="flex justify-between py-1.5 border-b border-slate-100">
                        <span className="text-slate-500">USN / Student ID</span>
                        <span className="font-bold text-slate-800">{user.student_profile.student_id_number}</span>
                      </div>
                    )}
                    {user?.teacher_profile && (
                      <div className="flex justify-between py-1.5 border-b border-slate-100">
                        <span className="text-slate-500">Employee ID</span>
                        <span className="font-bold text-slate-800">{user.teacher_profile.employee_id}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Biometrics & Hardware Card */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
                  <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                      <ScanFace className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Biometric & WebRTC Security</h3>
                      <p className="text-xs text-slate-500">Face Recognition & Camera Pipeline</p>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                      <span className="text-slate-500">ArcFace 512D Profile</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        faceStatus?.is_enrolled
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {faceStatus?.is_enrolled ? 'ACTIVE & ENROLLED' : 'NOT REGISTERED'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                      <span className="text-slate-500">LiveKit Cloud Transport</span>
                      <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[10px] font-bold">
                        CONNECTED
                      </span>
                    </div>

                    <div className="pt-2">
                      <button
                        onClick={() => navigate('/face-enrollment')}
                        className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs"
                      >
                        {faceStatus?.is_enrolled ? 'Update Face Enrollment' : 'Enroll Biometric Face'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* TAB: DASHBOARD (DEFAULT OVERVIEW) */
            <>
              {/* 3. WELCOME BANNER & PRIMARY ACTIONS */}
              <div className="bg-gradient-to-r from-blue-50 via-indigo-50/40 to-white border border-blue-100 rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-xs relative overflow-hidden">
                <div className="space-y-2 max-w-2xl z-10">
                  <div className="flex items-center gap-2">
                    <span className="bg-white text-blue-700 text-xs font-semibold px-3 py-1 rounded-full border border-blue-200 flex items-center gap-1.5 shadow-2xs">
                      <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                      <span>EduSense AI Platform</span>
                    </span>
                  </div>
                  <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
                    {getGreeting()}, {user?.full_name || 'User'}!
                  </h2>
                  <p className="text-xs md:text-sm text-slate-600 leading-relaxed">
                    {isTeacher
                      ? 'Manage your classrooms, schedule sessions, and conduct interactive real-time classes with automated biometric attendance.'
                      : 'Access your subjects, join ongoing live class sessions, and track your attendance and engagement.'}
                  </p>
                  {isTeacher && teacherAttendance && (
                    <div className="flex items-center gap-3 pt-1 text-xs text-slate-600 font-medium">
                      <span>Classrooms: <strong className="text-slate-900">{teacherAttendance.total_classrooms}</strong></span>
                      <span>•</span>
                      <span>Sessions: <strong className="text-slate-900">{teacherAttendance.total_sessions_conducted}</strong></span>
                      <span>•</span>
                      <span>Attendance Rate: <strong className="text-emerald-600">{teacherAttendance.overall_attendance_rate}%</strong></span>
                    </div>
                  )}
                </div>

                {/* 4. PRIMARY ACTIONS BAR */}
                <div className="flex flex-wrap items-center gap-2.5 z-10 shrink-0">
                  {isTeacher ? (
                    <>
                      <button
                        onClick={() => setShowCreateModal(true)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg transition-colors shadow-xs"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Create Classroom</span>
                      </button>

                      <button
                        onClick={() => {
                          if (classrooms.length > 0) {
                            setSelectedClassroom(classrooms[0]);
                            setSessionTitle(`${classrooms[0].title} Live Class`);
                          } else {
                            setShowCreateModal(true);
                          }
                        }}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-xs rounded-lg transition-colors border border-slate-200 shadow-xs"
                      >
                        <Video className="w-4 h-4 text-emerald-600" />
                        <span>Start Class</span>
                      </button>

                      <button
                        onClick={() => setActiveTab('schedule')}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-lg transition-colors border border-slate-200 shadow-xs"
                      >
                        <Calendar className="w-4 h-4 text-blue-600" />
                        <span>Schedule</span>
                      </button>

                      <button
                        onClick={() => setActiveTab('attendance')}
                        className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold text-xs rounded-lg transition-colors border border-emerald-200 shadow-xs"
                      >
                        <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                        <span>Export Attendance</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setShowStudentJoinModal(true)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg transition-colors shadow-xs"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Join Course with Code</span>
                      </button>

                      <button
                        onClick={() => setShowJoinModal(true)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg transition-colors shadow-xs"
                      >
                        <Play className="w-4 h-4" />
                        <span>Join Session</span>
                      </button>

                      <button
                        onClick={() => setActiveTab('classes')}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-lg transition-colors border border-slate-200 shadow-xs"
                      >
                        <BookOpen className="w-4 h-4 text-blue-600" />
                        <span>My Classes</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* STUDENT FACE ENROLLMENT CARD */}
              {!isTeacher && (
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center border shrink-0 ${
                      faceStatus?.is_enrolled
                        ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                        : 'bg-amber-50 text-amber-600 border-amber-200 animate-pulse'
                    }`}>
                      {faceStatus?.is_enrolled ? <ShieldCheck className="w-6 h-6" /> : <ScanFace className="w-6 h-6" />}
                    </div>

                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                          faceStatus?.is_enrolled
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          {faceStatus?.is_enrolled ? 'ENROLLED' : 'NOT ENROLLED'}
                        </span>
                        {faceStatus?.enrolled_at && (
                          <span className="text-[11px] text-slate-500">
                            Active since: {new Date(faceStatus.enrolled_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>

                      <h3 className="text-sm font-bold text-slate-900">Biometric Face Recognition</h3>
                      <p className="text-xs text-slate-500">
                        {faceStatus?.is_enrolled
                          ? 'Your ArcFace 512D facial profile is active for automatic classroom attendance.'
                          : 'Enroll 5 quality facial samples for automatic attendance in live class sessions.'}
                      </p>
                      {studentAttendance && studentAttendance.total_sessions > 0 && (
                        <div className="pt-1 flex items-center gap-4 text-xs font-medium text-slate-600">
                          <span>Attendance: <strong className="text-emerald-600">{studentAttendance.attendance_percentage}%</strong></span>
                          <span>Present: <strong className="text-emerald-600">{studentAttendance.present_count}</strong></span>
                          <span>Late: <strong className="text-amber-600">{studentAttendance.late_count}</strong></span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    {faceStatus?.is_enrolled && (
                      <button
                        onClick={() => setShowVerificationModal(true)}
                        className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg flex items-center gap-1.5 transition-colors shadow-xs"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        <span>Verify My Face</span>
                      </button>
                    )}
                    <button
                      onClick={() => navigate('/face-enrollment')}
                      className={`px-3.5 py-2 rounded-lg font-semibold text-xs flex items-center gap-1.5 transition-colors ${
                        faceStatus?.is_enrolled
                          ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                          : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
                      }`}
                    >
                      <span>{faceStatus?.is_enrolled ? 'Update Enrollment' : 'Enroll Your Face'}</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* 8. QUICK STATS SECTION */}
              <section className="space-y-3">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Quick Overview
                </h3>
                <QuickStats
                  classrooms={classrooms}
                  activeSessions={activeSessions}
                  isTeacher={isTeacher}
                  studentAttendance={studentAttendance}
                  teacherAttendance={teacherAttendance}
                />
              </section>

              {/* 5. LIVE NOW SECTION */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>Live Now ({activeSessions.length})</span>
                  </h3>
                </div>

                {activeSessions.length === 0 ? (
                  <div className="p-8 text-center bg-white border border-slate-200 rounded-xl space-y-1 shadow-xs">
                    <Video className="w-8 h-8 text-slate-400 mx-auto" />
                    <p className="text-sm font-semibold text-slate-700">No live classes right now</p>
                    <p className="text-xs text-slate-500">
                      {isTeacher
                        ? 'Launch a class session to begin interactive streaming.'
                        : 'Check back when your instructor starts a class session.'}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {activeSessions.map((sess) => (
                      <div
                        key={sess.id}
                        className="p-5 bg-white border border-emerald-200 rounded-xl flex items-center justify-between shadow-xs hover:shadow-sm transition-all"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                              <span>LIVE NOW</span>
                            </span>
                            {sess.course_code && (
                              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
                                {sess.course_code}
                              </span>
                            )}
                          </div>
                          <h4 className="text-base font-bold text-slate-900 leading-snug">{sess.title}</h4>
                          <p className="text-xs text-slate-500">Classroom ID: {sess.classroom_id}</p>
                        </div>

                        <div className="flex items-center gap-2">
                          {isTeacher && (
                            <>
                              <button
                                onClick={() => setSelectedAttendanceSessionId(sess.id)}
                                className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-medium text-xs rounded-lg flex items-center gap-1 transition-colors"
                                title="Monitor Live Attendance"
                              >
                                <Users className="w-3.5 h-3.5" />
                                <span>Attendance</span>
                              </button>

                              <button
                                onClick={() => handleEndSession(sess.id)}
                                className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-medium text-xs rounded-lg flex items-center gap-1 transition-colors"
                                title="End Class Session & Finalize Attendance"
                              >
                                <SquareX className="w-3.5 h-3.5 text-rose-600" />
                                <span>End</span>
                              </button>
                            </>
                          )}

                          <button
                            onClick={() => navigate(`/classroom/${sess.id}?classId=${sess.classroom_id}`)}
                            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg flex items-center gap-1.5 shadow-xs transition-colors"
                          >
                            <Play className="w-3.5 h-3.5" />
                            <span>Join Classroom</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* 7. MY CLASSES SECTION */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    My Classrooms ({classrooms.length})
                  </h3>
                  <button
                    onClick={() => setActiveTab('classes')}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  >
                    <span>View All</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {loading ? (
                  <div className="py-8 text-center text-slate-400 text-xs animate-pulse">
                    Loading classrooms...
                  </div>
                ) : classrooms.length === 0 ? (
                  <div className="p-8 text-center bg-white border border-slate-200 rounded-xl space-y-1 shadow-xs">
                    <BookOpen className="w-8 h-8 text-slate-400 mx-auto" />
                    <p className="text-sm font-semibold text-slate-700">No classrooms available</p>
                    <p className="text-xs text-slate-500">
                      {isTeacher
                        ? 'Click "+ Create Classroom" to create your first course offering.'
                        : 'No active classrooms listed on the platform.'}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {classrooms.slice(0, 6).map((c) => (
                      <div
                        key={c.id}
                        className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4 hover:border-slate-300 hover:shadow-xs transition-all"
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded border border-blue-100">
                                {c.course_code}
                              </span>
                              {c.department && (
                                <span className="text-[10px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                  {c.department}
                                </span>
                              )}
                              {c.semester && (
                                <span className="text-[10px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                  Sem {c.semester}
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-slate-500 flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              {new Date(c.created_at).toLocaleDateString()}
                            </span>
                          </div>

                          <h4 className="text-base font-bold text-slate-900 leading-snug">{c.title}</h4>
                          {c.description && (
                            <p className="text-xs text-slate-500 line-clamp-2">{c.description}</p>
                          )}

                          <div className="flex items-center justify-between pt-1">
                            {c.teacher_name && (
                              <p className="text-xs text-slate-500">Instructor: {c.teacher_name}</p>
                            )}
                            <span className="flex items-center gap-1 text-[11px] text-blue-700 font-medium bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                              <Users className="w-3.5 h-3.5 text-blue-600" />
                              <span>{c.enrolled_student_count ?? 0} Enrolled</span>
                            </span>
                          </div>
                        </div>

                        <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                          {isTeacher ? (
                            <>
                              <button
                                onClick={() => setEnrollmentClassroom(c)}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium rounded-lg text-xs transition-colors border border-slate-200"
                                title="Manage Enrolled Students"
                              >
                                <Users className="w-3.5 h-3.5 text-blue-600" />
                                <span>Students ({c.enrolled_student_count ?? 0})</span>
                              </button>

                              <button
                                onClick={() => {
                                  setSelectedClassroom(c);
                                  setSessionTitle(`${c.title} Live Class`);
                                }}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-xs transition-colors shadow-xs"
                              >
                                <Video className="w-3.5 h-3.5" />
                                <span>Launch</span>
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => {
                                const activeSess = activeSessions.find((s) => s.classroom_id === c.id);
                                if (activeSess) {
                                  navigate(`/classroom/${activeSess.id}?classId=${c.id}`);
                                } else {
                                  alert('No active live session is currently running for this classroom.');
                                }
                              }}
                              className="w-full flex items-center justify-center gap-2 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg text-xs transition-colors shadow-xs"
                            >
                              <Play className="w-4 h-4" />
                              <span>Enter Classroom</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* 6 & 9. UPCOMING SCHEDULE & COMPLETED SESSIONS */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Upcoming Schedule */}
                <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-xs">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-600" />
                    <span>Upcoming Schedule ({upcomingSessions.length})</span>
                  </h3>

                  {upcomingSessions.length === 0 ? (
                    <div className="p-6 text-center border border-dashed border-slate-200 rounded-xl space-y-1">
                      <p className="text-xs text-slate-600 font-medium">No sessions currently scheduled</p>
                      <p className="text-[11px] text-slate-400">Scheduled class sessions will appear here.</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                      {upcomingSessions.map((sess) => (
                        <div
                          key={sess.id}
                          className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between hover:border-slate-300 transition-colors"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                SCHEDULED
                              </span>
                              {sess.course_code && (
                                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
                                  {sess.course_code}
                                </span>
                              )}
                            </div>
                            <h4 className="text-sm font-bold text-slate-900 leading-tight">{sess.title}</h4>
                            <p className="text-[11px] text-slate-500">
                              {sess.scheduled_start_time
                                ? new Date(sess.scheduled_start_time).toLocaleString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : 'Date TBA'}
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            {isTeacher && (
                              <button
                                onClick={async () => {
                                  try {
                                    await sessionApi.startSession(sess.id);
                                    navigate(`/classroom/${sess.id}?classId=${sess.classroom_id}`);
                                  } catch (err: any) {
                                    setError(err.message || 'Failed to start scheduled session');
                                  }
                                }}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors shadow-xs"
                              >
                                <Play className="w-3.5 h-3.5" />
                                <span>Start Now</span>
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* Completed Class Sessions */}
                <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-xs">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    <span>Completed Class Sessions ({recentSessions.length})</span>
                  </h3>

                  {recentSessions.length === 0 ? (
                    <div className="p-6 text-center border border-dashed border-slate-200 rounded-xl space-y-1">
                      <p className="text-xs text-slate-600 font-medium">No completed class sessions recorded</p>
                      <p className="text-[11px] text-slate-400">
                        Ended class sessions will populate here with session attendance logs.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                      {recentSessions.map((sess) => (
                        <div
                          key={sess.id}
                          className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between hover:border-slate-300 transition-colors"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                ✓ COMPLETED
                              </span>
                              {sess.course_code && (
                                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
                                  {sess.course_code}
                                </span>
                              )}
                            </div>
                            <h4 className="text-sm font-bold text-slate-900 leading-tight">{sess.title}</h4>
                            <p className="text-[11px] text-slate-500">
                              {sess.actual_end_time
                                ? new Date(sess.actual_end_time).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
                                : new Date(sess.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            {isTeacher && (
                              <button
                                onClick={() => setSelectedAttendanceSessionId(sess.id)}
                                className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                              >
                                <Users className="w-3.5 h-3.5" />
                                <span>Attendance</span>
                              </button>
                            )}
                            <button
                              onClick={() => alert(`Session Details:\nTitle: ${sess.title}\nCourse: ${sess.course_code || 'N/A'}\nStatus: ${sess.status}\nEnded At: ${sess.actual_end_time || sess.created_at}`)}
                              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
                            >
                              Details
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </>
          )}
        </main>
      </div>

      {/* MODAL: CREATE CLASSROOM */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Create New Classroom</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateClassroom} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Classroom Title
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-xs focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="Advanced Computer Vision"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Course Code / Subject
                </label>
                <input
                  type="text"
                  required
                  value={newCourseCode}
                  onChange={(e) => setNewCourseCode(e.target.value.toUpperCase())}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-xs uppercase tracking-wider focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="CS-502"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Department
                  </label>
                  <input
                    type="text"
                    value={newDepartment}
                    onChange={(e) => setNewDepartment(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-xs focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="Computer Science"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Semester
                  </label>
                  <input
                    type="text"
                    value={newSemester}
                    onChange={(e) => setNewSemester(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-xs focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="6"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-xs focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none"
                  placeholder="Deep learning architectures for image recognition and object tracking."
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg transition-colors shadow-xs"
                >
                  {isCreating ? 'Creating...' : 'Create Classroom'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: START SESSION */}
      {selectedClassroom && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Start Live Class Session</h3>
              <button
                onClick={() => setSelectedClassroom(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleLaunchSession} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Classroom
                </label>
                <input
                  type="text"
                  disabled
                  value={`${selectedClassroom.course_code} - ${selectedClassroom.title}`}
                  className="w-full px-3.5 py-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-700 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Session Topic / Title
                </label>
                <input
                  type="text"
                  required
                  value={sessionTitle}
                  onChange={(e) => setSessionTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-xs focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="Lecture 1: Introduction & Neural Networks"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedClassroom(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLaunchingSession}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg flex items-center gap-2 transition-colors shadow-xs"
                >
                  <Video className="w-4 h-4" />
                  <span>{isLaunchingSession ? 'Launching...' : 'Launch Live Class'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: JOIN CLASS */}
      {showJoinModal && (
        <JoinClassModal
          classrooms={classrooms}
          onClose={() => setShowJoinModal(false)}
        />
      )}

      {/* MODAL: FACE VERIFICATION */}
      <FaceVerificationModal
        isOpen={showVerificationModal}
        onClose={() => setShowVerificationModal(false)}
      />

      {/* MODAL: TEACHER ATTENDANCE ROSTER */}
      {selectedAttendanceSessionId && (
        <TeacherAttendanceModal
          isOpen={!!selectedAttendanceSessionId}
          onClose={() => setSelectedAttendanceSessionId(null)}
          sessionId={selectedAttendanceSessionId}
        />
      )}

      {/* MODAL: COURSE ENROLLMENT (TEACHER) */}
      {enrollmentClassroom && (
        <CourseEnrollmentModal
          isOpen={!!enrollmentClassroom}
          onClose={() => {
            setEnrollmentClassroom(null);
            fetchDashboardData();
          }}
          classroom={enrollmentClassroom}
        />
      )}

      {/* MODAL: JOIN COURSE WITH CODE (STUDENT) */}
      {showStudentJoinModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-blue-600" />
                <span>Join Course with Code</span>
              </h3>
              <button
                onClick={() => setShowStudentJoinModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleJoinCourseByCode} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Course Code
                </label>
                <input
                  type="text"
                  required
                  value={joinCourseCode}
                  onChange={(e) => setJoinCourseCode(e.target.value.toUpperCase())}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-xs uppercase tracking-wider focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="e.g. CS-502"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Enter the course code provided by your instructor to enroll in the course cohort.
                </p>
              </div>

              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowStudentJoinModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isJoiningCourse}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg flex items-center gap-2 transition-colors shadow-xs"
                >
                  {isJoiningCourse ? 'Joining...' : 'Join Course'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
