import React from 'react';

export const Header: React.FC = () => {
  return (
    <header style={styles.header}>
      <div style={styles.titleGroup}>
        <h1 style={styles.title}>EduSense AI</h1>
        <span style={styles.subtitle}>Smart Classroom Attendance & Student Engagement Analytics</span>
      </div>
      <div style={styles.phaseBadge}>Phase 1: Foundation & Architecture</div>
    </header>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1.5rem 2rem',
    backgroundColor: '#1e293b',
    borderBottom: '1px solid #334155',
    color: '#f8fafc',
  },
  titleGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  title: {
    margin: 0,
    fontSize: '1.5rem',
    fontWeight: '700',
    color: '#38bdf8',
  },
  subtitle: {
    fontSize: '0.875rem',
    color: '#94a3b8',
  },
  phaseBadge: {
    backgroundColor: '#0284c7',
    color: '#ffffff',
    padding: '0.4rem 0.8rem',
    borderRadius: '6px',
    fontSize: '0.8rem',
    fontWeight: '600',
  },
};
