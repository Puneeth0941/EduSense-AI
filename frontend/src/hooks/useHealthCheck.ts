import { useState, useEffect } from 'react';
import { fetchHealthStatus } from '../services/api';
import type { HealthResponse } from '../types/api';

export function useHealthCheck() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const checkHealth = async () => {
    setLoading(true);
    const data = await fetchHealthStatus();
    setHealth(data);
    setLoading(false);
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  return { health, loading, refetch: checkHealth };
}
