import {
  Controller, Get, Post, Delete, Param,
  Body, Query, HttpCode, HttpStatus, ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { TaskStatus } from './entities/task.entity';

@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks')
export class TasksController {
  constructor(private readonly service: TasksService) {}

  @Get()
  @ApiOperation({ summary: 'List tasks with optional filters' })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'in_progress', 'completed', 'failed', 'cancelled'] })
  @ApiQuery({ name: 'agent', required: false })
  @ApiQuery({ name: 'q', required: false, description: 'Free-text search over title/description' })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date — only tasks created on/after' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date — only tasks created on/before' })
  findAll(
    @Query('status') status?: TaskStatus,
    @Query('agent') agent?: string,
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.findAll({ status, agent, q, from, to });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get task details and current status' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Submit a new task for execution' })
  create(@Body() dto: CreateTaskDto) {
    return this.service.create(dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancel and remove a task' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
