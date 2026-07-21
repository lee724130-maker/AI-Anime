import { create } from 'zustand';

interface Notification {
  id: number;
  type: string;
  title: string;
  message?: string;
  read: boolean;
  created_at: string;
}

interface NotificationState {
  unreadCount: number;
  notifications: Notification[];
  connected: boolean;
  setUnreadCount: (count: number) => void;
  addNotification: (n: Notification) => void;
  setConnected: (v: boolean) => void;
  setNotifications: (list: Notification[]) => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  unreadCount: 0,
  notifications: [],
  connected: false,
  setUnreadCount: (count) => set({ unreadCount: count }),
  addNotification: (n) => set((s) => ({
    notifications: [n, ...s.notifications],
    unreadCount: s.unreadCount + 1,
  })),
  setConnected: (v) => set({ connected: v }),
  setNotifications: (list) => set({ notifications: list }),
}));
