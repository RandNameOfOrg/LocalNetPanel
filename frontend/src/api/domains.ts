import { api } from './client';

export interface DnsConfig {
  id: number;
  device_id: number | null;
  credential_id: number | null;
  include_path: string;
  zones_dir: string;
  reload_hook: string;
  nameservers: string;
  allow_self_service: number;
  updated_at: number;
}

export interface AssignableUser { id: number; username: string; }

export interface Domain {
  id: number;
  name: string;
  ttl: number;
  primary_ns: string;
  admin_email: string;
  verified: number;
  verify_token: string | null;
  verify_method: string | null;
  record_count: number;
}

export interface DnsRecord {
  id: number;
  domain_id: number;
  name: string;
  type: string;
  value: string;
  ttl: number | null;
  priority: number | null;
  weight: number | null;
  port: number | null;
}

export interface DnsArtifacts {
  configured: boolean;
  includePath: string;
  includeContent: string;
  zones: { domain: string; path: string; content: string }[];
  reloadHook: string;
}

export const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'SRV', 'NS'];

export const domainsApi = {
  getConfig: () => api.get<DnsConfig>('/domains/config').then(r => r.data),
  updateConfig: (data: Partial<DnsConfig>) => api.put<DnsConfig>('/domains/config', data).then(r => r.data),

  // Configured NS + self-service flag (available to scoped 'domains' users for onboarding).
  nameservers: () => api.get<{ nameservers: string[]; selfService: boolean }>('/domains/nameservers').then(r => r.data),

  // Domain ↔ user assignments (managers only).
  assignableUsers: () => api.get<AssignableUser[]>('/domains/assignable-users').then(r => r.data),
  getDomainUsers: (id: number) => api.get<number[]>(`/domains/${id}/users`).then(r => r.data),
  setDomainUsers: (id: number, userIds: number[]) => api.put(`/domains/${id}/users`, { userIds }),

  list: () => api.get<Domain[]>('/domains').then(r => r.data),
  create: (data: { name: string; ttl?: number; primary_ns?: string; admin_email?: string }) =>
    api.post<{ id: number }>('/domains', data).then(r => r.data),
  remove: (id: number) => api.delete(`/domains/${id}`),

  listRecords: (id: number) => api.get<DnsRecord[]>(`/domains/${id}/records`).then(r => r.data),
  addRecord: (id: number, data: object) => api.post(`/domains/${id}/records`, data),
  deleteRecord: (id: number, rid: number) => api.delete(`/domains/${id}/records/${rid}`),

  preview: () => api.get<DnsArtifacts>('/domains/preview').then(r => r.data),
  apply: () => api.post<{ ok: boolean; output: string }>('/domains/apply').then(r => r.data),
  applyDomain: (id: number) => api.post<{ ok: boolean; output: string }>(`/domains/${id}/apply`).then(r => r.data),

  startVerify: (id: number, method: 'bind' | 'external') =>
    api.post<VerifyChallenge>(`/domains/${id}/verify`, { method }).then(r => r.data),
  checkVerify: (id: number) =>
    api.post<{ verified: boolean; method: string; checked: string; servers: string[] }>(`/domains/${id}/verify/check`).then(r => r.data),
};

export interface VerifyChallenge {
  method: string;
  token: string;
  record: { name: string; type: string; value: string };
  fqdn: string;
}
