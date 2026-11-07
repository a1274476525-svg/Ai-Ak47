import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AutonomousService {
  private readonly logger = new Logger(AutonomousService.name);
  private readonly brainUrl: string;

  constructor(private readonly config: ConfigService) {
    this.brainUrl = this.config.get<string>('aiBrain.url') ?? 'http://localhost:8000';
  }

  /** Forward any request to ai-brain /v1/autonomous/<path> */
  async proxy(
    path: string,
    method: string,
    body?: unknown,
    query?: Record<string, string>,
  ): Promise<unknown> {
    const qs = query && Object.keys(query).length
      ? '?' + new URLSearchParams(query).toString()
      : '';
    const url = `${this.brainUrl}/v1/autonomous/${path}${qs}`;

    const init: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(180_000),
    };
    if (body && method !== 'GET') {
      init.body = JSON.stringify(body);
    }

    const res = await fetch(url, init);
    const data = await res.json().catch(() => ({ detail: res.statusText }));

    if (!res.ok) {
      const err = (data as { detail?: string }).detail ?? `Brain returned ${res.status}`;
      this.logger.warn(`Autonomous proxy ${method} ${path} → ${res.status}: ${err}`);
      throw Object.assign(new Error(err), { statusCode: res.status });
    }

    return data;
  }
}
