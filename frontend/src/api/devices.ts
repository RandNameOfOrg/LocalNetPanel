import { api } from './client';

export interface Device {
  id: number;
  name: string;
  ip: string;
  mac: string | null;
  os_type: 'linux' | 'windows';
  port: number;
  notes: string | null;
}

export interface Credential {
  id: number;
  device_id: number;
  label: string;
  username: string;
  auth_type: 'password' | 'key';
}

export const devicesApi = {
  list: () => api.get<Device[]>('/devices').then(r => r.data),
  get: (id: number) => api.get<Device>(`/devices/${id}`).then(r => r.data),
  create: (data: Omit<Device, 'id'>) => api.post<{ id: number }>('/devices', data).then(r => r.data),
  update: (id: number, data: Partial<Omit<Device, 'id'>>) => api.put(`/devices/${id}`, data),
  delete: (id: number) => api.delete(`/devices/${id}`),

  listCredentials: (deviceId: number) =>
    api.get<Credential[]>(`/devices/${deviceId}/credentials`).then(r => r.data),
  addCredential: (deviceId: number, data: object) =>
    api.post<{ id: number }>(`/devices/${deviceId}/credentials`, data).then(r => r.data),
  deleteCredential: (deviceId: number, credId: number) =>
    api.delete(`/devices/${deviceId}/credentials/${credId}`),

  power: (deviceId: number, data: { action: string; credentialId?: number; delay?: number }) =>
    api.post(`/devices/${deviceId}/power`, data).then(r => r.data),

  info: (deviceId: number, credentialId: number, type = 'basic') =>
    api.get<{ type: string; output: string }>(`/devices/${deviceId}/info`, {
      params: { credentialId, type },
    }).then(r => r.data),

  listFiles: (deviceId: number, credentialId: number, path = '/') =>
    api.get(`/devices/${deviceId}/files`, { params: { credentialId, path } }).then(r => r.data),
  readFile: (deviceId: number, credentialId: number, path: string) =>
    api.get(`/devices/${deviceId}/files/content`, { params: { credentialId, path } }).then(r => r.data),

  uploadFile: (deviceId: number, credentialId: number, path: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api
      .post<{ ok: boolean; path: string; size: number }>(`/devices/${deviceId}/files/upload`, form, {
        params: { credentialId, path },
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then(r => r.data);
  },
};

export interface DiscoveredHost { ip: string; mac: string; }

/** Scan the local network for hosts (IP + MAC) — used for Wake-on-LAN setup. */
export const discoverHosts = () =>
  api.get<{ hosts: DiscoveredHost[] }>('/discover').then(r => r.data.hosts);
