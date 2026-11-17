import React from 'react';
import { GraduationCap } from 'lucide-react';

export const Header: React.FC = () => {
  return (
    <header className="flex justify-between items-center px-6 py-4 bg-white border-b border-slate-200 text-slate-900 shadow-xs">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center">
          <GraduationCap className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-base font-bold text-slate-900 leading-tight">EduSense AI</h1>
          <span className="text-xs text-slate-500">Smart Classroom Attendance & Student Engagement Analytics</span>
        </div>
      </div>
      <div className="bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1 rounded-full border border-blue-100">
        Phase 1: Foundation & Architecture
      </div>
    </header>
  );
};
