import { Controller, Get, Put, Body, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';

@ApiTags('budget')
@Controller('budget')
export class BudgetController {
  private readonly logger = new Logger(BudgetController.name);
  private readonly brainUrl: string;

  constructor(config: ConfigService) {
    this.brainUrl = config.get<string>('aiBrain.url') ?? 'http://localhost:8000';
  }

  private async proxy(method: string, body?: unknown): Promise<unknown> {
    const url = `${this.brainUrl}/v1/budget`;
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30_000),
      });
      const data = await res.json().catch(() => ({ detail: res.statusText }));
      if (!res.ok) throw new HttpException((data as { detail?: string }).detail ?? `Brain ${res.status}`, res.status);
      return data;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException('AI Brain unavailable', HttpStatus.BAD_GATEWAY);
    }
  }

  @Get()
  @ApiOperation({ summary: 'Get budget config and current spend' })
  get() {
    return this.proxy('GET');
  }

  @Put()
  @ApiOperation({ summary: 'Update the daily/monthly spend limits' })
  update(@Body() body: { daily_limit_usd: number | null; monthly_limit_usd: number | null; enabled: boolean }) {
    return this.proxy('PUT', body);
  }
}
