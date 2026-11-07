/**
 * Saves conversations and messages to PostgreSQL via raw queries.
 * Uses the TypeORM DataSource directly since we don't have TypeORM entities
 * for conversations (they're in asyncpg on the brain side).
 * For simplicity we write directly to the pool via pg client.
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  constructor(
    @InjectDataSource()
    private readonly ds: DataSource,
  ) {}

  /** Create or retrieve a conversation, return its UUID. */
  async getOrCreate(conversationId: string | undefined, title: string): Promise<string> {
    const qr = this.ds.createQueryRunner();
    try {
      if (conversationId) {
        const row = await qr.query(
          'SELECT id FROM conversations WHERE id = $1',
          [conversationId],
        );
        if (row.length) return conversationId;
      }

      const result = await qr.query(
        `INSERT INTO conversations (title) VALUES ($1) RETURNING id`,
        [title.slice(0, 200)],
      );
      return result[0].id as string;
    } catch (err) {
      this.logger.warn('getOrCreate conversation failed: %s', err);
      return conversationId ?? 'unknown';
    } finally {
      await qr.release();
    }
  }

  async saveMessage(opts: {
    conversationId: string;
    role: 'user' | 'assistant';
    content: string;
    provider?: string;
    model?: string;
    tokensIn?: number;
    tokensOut?: number;
  }): Promise<void> {
    const qr = this.ds.createQueryRunner();
    try {
      await qr.query(
        `INSERT INTO messages (conversation_id, role, content, provider, model, tokens_in, tokens_out)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          opts.conversationId,
          opts.role,
          opts.content,
          opts.provider ?? null,
          opts.model    ?? null,
          opts.tokensIn  ?? 0,
          opts.tokensOut ?? 0,
        ],
      );
    } catch (err) {
      this.logger.warn('saveMessage failed: %s', err);
    } finally {
      await qr.release();
    }
  }
}
