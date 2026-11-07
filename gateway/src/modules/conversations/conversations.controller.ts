import { Controller, Get, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@ApiTags('conversations')
@ApiBearerAuth()
@Controller('conversations')
export class ConversationsController {
  constructor(
    @InjectDataSource()
    private readonly ds: DataSource,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List conversations (most recent first)' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'q', required: false, description: 'Free-text search over conversation title' })
  async list(@Query('limit') limit = '20', @Query('q') q?: string) {
    const rows = await this.ds.query(
      `SELECT c.id, c.title, c.created_at,
              COUNT(m.id)::int           AS message_count,
              MAX(m.created_at)          AS last_message_at
       FROM conversations c
       LEFT JOIN messages m ON m.conversation_id = c.id
       ${q ? 'WHERE c.title ILIKE $2' : ''}
       GROUP BY c.id
       ORDER BY last_message_at DESC NULLS LAST
       LIMIT $1`,
      q ? [parseInt(limit, 10), `%${q}%`] : [parseInt(limit, 10)],
    );
    return rows;
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Get all messages in a conversation' })
  async messages(@Param('id', ParseUUIDPipe) id: string) {
    return this.ds.query(
      `SELECT id, role, content, provider, model, tokens_in, tokens_out, created_at
       FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
      [id],
    );
  }
}
