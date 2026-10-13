import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';

// H3：惰性读取 —— 模块 import 期早于 ConfigModule 的 dotenv 加载，顶层 const 会拿到
// fallback 弱密钥（潜在 latent bug：验签一直用错密钥）。改为连接时读取，缺失即拒绝连接。
function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET 未配置');
  return secret;
}
function corsOrigins(): string[] {
  return (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:5174').split(',');
}

@WebSocketGateway({
  namespace: '/admin',
  cors: { origin: corsOrigins(), credentials: true },
})
export class AdminNotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.query?.token;
      if (!token) { client.disconnect(); return; }
      const decoded = jwt.verify(token as string, jwtSecret()) as any;
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
