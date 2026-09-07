import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { classroomApi, sessionApi } from '../services/api';
import type { Classroom, ClassSession } from '../types';
import { Sidebar } from '../components/Sidebar';
import { TopHeader } from '../components/TopHeader';
import { QuickStats } from '../components/QuickStats';
import { JoinClassModal } from '../components/JoinClassModal';
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
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [activeSessions, setActiveSessions] = useState<ClassSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);

  // Create Classroom Form
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCourseCode, setNewCourseCode] = useState('');
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
      setClassrooms(classData);

      // Check active sessions if any exist
      const activeList: ClassSession[] = [];
      for (const c of classData) {
        const sess = await sessionApi.getActiveSessionForClassroom(c.id);
        if (sess && sess.status === 'ACTIVE') {
          activeList.push(sess);
        }
      }
      setActiveSessions(activeList);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Time of day greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const isTeacher = user?.role === 'TEACHER';

  // Create Classroom submit
  const handleCreateClassroom = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsCreating(true);
      await classroomApi.createClassroom({
        title: newTitle,
        description: newDescription || undefined,
        course_code: newCourseCode,
      });
      setShowCreateModal(false);
      setNewTitle('');
      setNewDescription('');
      setNewCourseCode('');
      await fetchDashboardData();
    } catch (err: any) {
      setError(err.message || 'Failed to create classroom');
    } finally {
      setIsCreating(false);
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex">
      {/* 1. LEFT SIDEBAR */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* RIGHT MAIN AREA */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* 2. TOP HEADER */}
        <TopHeader pageTitle={activeTab} />

        {/* MAIN DASHBOARD CONTAINER */}
        <main className="flex-1 p-6 md:p-8 space-y-8 max-w-7xl w-full mx-auto">
          {error && (
            <div className="flex items-center gap-2 p-4 bg-red-950/50 border border-red-800/50 rounded-xl text-red-300 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 3. WELCOME BANNER & PRIMARY ACTIONS */}
          <div className="bg-gradient-to-r from-indigo-900/40 via-slate-900 to-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-xl relative overflow-hidden">
            <div className="space-y-2 max-w-2xl z-10">
              <div className="flex items-center gap-2">
                <span className="bg-indigo-950 text-indigo-300 text-xs font-semibold px-3 py-1 rounded-full border border-indigo-800/50 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span>EduSense AI Platform</span>
                </span>
              </div>
              <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                {getGreeting()}, {user?.full_name || 'User'}!
              </h2>
              <p className="text-sm text-slate-400 leading-relaxed">
                {isTeacher
                  ? 'Manage your classrooms, schedule sessions, and conduct interactive real-time classes with LiveKit Cloud transport.'
                  : 'Access your subjects, join ongoing live class sessions, and manage your learning schedule.'}
              </p>
            </div>

            {/* 4. PRIMARY ACTIONS BAR */}
            <div className="flex flex-wrap items-center gap-3 z-10 shrink-0">
              {isTeacher ? (
                <>
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold text-xs rounded-xl transition-all shadow-lg shadow-indigo-600/20"
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
                    className="flex items-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded-xl transition-all border border-slate-700"
                  >
                    <Video className="w-4 h-4 text-emerald-400" />
                    <span>Start Class</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('schedule')}
                    className="flex items-center gap-2 px-4 py-3 bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold text-xs rounded-xl transition-all border border-slate-800"
                  >
                    <Calendar className="w-4 h-4 text-indigo-400" />
                    <span>Schedule</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setShowJoinModal(true)}
                    className="flex items-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold text-xs rounded-xl transition-all shadow-lg shadow-emerald-600/20"
                  >
                    <Play className="w-4 h-4" />
                    <span>Join Class</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('classes')}
                    className="flex items-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded-xl transition-all border border-slate-700"
                  >
                    <BookOpen className="w-4 h-4 text-indigo-400" />
                    <span>My Classes</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* 8. QUICK STATS SECTION */}
          <section className="space-y-4">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
              Quick Overview
            </h3>
            <QuickStats
              classrooms={classrooms}
              activeSessions={activeSessions}
              isTeacher={isTeacher}
            />
          </section>

          {/* 5. LIVE NOW SECTION */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Live Now</span>
              </h3>
            </div>

            {activeSessions.length === 0 ? (
              <div className="p-8 text-center bg-slate-900/40 border border-slate-800/80 rounded-2xl space-y-2">
                <Video className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-sm font-medium text-slate-300">No live classes right now</p>
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
                    className="p-5 bg-slate-900 border border-emerald-500/30 rounded-2xl flex items-center justify-between shadow-lg"
                  >
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/50">
                        LIVE NOW
                      </span>
                      <h4 className="text-base font-bold text-white leading-snug">{sess.title}</h4>
                      <p className="text-xs text-slate-400">Classroom ID: {sess.classroom_id}</p>
                    </div>

                    <button
                      onClick={() => navigate(`/classroom/${sess.id}?classId=${sess.classroom_id}`)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-xl flex items-center gap-1.5 shadow"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Join Classroom</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 7. MY CLASSES SECTION */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
                My Classrooms ({classrooms.length})
              </h3>
            </div>

            {loading ? (
              <div className="py-12 text-center text-slate-500 text-xs animate-pulse">
                Loading classrooms...
              </div>
            ) : classrooms.length === 0 ? (
              <div className="p-8 text-center bg-slate-900/40 border border-slate-800/80 rounded-2xl space-y-2">
                <BookOpen className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-sm font-medium text-slate-300">No classrooms available</p>
                <p className="text-xs text-slate-500">
                  {isTeacher
                    ? 'Click "+ Create Classroom" to create your first course offering.'
                    : 'No active classrooms listed on the platform.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {classrooms.map((c) => (
                  <div
                    key={c.id}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between space-y-4 hover:border-slate-700 transition-all shadow-lg"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 bg-indigo-950/60 px-2.5 py-1 rounded-md border border-indigo-800/40">
                          {c.course_code}
                        </span>
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(c.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <h4 className="text-base font-bold text-white leading-snug">{c.title}</h4>
                      {c.description && (
                        <p className="text-xs text-slate-400 line-clamp-2">{c.description}</p>
                      )}
                      {c.teacher_name && (
                        <p className="text-xs text-slate-500">Instructor: {c.teacher_name}</p>
                      )}
                    </div>

                    <div className="pt-4 border-t border-slate-800/80 flex items-center gap-2">
                      {isTeacher ? (
                        <button
                          onClick={() => {
                            setSelectedClassroom(c);
                            setSessionTitle(`${c.title} Live Class`);
                          }}
                          className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl text-xs transition-all shadow"
                        >
                          <Video className="w-4 h-4" />
                          <span>Start Class Session</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            const activeSess = activeSessions.find((s) => s.classroom_id === c.id);
                            const targetSessId = activeSess ? activeSess.id : c.id;
                            navigate(`/classroom/${targetSessId}?classId=${c.id}`);
                          }}
                          className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl text-xs transition-all shadow"
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

          {/* 6 & 9. UPCOMING CLASSES & RECENT ACTIVITY EMPTY STATES */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Upcoming Schedule */}
            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-400" />
                <span>Upcoming Schedule</span>
              </h3>
              <div className="p-6 text-center border border-dashed border-slate-800 rounded-xl space-y-1">
                <p className="text-xs text-slate-400 font-medium">No upcoming classes scheduled</p>
                <p className="text-[11px] text-slate-500">
                  Scheduled class calendar will be integrated in Phase 3.
                </p>
              </div>
            </section>

            {/* Recent Activity */}
            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-400" />
                <span>Recent Activity</span>
              </h3>
              <div className="p-6 text-center border border-dashed border-slate-800 rounded-xl space-y-1">
                <p className="text-xs text-slate-400 font-medium">No recent activity recorded</p>
                <p className="text-[11px] text-slate-500">
                  Classroom logs and session history will populate here.
                </p>
              </div>
            </section>
          </div>
        </main>
      </div>

      {/* MODAL: CREATE CLASSROOM */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Create New Classroom</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateClassroom} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Classroom Title
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-500"
                  placeholder="Advanced Computer Vision"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Course Code / Subject
                </label>
                <input
                  type="text"
                  required
                  value={newCourseCode}
                  onChange={(e) => setNewCourseCode(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-500"
                  placeholder="CS-502"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-500 resize-none"
                  placeholder="Deep learning architectures for image recognition and object tracking."
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs rounded-xl"
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
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Start Live Class Session</h3>
              <button
                onClick={() => setSelectedClassroom(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleLaunchSession} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Classroom
                </label>
                <input
                  type="text"
                  disabled
                  value={`${selectedClassroom.course_code} - ${selectedClassroom.title}`}
                  className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-slate-300 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Session Topic / Title
                </label>
                <input
                  type="text"
                  required
                  value={sessionTitle}
                  onChange={(e) => setSessionTitle(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-500"
                  placeholder="Lecture 1: Introduction & Neural Networks"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedClassroom(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLaunchingSession}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs rounded-xl flex items-center gap-2"
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
    </div>
  );
};
