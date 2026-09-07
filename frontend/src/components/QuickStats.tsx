import React from 'react';
import type { Classroom, ClassSession } from '../types';
import { BookOpen, Video, Users, BarChart } from 'lucide-react';

interface QuickStatsProps {
  classrooms: Classroom[];
  activeSessions: ClassSession[];
  isTeacher: boolean;
}

export const QuickStats: React.FC<QuickStatsProps> = ({
  classrooms,
  activeSessions,
  isTeacher,
}) => {
  const stats = isTeacher
    ? [
        {
          id: 'total_classes',
          label: 'Total Classrooms',
          value: classrooms.length.toString(),
          subtext: 'Created by you',
          icon: BookOpen,
          color: 'text-indigo-400',
          bgColor: 'bg-indigo-600/10 border-indigo-500/20',
        },
        {
          id: 'active_sessions',
          label: 'Live Now',
          value: activeSessions.length.toString(),
          subtext: 'Active class sessions',
          icon: Video,
          color: 'text-emerald-400',
          bgColor: 'bg-emerald-600/10 border-emerald-500/20',
        },
        {
          id: 'students',
          label: 'Classroom Scope',
          value: classrooms.length > 0 ? `${classrooms.length} Subjects` : '0',
          subtext: 'Active course offerings',
          icon: Users,
          color: 'text-cyan-400',
          bgColor: 'bg-cyan-600/10 border-cyan-500/20',
        },
        {
          id: 'ai_reports',
          label: 'AI Engagement Analytics',
          value: 'N/A',
          subtext: 'Available in Phase 3',
          icon: BarChart,
          color: 'text-slate-400',
          bgColor: 'bg-slate-800/40 border-slate-700/30',
        },
      ]
    : [
        {
          id: 'enrolled_classes',
          label: 'Available Classrooms',
          value: classrooms.length.toString(),
          subtext: 'Active course listings',
          icon: BookOpen,
          color: 'text-indigo-400',
          bgColor: 'bg-indigo-600/10 border-indigo-500/20',
        },
        {
          id: 'live_sessions',
          label: 'Live Sessions',
          value: activeSessions.length.toString(),
          subtext: 'Ongoing live classes',
          icon: Video,
          color: 'text-emerald-400',
          bgColor: 'bg-emerald-600/10 border-emerald-500/20',
        },
        {
          id: 'attendance',
          label: 'Attendance Records',
          value: 'N/A',
          subtext: 'Available in Phase 3',
          icon: Users,
          color: 'text-slate-400',
          bgColor: 'bg-slate-800/40 border-slate-700/30',
        },
        {
          id: 'reports',
          label: 'Performance Insights',
          value: 'N/A',
          subtext: 'Available in Phase 3',
          icon: BarChart,
          color: 'text-slate-400',
          bgColor: 'bg-slate-800/40 border-slate-700/30',
        },
      ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((s) => {
        const Icon = s.icon;
        return (
          <div
            key={s.id}
            className="p-5 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between shadow-lg"
          >
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {s.label}
              </span>
              <div className="text-2xl font-bold text-white tracking-tight">{s.value}</div>
              <p className="text-[11px] text-slate-500">{s.subtext}</p>
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
