import { api } from './client';

export interface AdguardStatus {
  configured: boolean;
  reachable?: boolean;
  error?: string;
  status?: { protection_enabled?: boolean; running?: boolean; version?: string; dns_addresses?: string[] };
  stats?: { num_dns_queries?: number; num_blocked_filtering?: number };
}

export const adguardApi = {
  status: () => api.get<AdguardStatus>('/adguard/status').then(r => r.data),
};
