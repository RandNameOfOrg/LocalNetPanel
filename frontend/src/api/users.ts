import { api } from './client';

export interface PanelUser {
  id: number;
  username: string;
  role: 'admin' | 'user';
  permissions: string[];
  created_at: number;
}

export interface UserInput {
  username: string;
  password?: string;
  role: 'admin' | 'user';
  permissions: string[];
}

export const usersApi = {
  list: () => api.get<PanelUser[]>('/users').then(r => r.data),
  create: (data: UserInput) => api.post<{ id: number }>('/users', data).then(r => r.data),
  update: (id: number, data: Partial<UserInput>) => api.put(`/users/${id}`, data),
  delete: (id: number) => api.delete(`/users/${id}`),
};
