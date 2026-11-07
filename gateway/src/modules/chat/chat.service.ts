import { Injectable, Logger, ServiceUnavailableException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { ChatRequestDto } from './dto/chat.dto';
import { ChatUploadDto } from './dto/chat-upload.dto';
import { ConversationService } from './conversation.service';

const MAX_TEXT_ATTACHMENT_CHARS = 50_000;

export interface ChatResponse {
  content: string;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
  agentUsed?: string;
  debateUsed?: boolean;
  conversationId?: string;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly brainUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly conversations: ConversationService,
  ) {
    this.brainUrl = this.config.get<string>('aiBrain.url') ?? 'http://localhost:8000';
  }

  async chat(dto: ChatRequestDto): Promise<ChatResponse> {
    const start = Date.now();

    // Persist user message + ensure conversation exists
    const convId = await this.conversations.getOrCreate(
      dto.conversationId,
      dto.message.slice(0, 80),
    );
    await this.conversations.saveMessage({
      conversationId: convId,
      role: 'user',
      content: dto.message,
    });

    try {
      const res = await fetch(`${this.brainUrl}/v1/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: dto.message,
          history: dto.history ?? [],
          provider: dto.provider,
          task_type: dto.taskType ?? 'general',
          conversation_id: convId,
        }),
        signal: AbortSignal.timeout(120_000),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`AI Brain returned ${res.status}: ${err}`);
      }

      const data = (await res.json()) as ChatResponse;
      this.logger.log(
        `Chat → ${data.provider}/${data.model} | in:${data.tokensIn} out:${data.tokensOut} | ${Date.now() - start}ms`,
      );

      // Persist assistant response
      await this.conversations.saveMessage({
        conversationId: convId,
        role: 'assistant',
        content: data.content,
        provider: data.provider,
        model: data.model,
        tokensIn:  data.tokensIn,
        tokensOut: data.tokensOut,
      });

      return { ...data, conversationId: convId };
    } catch (err) {
      this.logger.error('Chat request failed', err);
      throw new ServiceUnavailableException('AI Brain is unavailable. Please try again.');
    }
  }

  /**
   * Sends a message with a file attachment. Text-decodable files (code,
   * logs, config, markdown, …) are read into the prompt context, truncated
   * to MAX_TEXT_ATTACHMENT_CHARS. Binary files that decode with replacement
   * characters are rejected unless they're an image, which is forwarded as
   * base64 for the AI Brain to use if the resolved provider supports vision.
   */
  async chatWithAttachment(dto: ChatUploadDto, file: Express.Multer.File): Promise<ChatResponse> {
    const isImage = file.mimetype.startsWith('image/');
    let attachment: { type: 'text' | 'image'; name: string; content?: string; mime?: string; base64?: string };

    if (isImage) {
      attachment = { type: 'image', name: file.originalname, mime: file.mimetype, base64: file.buffer.toString('base64') };
    } else {
      const text = file.buffer.toString('utf-8');
      const replacementRatio = (text.match(/�/g)?.length ?? 0) / Math.max(text.length, 1);
      if (replacementRatio > 0.01) {
        throw new BadRequestException(
          `"${file.originalname}" doesn't look like a text file and isn't an image — only text/code files and images are supported.`,
        );
      }
      attachment = { type: 'text', name: file.originalname, content: text.slice(0, MAX_TEXT_ATTACHMENT_CHARS) };
    }

    const history = dto.history ? (JSON.parse(dto.history) as Array<{ role: string; content: string }>) : [];
    const convId = await this.conversations.getOrCreate(dto.conversationId, dto.message.slice(0, 80));
    await this.conversations.saveMessage({
      conversationId: convId,
      role: 'user',
      content: `${dto.message}\n\n[Attached file: ${file.originalname}]`,
    });

    try {
      const res = await fetch(`${this.brainUrl}/v1/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: dto.message,
          history,
          provider: dto.provider,
          task_type: dto.taskType ?? 'general',
          conversation_id: convId,
          attachment,
        }),
        signal: AbortSignal.timeout(120_000),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`AI Brain returned ${res.status}: ${err}`);
      }

      const data = (await res.json()) as ChatResponse;
      await this.conversations.saveMessage({
        conversationId: convId,
        role: 'assistant',
        content: data.content,
        provider: data.provider,
        model: data.model,
        tokensIn: data.tokensIn,
        tokensOut: data.tokensOut,
      });

      return { ...data, conversationId: convId };
    } catch (err) {
      this.logger.error('Chat-with-attachment request failed', err);
      throw new ServiceUnavailableException('AI Brain is unavailable. Please try again.');
    }
  }

  /**
   * Streams the assistant reply token-by-token over SSE, passing chunks
   * through to `res` as they arrive from the AI Brain, then persists the
   * accumulated assistant message once the stream ends.
   */
  async streamChat(dto: ChatRequestDto, res: Response): Promise<void> {
    const convId = await this.conversations.getOrCreate(dto.conversationId, dto.message.slice(0, 80));
    await this.conversations.saveMessage({ conversationId: convId, role: 'user', content: dto.message });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Conversation-Id', convId);
    res.write(`data: ${JSON.stringify({ conversation_id: convId })}\n\n`);

    let full = '';
    let meta: { provider?: string; model?: string; tokens_in?: number; tokens_out?: number } = {};

    try {
      const upstream = await fetch(`${this.brainUrl}/v1/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: dto.message,
          history: dto.history ?? [],
          provider: dto.provider,
          task_type: dto.taskType ?? 'general',
          conversation_id: convId,
        }),
        signal: AbortSignal.timeout(120_000),
      });

      if (!upstream.body) throw new Error('No stream body from AI Brain');

      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          if (!part.startsWith('data: ')) continue;
          const raw = part.slice(6);
          res.write(`data: ${raw}\n\n`);
          try {
            const parsed = JSON.parse(raw) as { delta?: string; done?: boolean } & typeof meta;
            if (parsed.delta) full += parsed.delta;
            if (parsed.done) meta = parsed;
          } catch {
            // ignore malformed chunk
          }
        }
      }
    } catch (err) {
      this.logger.error('Stream chat failed', err);
      res.write(`data: ${JSON.stringify({ error: 'AI Brain is unavailable. Please try again.' })}\n\n`);
    } finally {
      if (full) {
        await this.conversations.saveMessage({
          conversationId: convId,
          role: 'assistant',
          content: full,
          provider: meta.provider,
          model: meta.model,
          tokensIn: meta.tokens_in,
          tokensOut: meta.tokens_out,
        });
      }
      res.end();
    }
  }
}
