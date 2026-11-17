import React from 'react';
import type { HealthResponse } from '../types/api';
import { Activity, RefreshCw } from 'lucide-react';

interface HealthStatusCardProps {
  health: HealthResponse | null;
  loading: boolean;
  onRefresh: () => void;
}

export const HealthStatusCard: React.FC<HealthStatusCardProps> = ({ health, loading, onRefresh }) => {
  const isHealthy = health?.status === 'healthy';

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4 font-sans text-slate-800">
      <div className="flex justify-between items-center pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-600" />
          <h2 className="text-base font-bold text-slate-900">Backend Connection Status</h2>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          <span>{loading ? 'Checking...' : 'Refresh Status'}</span>
        </button>
      </div>

      <div className="space-y-3 text-xs">
        <div className="flex justify-between items-center py-1">
          <span className="text-slate-500 font-medium">API Health Endpoint:</span>
          <span className={`px-2.5 py-0.5 rounded-full font-bold uppercase text-[10px] border ${
            isHealthy
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-red-50 text-red-700 border-red-200'
          }`}>
            {loading ? 'CHECKING...' : (health?.status?.toUpperCase() || 'UNREACHABLE')}
          </span>
        </div>

        <div className="flex justify-between items-center py-1">
          <span className="text-slate-500 font-medium">Backend Service:</span>
          <span className="font-semibold text-slate-800">{health?.service || 'EduSense AI API'}</span>
        </div>

        <div className="flex justify-between items-center py-1">
          <span className="text-slate-500 font-medium">PostgreSQL Database:</span>
          <span className={`font-semibold ${health?.database === 'connected' ? 'text-emerald-600' : 'text-red-500'}`}>
            {health?.database || 'Disconnected'}
          </span>
        </div>
      </div>
    </div>
  );
};
