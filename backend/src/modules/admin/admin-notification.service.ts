import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminNotification } from './admin-notification.entity';
import { AdminNotificationGateway } from './admin-notification.gateway';

@Injectable()
export class AdminNotificationService {
  constructor(
    @InjectRepository(AdminNotification)
    private readonly repo: Repository<AdminNotification>,
    private readonly gateway: AdminNotificationGateway,
  ) {}

  async create(type: string, title: string, message?: string) {
    const notification = this.repo.create({ type, title, message });
    const saved = await this.repo.save(notification);
    this.gateway.sendNotification(saved);
    const count = await this.unreadCount();
    this.gateway.sendUnreadCount(count);
    return saved;
  }

  async list(page = 1, limit = 20) {
    const [items, total] = await this.repo.findAndCount({
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  async unreadCount() {
    return this.repo.count({ where: { read: false } });
  }

  async markRead(id: number) {
    await this.repo.update(id, { read: true });
    const count = await this.unreadCount();
    this.gateway.sendUnreadCount(count);
  }

  async markAllRead() {
    await this.repo.update({ read: false }, { read: true });
    const count = await this.unreadCount();
    this.gateway.sendUnreadCount(count);
  }
}
