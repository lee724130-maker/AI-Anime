import { create } from 'zustand';

export interface AdminUser {
  id: number;
  username: string;
  email?: string | null;
  role?: string;
  is_super_admin?: boolean;
  admin_permissions?: string | null;
  [key: string]: unknown;
}

interface AuthState {
  user: AdminUser | null;
  token: string | null;
  setAuth: (user: AdminUser, token: string) => void;
  logout: () => void;
  canAccess: (key: string) => boolean;
  canEdit: (key: string) => boolean;
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

// kR: build permission set for user — super admin => null (all access);
// no permissions => empty set; parses admin_permissions JSON array.
const permissionsOf = (user: AdminUser | null): Set<string> | null => {
  if (user?.is_super_admin) return null;
  if (!user?.admin_permissions) return new Set();
  try {
    const list = JSON.parse(user.admin_permissions);
    return Array.isArray(list) ? new Set(list) : new Set();
  } catch {
    return new Set();
  }
};

// AR: permission check — null set grants everything;
// view accepts key / key:view / key:edit; edit accepts key / key:edit.
const check = (
  perms: Set<string> | null,
  key: string,
  mode: 'view' | 'edit',
): boolean => {
  if (perms === null) return true;
  if (mode === 'view') {
    return perms.has(key) || perms.has(`${key}:view`) || perms.has(`${key}:edit`);
  }
  return perms.has(key) || perms.has(`${key}:edit`);
};

export const useAdminAuthStore = create<AuthState>((set, get) => ({
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

  canAccess: (key) => check(permissionsOf(get().user), key, 'view'),
  canEdit: (key) => check(permissionsOf(get().user), key, 'edit'),
}));
