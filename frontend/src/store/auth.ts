import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User { id: number; username: string; role: string; permissions?: string[]; }

interface AuthState {
  accessToken: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  setAccessToken: (token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    set => ({
      accessToken: null,
      user: null,
      setAuth: (token, user) => set({ accessToken: token, user }),
      setAccessToken: token => set({ accessToken: token }),
      logout: () => set({ accessToken: null, user: null }),
    }),
    { name: 'auth', partialize: s => ({ user: s.user }) },
  ),
);
