import { Controller, Get, Post, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List notifications, most recent first' })
  @ApiQuery({ name: 'unread', required: false })
  list(@Query('unread') unread?: string) {
    return this.service.list(unread === 'true');
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Count of unread notifications' })
  async unreadCount() {
    return { count: await this.service.countUnread() };
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  async markRead(@Param('id') id: string) {
    await this.service.markRead(id);
    return { ok: true };
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  async markAllRead() {
    await this.service.markAllRead();
    return { ok: true };
  }
}
