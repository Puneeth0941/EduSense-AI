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
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 font-medium shadow-sm">
        <VideoOff className="w-3.5 h-3.5 text-slate-400" />
        <span>Attendance: Camera Off</span>
      </div>
    );
  }

  if (isVerifying) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 font-medium shadow-sm animate-pulse">
        <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
        <span>Attendance: Verifying...</span>
      </div>
    );
  }

  if (attendanceData?.verified) {
    const isLate = attendanceData.attendance_status === 'LATE';
    return (
      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold shadow-sm ${
        isLate
          ? 'bg-amber-50 border-amber-200 text-amber-700'
          : 'bg-emerald-50 border-emerald-200 text-emerald-700'
      }`}>
        <ShieldCheck className={`w-3.5 h-3.5 ${isLate ? 'text-amber-600' : 'text-emerald-600'}`} />
        <span>Attendance: Verified ✓ ({attendanceData.attendance_status})</span>
      </div>
    );
  }

  if (attendanceData && !attendanceData.verified) {
    const confirmed = attendanceData.samples_confirmed || 0;
    const required = attendanceData.samples_required || 3;

    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 font-medium shadow-sm">
        <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
        <span>Attendance: Pending ({confirmed}/{required} samples)</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-medium shadow-sm">
      <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
      <span>Attendance: Monitoring...</span>
    </div>
  );
};
