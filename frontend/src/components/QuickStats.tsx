import React from 'react';
import type {
  Classroom,
  ClassSession,
  StudentAttendanceSummaryResponse,
  TeacherAttendanceSummaryResponse,
} from '../types';
import { BookOpen, Video, Users, BarChart, Calendar } from 'lucide-react';

interface QuickStatsProps {
  classrooms: Classroom[];
  activeSessions: ClassSession[];
  isTeacher: boolean;
  studentAttendance?: StudentAttendanceSummaryResponse | null;
  teacherAttendance?: TeacherAttendanceSummaryResponse | null;
}

export const QuickStats: React.FC<QuickStatsProps> = ({
  classrooms,
  activeSessions,
  isTeacher,
  studentAttendance,
  teacherAttendance,
}) => {
  const stats: Array<{
    id: string;
    label: string;
    value: string;
    subtext: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    bgColor: string;
  }> = [];

  if (isTeacher) {
    // 1. Total Classrooms
    stats.push({
      id: 'total_classes',
      label: 'Total Classrooms',
      value: classrooms.length.toString(),
      subtext: 'Created by you',
      icon: BookOpen,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50 border-blue-100',
    });

    // 2. Active Live Sessions
    stats.push({
      id: 'active_sessions',
      label: 'Live Now',
      value: activeSessions.length.toString(),
      subtext: 'Active class sessions',
      icon: Video,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50 border-emerald-100',
    });

    // 3. Completed Sessions (from real teacher attendance summary)
    if (teacherAttendance && typeof teacherAttendance.total_sessions_conducted === 'number') {
      stats.push({
        id: 'sessions_conducted',
        label: 'Sessions Conducted',
        value: teacherAttendance.total_sessions_conducted.toString(),
        subtext: 'Completed class sessions',
        icon: Calendar,
        color: 'text-indigo-600',
        bgColor: 'bg-indigo-50 border-indigo-100',
      });
    }

    // 4. Overall Attendance Rate (from real teacher attendance summary)
    if (teacherAttendance && typeof teacherAttendance.overall_attendance_rate === 'number') {
      stats.push({
        id: 'overall_attendance',
        label: 'Overall Attendance',
        value: `${teacherAttendance.overall_attendance_rate}%`,
        subtext: 'Average student presence',
        icon: Users,
        color: 'text-violet-600',
        bgColor: 'bg-violet-50 border-violet-100',
      });
    }
  } else {
    // Student Perspective
    // 1. Available Classrooms
    stats.push({
      id: 'available_classes',
      label: 'Available Classrooms',
      value: classrooms.length.toString(),
      subtext: 'Active course offerings',
      icon: BookOpen,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50 border-blue-100',
    });

    // 2. Live Sessions
    stats.push({
      id: 'live_sessions',
      label: 'Live Sessions',
      value: activeSessions.length.toString(),
      subtext: 'Ongoing live classes',
      icon: Video,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50 border-emerald-100',
    });

    // 3 & 4. Real Student Attendance Metrics (only when reliable data exists)
    if (studentAttendance && studentAttendance.total_sessions > 0) {
      stats.push({
        id: 'attendance_rate',
        label: 'Attendance Rate',
        value: `${studentAttendance.attendance_percentage}%`,
        subtext: `${studentAttendance.present_count} present, ${studentAttendance.late_count} late`,
        icon: Users,
        color: 'text-emerald-600',
        bgColor: 'bg-emerald-50 border-emerald-100',
      });

      stats.push({
        id: 'sessions_attended',
        label: 'Sessions Attended',
        value: `${studentAttendance.present_count + studentAttendance.late_count} / ${studentAttendance.total_sessions}`,
        subtext: 'Verified attendance',
        icon: BarChart,
        color: 'text-indigo-600',
        bgColor: 'bg-indigo-50 border-indigo-100',
      });
    }
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((s) => {
        const Icon = s.icon;
        return (
          <div
            key={s.id}
            className="p-5 bg-white border border-slate-200/90 rounded-xl flex items-center justify-between shadow-xs hover:border-slate-300 hover:shadow-sm transition-all"
          >
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                {s.label}
              </span>
              <div className="text-2xl font-bold text-slate-900 tracking-tight">{s.value}</div>
              <p className="text-[12px] text-slate-500 font-normal">{s.subtext}</p>
            </div>

            <div className={`p-3 rounded-xl border ${s.bgColor} ${s.color}`}>
              <Icon className="w-5 h-5" />
            </div>
          </div>
        );
      })}
    </div>
  );
};
