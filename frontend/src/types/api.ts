export interface HealthResponse {
  status: string;
  service: string;
  database: string;
}

export interface ModuleStatus {
  name: string;
  key: string;
  description: string;
  status: 'Ready (Phase 1 Stub)' | 'Pending Phase 2+';
}
