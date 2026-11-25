export interface HealthStatus {
  status: string;
  database: 'up' | 'down';
  timestamp: string;
}

import { api } from './api';

export function getHealth() {
  return api.get<HealthStatus>('/health').then((res) => res.data);
}
