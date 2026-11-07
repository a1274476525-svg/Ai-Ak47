import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification) private readonly repo: Repository<Notification>,
  ) {}

  list(unreadOnly?: boolean): Promise<Notification[]> {
    return this.repo.find({
      where: unreadOnly ? { isRead: false } : {},
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  countUnread(): Promise<number> {
    return this.repo.count({ where: { isRead: false } });
  }

  async markRead(id: string): Promise<void> {
    await this.repo.update({ id }, { isRead: true });
  }

  async markAllRead(): Promise<void> {
    await this.repo.update({ isRead: false }, { isRead: true });
  }
}
