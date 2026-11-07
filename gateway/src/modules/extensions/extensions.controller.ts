import { Controller, Get, Post, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';

@ApiTags('extensions')
@Controller('extensions')
export class ExtensionsController {
  private readonly logger = new Logger(ExtensionsController.name);
  private readonly brainUrl: string;

  constructor(config: ConfigService) {
    this.brainUrl = config.get<string>('aiBrain.url') ?? 'http://localhost:8000';
  }

  private async proxy(path: string, method: string): Promise<unknown> {
    const url = `${this.brainUrl}/v1/extensions${path ? `/${path}` : ''}`;
    try {
      const res = await fetch(url, { method, signal: AbortSignal.timeout(30_000) });
      const data = await res.json().catch(() => ({ detail: res.statusText }));
      if (!res.ok) throw new HttpException((data as { detail?: string }).detail ?? `Brain ${res.status}`, res.status);
      return data;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException('AI Brain unavailable', HttpStatus.BAD_GATEWAY);
    }
  }

  @Get()
  @ApiOperation({ summary: 'List loaded extensions' })
  list() {
    return this.proxy('', 'GET');
  }

  @Post('reload')
  @ApiOperation({ summary: 'Reload all extensions from EXTENSIONS_DIR' })
  reload() {
    return this.proxy('reload', 'POST');
  }
}
