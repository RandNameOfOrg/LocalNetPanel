import axios from 'axios';
import { useAuthStore } from '../store/auth';

export const api = axios.create({ baseURL: '/api', withCredentials: true });

api.interceptors.request.use(config => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing: Promise<string> | null = null;

api.interceptors.response.use(
  r => r,
  async error => {
    if (error.response?.status !== 401 || error.config._retry) throw error;
    error.config._retry = true;

    if (!refreshing) {
      refreshing = api
        .post<{ accessToken: string }>('/auth/refresh')
        .then(r => {
          useAuthStore.getState().setAccessToken(r.data.accessToken);
          return r.data.accessToken;
        })
        .finally(() => { refreshing = null; });
    }

    try {
      const token = await refreshing;
      error.config.headers.Authorization = `Bearer ${token}`;
      return api(error.config);
    } catch {
      useAuthStore.getState().logout();
      throw error;
    }
  },
);
