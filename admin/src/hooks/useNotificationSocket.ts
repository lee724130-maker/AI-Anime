import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useNotificationStore } from '../stores/notificationStore';

let globalSocket: Socket | null = null;

export function getSocket(): Socket | null {
  return globalSocket;
}

export function useNotificationSocket() {
  const { setUnreadCount, addNotification, setConnected } = useNotificationStore();
  const instance = useRef<Socket | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (!token) return;

    if (instance.current?.connected) return;

    const socket = io('http://localhost:3000/admin', {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

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
  }, []);
}
