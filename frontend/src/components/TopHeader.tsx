import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Bell, Search, ChevronDown, LogOut, User } from 'lucide-react';
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

  // Capitalize or format title
  const formattedTitle = pageTitle
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return (
    <header className="h-16 bg-white/95 border-b border-slate-200 backdrop-blur sticky top-0 z-20 px-6 flex items-center justify-between">
      {/* Left: Title & Breadcrumb */}
      <div className="flex items-center gap-3">
        <h2 className="text-base font-bold text-slate-900 tracking-tight pl-8 md:pl-0">
          {formattedTitle}
        </h2>
      </div>

      {/* Right: Search, Notifications, User Profile */}
      <div className="flex items-center gap-3">
        {/* Search Input */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg w-48 lg:w-64 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-all">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Search classes or topics..."
            className="w-full bg-transparent text-xs text-slate-800 placeholder-slate-400 focus:outline-none"
          />
        </div>

        {/* Notifications Icon */}
        <button
          className="relative p-2 bg-slate-50 border border-slate-200 text-slate-600 hover:text-slate-900 rounded-lg transition-colors hover:bg-slate-100"
          title="Notifications"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-blue-600 ring-2 ring-white"></span>
        </button>

        {/* User Profile Badge & Menu */}
        <div className="relative">
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex items-center gap-2.5 p-1 bg-white border border-slate-200 hover:border-slate-300 rounded-lg transition-colors shadow-xs"
          >
            <div className="w-8 h-8 rounded-md bg-blue-600 text-white flex items-center justify-center font-bold text-xs uppercase shadow-xs">
              {initials}
            </div>

            <div className="hidden sm:block text-left pr-1">
              <div className="text-xs font-semibold text-slate-900 leading-tight">
                {user?.full_name || 'Authenticated User'}
              </div>
              <span
                className={`text-[10px] font-bold uppercase tracking-wider ${
                  isTeacher ? 'text-blue-600' : 'text-emerald-600'
                }`}
              >
                {user?.role || 'STUDENT'}
              </span>
            </div>

            <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block mr-1" />
          </button>

          {/* Profile Dropdown */}
          {profileOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-30 space-y-1">
              <div className="px-4 py-2.5 border-b border-slate-100 text-xs">
                <p className="font-semibold text-slate-900">{user?.full_name}</p>
                <p className="text-slate-500 truncate text-[11px]">{user?.email}</p>
                <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                  {user?.role}
                </span>
              </div>

              <div className="px-2 py-1">
                <button
                  onClick={() => {
                    setProfileOpen(false);
                    logout();
                    navigate('/login');
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-2 transition-colors font-medium"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
