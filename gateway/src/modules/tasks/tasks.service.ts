import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task, TaskStatus } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    @InjectRepository(Task)
    private readonly repo: Repository<Task>,
  ) {}

  async findAll(filters?: { status?: TaskStatus; agent?: string; q?: string; from?: string; to?: string }): Promise<Task[]> {
    const qb = this.repo.createQueryBuilder('task').orderBy('task.priority', 'DESC').addOrderBy('task.createdAt', 'DESC');

    if (filters?.status) qb.andWhere('task.status = :status', { status: filters.status });
    if (filters?.agent)  qb.andWhere('task.assignedAgent = :agent', { agent: filters.agent });
    if (filters?.q) {
      qb.andWhere('(task.title ILIKE :q OR task.description ILIKE :q)', { q: `%${filters.q}%` });
    }
    if (filters?.from) qb.andWhere('task.createdAt >= :from', { from: filters.from });
    if (filters?.to)   qb.andWhere('task.createdAt <= :to',   { to: filters.to });

    return qb.limit(100).getMany();
  }

  async findOne(id: string): Promise<Task> {
    const task = await this.repo.findOneBy({ id });
    if (!task) throw new NotFoundException(`Task ${id} not found`);
    return task;
  }

  async create(dto: CreateTaskDto): Promise<Task> {
    const task = this.repo.create({
      title: dto.title,
      description: dto.description ?? null,
      priority: dto.priority ?? 5,
      origin: (dto.origin as TaskStatus | undefined) ? (dto.origin as any) : 'user',
      assignedAgent: dto.assignedAgent ?? null,
      projectId: dto.projectId ?? null,
      parentTaskId: dto.parentTaskId ?? null,
      status: 'pending',
    });

    const saved = await this.repo.save(task);
    this.logger.log(`Task created: ${saved.id} — "${saved.title}"`);
    return saved;
  }

  async updateStatus(
    id: string,
    status: TaskStatus,
    extras?: { result?: Record<string, unknown>; error?: string; modelUsed?: string },
  ): Promise<Task> {
    const task = await this.findOne(id);
    task.status = status;

    if (status === 'in_progress' && !task.startedAt) task.startedAt = new Date();
    if (status === 'completed' || status === 'failed') task.completedAt = new Date();
    if (extras?.result)    task.result    = extras.result;
    if (extras?.error)     task.error     = extras.error;
    if (extras?.modelUsed) task.modelUsed = extras.modelUsed;

    return this.repo.save(task);
  }

  async remove(id: string): Promise<void> {
    const task = await this.findOne(id);
    await this.repo.remove(task);
  }
}
