import { create } from 'zustand';

interface AdminUser {
  id: number;
  username: string;
}

interface AuthState {
  user: AdminUser | null;
  token: string | null;
  setAuth: (user: AdminUser, token: string) => void;
  logout: () => void;
}

const safeParse = (key: string) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw || raw === 'null' || raw === 'undefined') return null;
    return JSON.parse(raw);
  } catch {
    // Corrupt data — clear it and return null
    localStorage.removeItem(key);
    return null;
  }
};

export const useAdminAuthStore = create<AuthState>((set) => ({
  user: safeParse('admin_user'),
  token: localStorage.getItem('admin_token'),

  setAuth: (user, token) => {
    localStorage.setItem('admin_token', token);
    localStorage.setItem('admin_user', JSON.stringify(user));
    set({ user, token });
  },

  logout: () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    set({ user: null, token: null });
  },
}));
