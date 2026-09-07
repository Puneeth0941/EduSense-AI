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
    <div>
      <h3 style={styles.gridHeading}>Phase 1 Architectural Feature Modules</h3>
      <div style={styles.grid}>
        {MODULES.map((mod, i) => (
          <div key={i} style={styles.moduleCard}>
            <div style={styles.moduleName}>{mod.name}</div>
            <div style={styles.moduleFeature}>{mod.feature}</div>
            <div style={styles.statusTag}>{mod.status}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  gridHeading: {
    color: '#cbd5e1',
    fontSize: '1.1rem',
    marginBottom: '1rem',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '1rem',
  },
  moduleCard: {
    backgroundColor: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    padding: '1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  moduleName: {
    color: '#f1f5f9',
    fontWeight: '600',
    fontSize: '0.95rem',
  },
  moduleFeature: {
    color: '#64748b',
    fontSize: '0.8rem',
    fontFamily: 'monospace',
  },
  statusTag: {
    color: '#38bdf8',
    fontSize: '0.75rem',
    fontWeight: '600',
  },
};
