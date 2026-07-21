import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'ai-anime-jwt-secret-key';

@WebSocketGateway({
  namespace: '/admin',
  cors: { origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:5176'], credentials: true },
})
export class AdminNotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.query?.token;
      if (!token) { client.disconnect(); return; }
      const decoded = jwt.verify(token as string, JWT_SECRET) as any;
      if (decoded.role !== 'admin') { client.disconnect(); return; }
      client.data.user = decoded;
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(_client: Socket) {}

  sendNotification(notification: { id: number; type: string; title: string; message?: string; read: boolean; created_at: Date }) {
    this.server?.emit('notification:new', notification);
  }

  sendUnreadCount(count: number) {
    this.server?.emit('notification:unread', { count });
  }
}
