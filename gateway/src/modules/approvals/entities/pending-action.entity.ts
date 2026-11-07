import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export type ActionType = 'terminal_run' | 'terminal_write' | 'docker_restart' | 'vscode_write' | 'vscode_delete';
export type ActionStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';

@Entity('pending_actions')
export class PendingAction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'action_type', length: 100 })
  actionType: ActionType;

  @Column({ type: 'text' })
  summary: string;

  @Column({ type: 'jsonb', default: {} })
  payload: { path: string; method: string; body?: unknown; qs?: string };

  @Column({ default: 'pending', length: 20 })
  status: ActionStatus;

  @Column({ type: 'jsonb', nullable: true })
  result: unknown;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt: Date | null;
}
