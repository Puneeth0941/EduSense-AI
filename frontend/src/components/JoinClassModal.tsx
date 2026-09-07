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
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
              <Video className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-white">Join Live Classroom</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-950/50 border border-red-800/50 rounded-xl text-red-300 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleJoin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
              Select Classroom
            </label>
            {classrooms.length > 0 ? (
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-500"
              >
                {classrooms.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.course_code}: {c.title}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-slate-500 italic">No classrooms available right now.</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
              Session Code / ID (Optional)
            </label>
            <input
              type="text"
              value={customSessionId}
              onChange={(e) => setCustomSessionId(e.target.value)}
              placeholder="Leave blank to join primary classroom session"
              className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={classrooms.length === 0 || isJoining}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium text-xs rounded-xl flex items-center gap-1.5 shadow-lg shadow-emerald-600/20"
            >
              {isJoining ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Connecting...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Enter Classroom</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
