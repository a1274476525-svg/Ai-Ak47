import { Controller, Get, Query, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';

@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  private readonly logger = new Logger(AnalyticsController.name);
  private readonly brainUrl: string;

  constructor(config: ConfigService) {
    this.brainUrl = config.get<string>('aiBrain.url') ?? 'http://localhost:8000';
  }

  private async proxy(path: string, qs?: string): Promise<unknown> {
    const url = `${this.brainUrl}/v1/analytics/${path}${qs ? `?${qs}` : ''}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      const data = await res.json().catch(() => ({ detail: res.statusText }));
      if (!res.ok) throw new HttpException((data as { detail?: string }).detail ?? `Brain ${res.status}`, res.status);
      return data;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException('AI Brain unavailable', HttpStatus.BAD_GATEWAY);
    }
  }

  @Get('overview')
  @ApiOperation({ summary: 'High-level KPIs: tasks, messages, cost, skills' })
  overview() {
    return this.proxy('overview');
  }

  @Get('tasks')
  @ApiOperation({ summary: 'Task breakdown by agent and origin' })
  tasks(@Query('days') days?: string) {
    return this.proxy('tasks', days ? `days=${days}` : undefined);
  }

  @Get('models')
  @ApiOperation({ summary: 'Model/provider usage and cost' })
  models(@Query('days') days?: string) {
    return this.proxy('models', days ? `days=${days}` : undefined);
  }

  @Get('skills')
  @ApiOperation({ summary: 'Skill levels vs targets by category' })
  skills() {
    return this.proxy('skills');
  }

  @Get('timeline')
  @ApiOperation({ summary: 'Tasks and messages created per day' })
  timeline(@Query('days') days?: string) {
    return this.proxy('timeline', days ? `days=${days}` : undefined);
  }

  @Get('knowledge')
  @ApiOperation({ summary: 'Knowledge base statistics' })
  knowledge() {
    return this.proxy('knowledge');
  }
}
