import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Classroom } from '../types';
import { sessionApi } from '../services/api';
import { X, Video, LogIn, AlertCircle, Loader2 } from 'lucide-react';

interface JoinClassModalProps {
  classrooms: Classroom[];
  onClose: () => void;
}

export const JoinClassModal: React.FC<JoinClassModalProps> = ({ classrooms, onClose }) => {
  const navigate = useNavigate();
  const [selectedClassId, setSelectedClassId] = useState<string>(
    classrooms.length > 0 ? classrooms[0].id : ''
  );
  const [customSessionId, setCustomSessionId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const targetClassId = selectedClassId;
    let targetSessionId = customSessionId.trim();

    if (!targetClassId) {
      setError('Please select a classroom');
      return;
    }

    try {
      setIsJoining(true);
      if (!targetSessionId) {
        const activeSess = await sessionApi.getActiveSessionForClassroom(targetClassId);
        if (!activeSess) {
          setError('No active live session is currently running for this classroom.');
          return;
        }
        targetSessionId = activeSess.id;
      }

      // Navigate to LiveKit classroom with real session ID
      navigate(`/classroom/${targetSessionId}?classId=${targetClassId}`);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to resolve active session');
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-5 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center">
              <Video className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Join Live Classroom</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleJoin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Select Enrolled Subject / Classroom
            </label>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
            >
              {classrooms.length === 0 && (
                <option value="">No classrooms available</option>
              )}
              {classrooms.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.course_code} - {c.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Direct Session ID <span className="text-slate-400 font-normal lowercase">(optional)</span>
            </label>
            <input
              type="text"
              value={customSessionId}
              onChange={(e) => setCustomSessionId(e.target.value)}
              placeholder="Leave blank to join current active live session"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-blue-500 font-mono"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              If left blank, the system automatically joins the current live session for this subject.
            </p>
          </div>

          <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isJoining || classrooms.length === 0}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50 shadow-xs"
            >
              {isJoining ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Connecting...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Enter Live Classroom</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
