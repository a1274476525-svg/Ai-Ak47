import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ActionType, PendingAction } from './entities/pending-action.entity';

@Injectable()
export class ApprovalsService {
  private readonly logger = new Logger(ApprovalsService.name);
  private readonly brainUrl: string;

  constructor(
    @InjectRepository(PendingAction) private readonly repo: Repository<PendingAction>,
    config: ConfigService,
  ) {
    this.brainUrl = config.get<string>('aiBrain.url') ?? 'http://localhost:8000';
  }

  async queue(actionType: ActionType, summary: string, payload: PendingAction['payload']): Promise<PendingAction> {
    const action = this.repo.create({ actionType, summary, payload, status: 'pending' });
    return this.repo.save(action);
  }

  list(status?: string): Promise<PendingAction[]> {
    return this.repo.find({
      where: status ? { status: status as PendingAction['status'] } : {},
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async approve(id: string): Promise<PendingAction> {
    const action = await this.getPendingOrThrow(id);

    action.status = 'approved';
    action.decidedAt = new Date();
    await this.repo.save(action);

    const url = `${this.brainUrl}/v1/tools/${action.payload.path}${action.payload.qs ? `?${action.payload.qs}` : ''}`;
    try {
      const res = await fetch(url, {
        method: action.payload.method,
        headers: { 'Content-Type': 'application/json' },
        body: action.payload.body !== undefined ? JSON.stringify(action.payload.body) : undefined,
        signal: AbortSignal.timeout(60_000),
      });
      const data = await res.json().catch(() => ({ detail: res.statusText }));
      action.status = res.ok ? 'executed' : 'failed';
      action.result = data;
      if (!res.ok) action.error = (data as { detail?: string }).detail ?? `Brain ${res.status}`;
    } catch (err) {
      action.status = 'failed';
      action.error = err instanceof Error ? err.message : 'AI Brain unavailable';
      this.logger.warn(`Execution failed for approved action ${id}: ${action.error}`);
    }

    return this.repo.save(action);
  }

  async reject(id: string): Promise<PendingAction> {
    const action = await this.getPendingOrThrow(id);
    action.status = 'rejected';
    action.decidedAt = new Date();
    return this.repo.save(action);
  }

  private async getPendingOrThrow(id: string): Promise<PendingAction> {
    const action = await this.repo.findOne({ where: { id } });
    if (!action) throw new NotFoundException(`Pending action ${id} not found`);
    if (action.status !== 'pending') {
      throw new BadRequestException(`Action ${id} is already ${action.status}`);
    }
    return action;
  }
}
