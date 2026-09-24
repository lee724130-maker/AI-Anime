import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useNotificationStore } from '../stores/notificationStore';

let globalSocket: Socket | null = null;

export function getSocket(): Socket | null {
  return globalSocket;
}

// vB — production options: reconnectionAttempts 3, timeout 5000, io() wrapped in try/catch
export function useNotificationSocket() {
  const { setUnreadCount, addNotification, setConnected } = useNotificationStore();
  const instance = useRef<Socket | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (!token) return;
    if (instance.current?.connected) return;

    let socket: Socket;
    try {
      socket = io((import.meta.env.VITE_API_BASE || '') + '/admin', {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 3,
        timeout: 5000,
      });
    } catch {
      return;
    }

    socket.on('connect', () => {
      setConnected(true);
      globalSocket = socket;
    });

    socket.on('disconnect', () => {
      setConnected(false);
      if (globalSocket === socket) globalSocket = null;
    });

    socket.on('notification:new', (data) => {
      addNotification(data);
    });

    socket.on('notification:unread', (data) => {
      setUnreadCount(data.count);
    });

    instance.current = socket;

    return () => {
      socket.disconnect();
      if (globalSocket === socket) globalSocket = null;
      instance.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
