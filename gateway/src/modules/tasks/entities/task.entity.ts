import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

export type TaskStatus   = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
export type TaskOrigin   = 'user' | 'autonomous' | 'learning_engine' | 'scheduled';

@Entity('tasks')
export class Task {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 500 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Index()
  @Column({ default: 'pending', length: 50 })
  status: TaskStatus;

  @Index()
  @Column({ type: 'smallint', default: 5 })
  priority: number;

  @Column({ default: 'user', length: 50 })
  origin: TaskOrigin;

  @Index()
  @Column({ name: 'assigned_agent', length: 100, nullable: true })
  assignedAgent: string | null;

  @Column({ name: 'model_used', length: 100, nullable: true })
  modelUsed: string | null;

  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId: string | null;

  @Column({ name: 'parent_task_id', type: 'uuid', nullable: true })
  parentTaskId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  result: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;
}
