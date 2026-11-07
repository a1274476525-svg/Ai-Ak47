import { Controller, Get, Post, Body, Query, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';

@ApiTags('memory')
@Controller('memory')
export class MemoryController {
  private readonly logger = new Logger(MemoryController.name);
  private readonly brainUrl: string;

  constructor(config: ConfigService) {
    this.brainUrl = config.get<string>('aiBrain.url') ?? 'http://localhost:8000';
  }

  private async proxy(path: string, method: string, body?: unknown, qs?: string): Promise<unknown> {
    const url = `${this.brainUrl}/v1/memory${path ? `/${path}` : ''}${qs ? `?${qs}` : ''}`;
    const init: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30_000),
    };
    if (body && method !== 'GET') init.body = JSON.stringify(body);
    try {
      const res = await fetch(url, init);
      const data = await res.json().catch(() => ({ detail: res.statusText }));
      if (!res.ok) throw new HttpException((data as { detail?: string }).detail ?? `Brain ${res.status}`, res.status);
      return data;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException('AI Brain unavailable', HttpStatus.BAD_GATEWAY);
    }
  }

  @Get('search')
  @ApiOperation({ summary: 'Semantic search over the vector knowledge base' })
  search(@Query('q') q: string, @Query('limit') limit?: string) {
    const params = new URLSearchParams({ q });
    if (limit) params.set('limit', limit);
    return this.proxy('search', 'GET', undefined, params.toString());
  }

  @Post()
  @ApiOperation({ summary: 'Store a piece of knowledge in the vector memory' })
  store(@Body() body: { content: string; topic: string; source?: string }) {
    return this.proxy('', 'POST', body);
  }
}
