import React from 'react';
import { ShieldCheck, RefreshCw, AlertCircle, VideoOff } from 'lucide-react';
import type { AttendanceVerificationResponse } from '../types';

interface StudentAttendanceStatusBadgeProps {
  isCamOn: boolean;
  isVerifying: boolean;
  attendanceData: AttendanceVerificationResponse | null;
}

export const StudentAttendanceStatusBadge: React.FC<StudentAttendanceStatusBadgeProps> = ({
  isCamOn,
  isVerifying,
  attendanceData,
}) => {
  if (!isCamOn) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-400 font-medium shadow">
        <VideoOff className="w-3.5 h-3.5 text-slate-500" />
        <span>Attendance: Camera Off</span>
      </div>
    );
  }

  if (isVerifying) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-950/80 border border-indigo-800/60 rounded-xl text-xs text-indigo-300 font-medium shadow animate-pulse">
        <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
        <span>Attendance: Verifying...</span>
      </div>
    );
  }

  if (attendanceData?.verified) {
    const isLate = attendanceData.attendance_status === 'LATE';
    return (
      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold shadow ${
        isLate
          ? 'bg-amber-950/80 border-amber-800/60 text-amber-300'
          : 'bg-emerald-950/80 border-emerald-800/60 text-emerald-300'
      }`}>
        <ShieldCheck className={`w-3.5 h-3.5 ${isLate ? 'text-amber-400' : 'text-emerald-400'}`} />
        <span>Attendance: Verified ✓ ({attendanceData.attendance_status})</span>
      </div>
    );
  }

  if (attendanceData && !attendanceData.verified) {
    const confirmed = attendanceData.samples_confirmed || 0;
    const required = attendanceData.samples_required || 3;

    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-950/60 border border-amber-800/50 rounded-xl text-xs text-amber-300 font-medium shadow">
        <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
        <span>Attendance: Pending ({confirmed}/{required} samples)</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-300 font-medium shadow">
      <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
      <span>Attendance: Monitoring...</span>
    </div>
  );
};
