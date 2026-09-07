import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Bell, Search, ChevronDown, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface TopHeaderProps {
  pageTitle: string;
}

export const TopHeader: React.FC<TopHeaderProps> = ({ pageTitle }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);

  const isTeacher = user?.role === 'TEACHER';
  const initials = user?.full_name ? user.full_name.substring(0, 2).toUpperCase() : 'US';

  return (
    <header className="h-16 bg-slate-900/80 border-b border-slate-800 backdrop-blur sticky top-0 z-20 px-6 flex items-center justify-between">
      {/* Left: Title & Breadcrumb */}
      <div className="flex items-center gap-3">
        <h2 className="text-base font-bold text-white tracking-tight capitalize pl-8 md:pl-0">
          {pageTitle}
        </h2>
      </div>

      {/* Right: Search, Notifications, User Profile */}
      <div className="flex items-center gap-4">
        {/* Search Input */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl w-48 lg:w-64">
          <Search className="w-4 h-4 text-slate-500 shrink-0" />
          <input
            type="text"
            placeholder="Search classes or topics..."
            className="w-full bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
          />
        </div>

        {/* Notifications Icon */}
        <button
          className="relative p-2 bg-slate-950 border border-slate-800 text-slate-400 hover:text-white rounded-xl transition-colors"
          title="Notifications"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-indigo-500"></span>
        </button>

        {/* User Profile Badge & Menu */}
        <div className="relative">
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex items-center gap-3 p-1.5 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 flex items-center justify-center font-bold text-xs uppercase shadow-sm">
              {initials}
            </div>

            <div className="hidden sm:block text-left pr-1">
              <div className="text-xs font-semibold text-white leading-tight flex items-center gap-1.5">
                <span>{user?.full_name || 'Authenticated User'}</span>
              </div>
              <span
                className={`text-[9px] font-bold uppercase tracking-wider ${
                  isTeacher ? 'text-indigo-400' : 'text-emerald-400'
                }`}
              >
                {user?.role || 'STUDENT'}
              </span>
            </div>

            <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
          </button>

          {/* Profile Dropdown */}
          {profileOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl py-2 z-30 space-y-1">
              <div className="px-4 py-2 border-b border-slate-800 text-xs">
                <p className="font-semibold text-white">{user?.full_name}</p>
                <p className="text-slate-400 truncate">{user?.email}</p>
              </div>

              <button
                onClick={() => {
                  setProfileOpen(false);
                  logout();
                  navigate('/login');
                }}
                className="w-full text-left px-4 py-2 text-xs text-red-400 hover:bg-slate-800 flex items-center gap-2"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
