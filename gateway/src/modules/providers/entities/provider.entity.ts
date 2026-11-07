import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('ai_providers')
export class Provider {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 100 })
  name: string;

  @Column({ name: 'api_key_enc', nullable: true, type: 'text' })
  apiKeyEnc: string | null;

  @Column({ default: true })
  enabled: boolean;

  @Column({ type: 'smallint', default: 5 })
  priority: number;

  @Column({ name: 'model_default', length: 150, nullable: true })
  modelDefault: string | null;

  @Column({ name: 'cost_per_1k', type: 'numeric', precision: 10, scale: 6, default: 0 })
  costPer1k: number;

  @Column({ name: 'rate_limit', default: 1000 })
  rateLimit: number;

  @Column({ name: 'fallback_to', length: 100, nullable: true })
  fallbackTo: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
