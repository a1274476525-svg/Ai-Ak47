import {
  Controller, Get, Post, Param, Query, Body,
  HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AutonomousService } from './autonomous.service';

@ApiTags('autonomous')
@Controller('autonomous')
export class AutonomousController {
  private readonly logger = new Logger(AutonomousController.name);

  constructor(private readonly svc: AutonomousService) {}

  private async forward(
    path: string,
    method: string,
    body?: unknown,
    query?: Record<string, string>,
  ) {
    try {
      return await this.svc.proxy(path, method, body, query);
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string };
      throw new HttpException(
        e.message ?? 'AI Brain unavailable',
        e.statusCode ?? HttpStatus.BAD_GATEWAY,
      );
    }
  }

  // ── Plan ────────────────────────────────────────────────────────────

  @Post('plan')
  @ApiOperation({ summary: 'Decompose a goal into sub-tasks' })
  plan(@Body() body: { goal: string; store?: boolean }) {
    return this.forward('plan', 'POST', body);
  }

  // ── Skills ──────────────────────────────────────────────────────────

  @Get('skills')
  @ApiOperation({ summary: 'List all skills with levels' })
  skills() {
    return this.forward('skills', 'GET');
  }

  @Get('skills/gaps')
  @ApiOperation({ summary: 'Skills below target threshold' })
  skillGaps(@Query('threshold') threshold?: string) {
    return this.forward('skills/gaps', 'GET', undefined, threshold ? { threshold } : undefined);
  }

  @Post('skills/learn')
  @ApiOperation({ summary: 'Trigger a skill learning cycle' })
  learn(@Body() body: { max_skills?: number }) {
    return this.forward('skills/learn', 'POST', body);
  }

  // ── Research ────────────────────────────────────────────────────────

  @Post('research/run')
  @ApiOperation({ summary: 'Run the daily research pipeline now' })
  researchRun() {
    return this.forward('research/run', 'POST', {});
  }

  // ── Tasks ───────────────────────────────────────────────────────────

  @Get('tasks/pending')
  @ApiOperation({ summary: 'List pending autonomous tasks' })
  pendingTasks(@Query('limit') limit?: string) {
    return this.forward('tasks/pending', 'GET', undefined, limit ? { limit } : undefined);
  }

  @Get('tasks/recent')
  @ApiOperation({ summary: 'List recent autonomous tasks' })
  recentTasks(
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    const q: Record<string, string> = {};
    if (limit)  q.limit  = limit;
    if (status) q.status = status;
    return this.forward('tasks/recent', 'GET', undefined, q);
  }

  @Post('tasks/execute')
  @ApiOperation({ summary: 'Run pending tasks immediately' })
  executeTasks(@Query('max_tasks') maxTasks?: string) {
    return this.forward(
      'tasks/execute',
      'POST',
      {},
      maxTasks ? { max_tasks: maxTasks } : undefined,
    );
  }

  @Get('tasks/:id')
  @ApiOperation({ summary: 'Get a single autonomous task' })
  getTask(@Param('id') id: string) {
    return this.forward(`tasks/${id}`, 'GET');
  }

  @Get('tasks/:id/steps')
  @ApiOperation({ summary: 'Step-by-step trace log for a task' })
  getTaskSteps(@Param('id') id: string) {
    return this.forward(`tasks/${id}/steps`, 'GET');
  }

  // ── Self-Improvement ────────────────────────────────────────────────

  @Post('evaluate')
  @ApiOperation({ summary: 'Trigger self-evaluation on recent task outputs' })
  evaluate(@Query('max_tasks') maxTasks?: string) {
    return this.forward(
      'evaluate',
      'POST',
      {},
      maxTasks ? { max_tasks: maxTasks } : undefined,
    );
  }

  // ── World Model ──────────────────────────────────────────────────────

  @Get('world-model/stats')
  @ApiOperation({ summary: 'World Model statistics' })
  worldModelStats() {
    return this.forward('world-model/stats', 'GET');
  }

  @Post('world-model/recall')
  @ApiOperation({ summary: 'Semantic search over World Model' })
  worldModelRecall(@Body() body: { query: string; limit?: number }) {
    return this.forward('world-model/recall', 'POST', body);
  }

  @Post('world-model/learn')
  @ApiOperation({ summary: 'Manually teach the World Model a fact' })
  worldModelLearn(@Body() body: { topic: string; summary: string; source_url?: string; tags?: string[] }) {
    return this.forward('world-model/learn', 'POST', body);
  }

  @Post('world-model/consolidate')
  @ApiOperation({ summary: 'Trigger World Model consolidation' })
  worldModelConsolidate(@Query('max_items') maxItems?: string) {
    return this.forward(
      'world-model/consolidate',
      'POST',
      {},
      maxItems ? { max_items: maxItems } : undefined,
    );
  }

  // ── Coding Brain ─────────────────────────────────────────────────────

  @Post('coding-brain')
  @ApiOperation({ summary: 'Run the 8-agent Coding Brain on a software task' })
  codingBrain(@Body() body: { task: string; task_type?: string }) {
    return this.forward('coding-brain', 'POST', body);
  }

  // ── Self-Coding Loop ─────────────────────────────────────────────────

  @Post('coding-loop/run')
  @ApiOperation({ summary: 'Start an autonomous write→test→fix loop (background)' })
  codingLoopRun(
    @Body() body: { task: string; language?: string; max_iterations?: number },
  ) {
    return this.forward('coding-loop/run', 'POST', body);
  }

  @Get('coding-loop')
  @ApiOperation({ summary: 'List recent Self-Coding Loop runs' })
  codingLoopList(@Query('limit') limit?: string) {
    return this.forward('coding-loop', 'GET', undefined, limit ? { limit } : undefined);
  }

  @Get('coding-loop/:runId')
  @ApiOperation({ summary: 'Get status of a Self-Coding Loop run' })
  codingLoopStatus(@Param('runId') runId: string) {
    return this.forward(`coding-loop/${runId}`, 'GET');
  }
}
