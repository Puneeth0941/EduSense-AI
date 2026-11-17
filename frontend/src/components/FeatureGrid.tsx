import React from 'react';

const MODULES = [
  { name: 'Authentication Module', feature: 'src/features/auth', status: 'Phase 1 - Core Model Ready' },
  { name: 'Classroom Module', feature: 'src/features/classroom', status: 'Phase 1 - Core Model Ready' },
  { name: 'Student Registration', feature: 'src/features/registration', status: 'Phase 1 - Core Model Ready' },
  { name: 'Attendance System', feature: 'src/features/attendance', status: 'Phase 1 - Core Model Ready' },
  { name: 'Analytics Engine', feature: 'src/features/analytics', status: 'Phase 1 - Stub Schema Ready' },
  { name: 'Class Reports', feature: 'src/features/reports', status: 'Phase 1 - Stub Schema Ready' },
  { name: 'Intelligence Agent', feature: 'src/features/agent', status: 'Phase 1 - Module Stub' },
];

export const FeatureGrid: React.FC = () => {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
        Phase 1 Architectural Feature Modules
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {MODULES.map((mod, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-2">
            <div className="text-xs font-bold text-slate-900">{mod.name}</div>
            <div className="text-[11px] font-mono text-slate-500">{mod.feature}</div>
            <div className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full inline-block border border-blue-100">
              {mod.status}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
