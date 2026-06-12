import { create } from 'zustand';
import api from '../services/api';

interface User {
  id: number;
  username: string;
  phone?: string;
  credits: number;
  created_at: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
  isLoggedIn: () => boolean;
  refreshUser: () => Promise<void>;
}

const safeParse = (key: string) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw || raw === 'null' || raw === 'undefined') return null;
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem(key);
    return null;
  }
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: safeParse('user'),
  token: localStorage.getItem('token'),

  setAuth: (user, token) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    set({ user, token });
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    set({ user: null, token: null });
  },

  isLoggedIn: () => !!get().token,

  refreshUser: async () => {
    const token = get().token;
    if (!token) return;
    try {
      const { data } = await api.get('/api/user/profile');
      localStorage.setItem('user', JSON.stringify(data));
      set({ user: data });
    } catch {
      // Silently fail — keep using cached data if API is unavailable
    }
  },
}));
