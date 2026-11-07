import {
  Controller, Get, Post, Body, Query, Param,
  HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';

@ApiTags('knowledge')
@Controller('knowledge')
export class KnowledgeController {
  private readonly logger = new Logger(KnowledgeController.name);
  private readonly brainUrl: string;

  constructor(config: ConfigService) {
    this.brainUrl = config.get<string>('aiBrain.url') ?? 'http://localhost:8000';
  }

  private async proxy(path: string, method: string, body?: unknown, qs?: string): Promise<unknown> {
    const url = `${this.brainUrl}/v1/knowledge/${path}${qs ? `?${qs}` : ''}`;
    const init: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30_000),
    };
    if (body && method !== 'GET') init.body = JSON.stringify(body);

    try {
      const res = await fetch(url, init);
      const data = await res.json().catch(() => ({ detail: res.statusText }));
      if (!res.ok) {
        const err = (data as { detail?: string }).detail ?? `Brain returned ${res.status}`;
        throw new HttpException(err, res.status);
      }
      return data;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException('AI Brain unavailable', HttpStatus.BAD_GATEWAY);
    }
  }

  @Get('stats')
  @ApiOperation({ summary: 'Knowledge Graph statistics' })
  stats() { return this.proxy('stats', 'GET'); }

  @Post('concepts')
  @ApiOperation({ summary: 'Upsert a concept node' })
  upsertConcept(@Body() body: unknown) { return this.proxy('concepts', 'POST', body); }

  @Get('concepts/search')
  @ApiOperation({ summary: 'Search concept nodes' })
  searchConcepts(@Query('q') q: string, @Query('limit') limit?: string) {
    const params = new URLSearchParams({ q });
    if (limit) params.set('limit', limit);
    return this.proxy('concepts/search', 'GET', undefined, params.toString());
  }

  @Post('relationships')
  @ApiOperation({ summary: 'Add a relationship between nodes' })
  addRelationship(@Body() body: unknown) { return this.proxy('relationships', 'POST', body); }

  @Post('insights')
  @ApiOperation({ summary: 'Add an insight node' })
  addInsight(@Body() body: unknown) { return this.proxy('insights', 'POST', body); }

  @Get('related/:name')
  @ApiOperation({ summary: 'Get related nodes for a concept' })
  getRelated(
    @Param('name') name: string,
    @Query('label') label?: string,
    @Query('depth') depth?: string,
    @Query('limit') limit?: string,
  ) {
    const params = new URLSearchParams();
    if (label) params.set('label', label);
    if (depth) params.set('depth', depth);
    if (limit) params.set('limit', limit);
    return this.proxy(`related/${encodeURIComponent(name)}`, 'GET', undefined, params.toString());
  }

  @Get('skills/graph')
  @ApiOperation({ summary: 'Skill knowledge graph' })
  skillGraph() { return this.proxy('skills/graph', 'GET'); }
}
