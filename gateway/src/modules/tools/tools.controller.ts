import {
  Controller, Get, Post, Delete, Body, Param, Query,
  HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { ApprovalsService } from '../approvals/approvals.service';

@ApiTags('tools')
@Controller('tools')
export class ToolsController {
  private readonly logger = new Logger(ToolsController.name);
  private readonly brainUrl: string;

  constructor(config: ConfigService, private readonly approvals: ApprovalsService) {
    this.brainUrl = config.get<string>('aiBrain.url') ?? 'http://localhost:8000';
  }

  private async proxy(path: string, method: string, body?: unknown, qs?: string): Promise<unknown> {
    const url = `${this.brainUrl}/v1/tools/${path}${qs ? `?${qs}` : ''}`;
    const init: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(60_000),
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

  // ── Terminal ─────────────────────────────────────────────────────────────

  @Post('terminal/run')
  @ApiOperation({ summary: 'Queue a shell command in sandbox for approval' })
  terminalRun(@Body() body: { command: string }) {
    return this.approvals.queue('terminal_run', `Run shell command: "${body.command}"`, { path: 'terminal/run', method: 'POST', body });
  }

  @Get('terminal/read')
  @ApiOperation({ summary: 'Read a file from sandbox' })
  terminalRead(@Query('path') path: string) {
    return this.proxy('terminal/read', 'GET', undefined, `path=${encodeURIComponent(path)}`);
  }

  @Post('terminal/write')
  @ApiOperation({ summary: 'Queue a sandbox file write for approval' })
  terminalWrite(@Body() body: { path: string; content: string }) {
    return this.approvals.queue('terminal_write', `Write file: ${body.path}`, { path: 'terminal/write', method: 'POST', body });
  }

  // ── Docker ────────────────────────────────────────────────────────────────

  @Get('docker/containers')
  @ApiOperation({ summary: 'List Docker containers' })
  dockerList(@Query('all_containers') all?: string) {
    const qs = all === 'true' ? 'all_containers=true' : '';
    return this.proxy('docker/containers', 'GET', undefined, qs);
  }

  @Get('docker/logs/:container')
  @ApiOperation({ summary: 'Get container logs' })
  dockerLogs(@Param('container') container: string, @Query('lines') lines?: string) {
    const qs = lines ? `lines=${lines}` : '';
    return this.proxy(`docker/logs/${container}`, 'GET', undefined, qs);
  }

  @Get('docker/stats/:container')
  @ApiOperation({ summary: 'Get container stats' })
  dockerStats(@Param('container') container: string) {
    return this.proxy(`docker/stats/${container}`, 'GET');
  }

  @Post('docker/restart/:service')
  @ApiOperation({ summary: 'Queue an AI OS service restart for approval' })
  dockerRestart(@Param('service') service: string) {
    return this.approvals.queue('docker_restart', `Restart Docker service: ${service}`, { path: `docker/restart/${service}`, method: 'POST', body: {} });
  }

  // ── Browser Automation ────────────────────────────────────────────────────

  @Post('browser/navigate')
  @ApiOperation({ summary: 'Navigate to a URL and return page title + text' })
  browserNavigate(@Body() body: { url: string }) {
    return this.proxy('browser/navigate', 'POST', body);
  }

  @Post('browser/screenshot')
  @ApiOperation({ summary: 'Take a screenshot of a URL (returns base64 PNG)' })
  browserScreenshot(@Body() body: { url: string }) {
    return this.proxy('browser/screenshot', 'POST', body);
  }

  @Get('browser/links')
  @ApiOperation({ summary: 'Extract all links from a web page' })
  browserLinks(@Query('url') url: string) {
    return this.proxy('browser/links', 'GET', undefined, `url=${encodeURIComponent(url)}`);
  }

  // ── VSCode Server Workspace ────────────────────────────────────────────────

  @Get('vscode/files')
  @ApiOperation({ summary: 'List files in VSCode workspace' })
  vscodeList(@Query('directory') directory?: string) {
    const qs = directory ? `directory=${encodeURIComponent(directory)}` : '';
    return this.proxy('vscode/files', 'GET', undefined, qs);
  }

  @Get('vscode/read')
  @ApiOperation({ summary: 'Read a file from VSCode workspace' })
  vscodeRead(@Query('path') path: string) {
    return this.proxy('vscode/read', 'GET', undefined, `path=${encodeURIComponent(path)}`);
  }

  @Post('vscode/write')
  @ApiOperation({ summary: 'Queue a VSCode workspace file write for approval' })
  vscodeWrite(@Body() body: { path: string; content: string }) {
    return this.approvals.queue('vscode_write', `Write workspace file: ${body.path}`, { path: 'vscode/write', method: 'POST', body });
  }

  @Delete('vscode/delete')
  @ApiOperation({ summary: 'Queue a VSCode workspace file delete for approval' })
  vscodeDelete(@Query('path') path: string) {
    return this.approvals.queue('vscode_delete', `Delete workspace file: ${path}`, { path: 'vscode/delete', method: 'DELETE', qs: `path=${encodeURIComponent(path)}` });
  }
}
