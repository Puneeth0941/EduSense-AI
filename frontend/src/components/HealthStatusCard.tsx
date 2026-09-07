import React from 'react';
import type { HealthResponse } from '../types/api';

interface HealthStatusCardProps {
  health: HealthResponse | null;
  loading: boolean;
  onRefresh: () => void;
}

export const HealthStatusCard: React.FC<HealthStatusCardProps> = ({ health, loading, onRefresh }) => {
  const isHealthy = health?.status === 'healthy';

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <h2 style={styles.cardTitle}>Backend Connection Status</h2>
        <button onClick={onRefresh} style={styles.refreshButton} disabled={loading}>
          {loading ? 'Checking...' : 'Refresh Status'}
        </button>
      </div>

      <div style={styles.statusRow}>
        <span style={styles.label}>API Health Endpoint:</span>
        <span style={{ ...styles.badge, backgroundColor: isHealthy ? '#16a34a' : '#dc2626' }}>
          {loading ? 'CHECKING...' : (health?.status?.toUpperCase() || 'UNREACHABLE')}
        </span>
      </div>

      <div style={styles.statusRow}>
        <span style={styles.label}>Backend Service:</span>
        <span style={styles.value}>{health?.service || 'EduSense AI API'}</span>
      </div>

      <div style={styles.statusRow}>
        <span style={styles.label}>PostgreSQL Database:</span>
        <span style={{ ...styles.value, color: health?.database === 'connected' ? '#4ade80' : '#f87171' }}>
          {health?.database || 'Disconnected'}
        </span>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  card: {
    backgroundColor: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '8px',
    padding: '1.5rem',
    marginBottom: '2rem',
    color: '#f8fafc',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1.25rem',
    borderBottom: '1px solid #1e293b',
    paddingBottom: '0.75rem',
  },
  cardTitle: {
    margin: 0,
    fontSize: '1.15rem',
    color: '#e2e8f0',
  },
  refreshButton: {
    backgroundColor: '#334155',
    color: '#f8fafc',
    border: 'none',
    padding: '0.5rem 1rem',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.85rem',
  },
  statusRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.5rem 0',
  },
  label: {
    color: '#94a3b8',
    fontSize: '0.95rem',
  },
  value: {
    fontWeight: '600',
    fontSize: '0.95rem',
  },
  badge: {
    color: '#ffffff',
    padding: '0.25rem 0.6rem',
    borderRadius: '4px',
    fontSize: '0.75rem',
    fontWeight: '700',
  },
};
