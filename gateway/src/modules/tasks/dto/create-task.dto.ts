import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsInt, Min, Max,
  MaxLength, IsIn, IsUUID,
} from 'class-validator';

export class CreateTaskDto {
  @ApiProperty({ example: 'Build a REST API for user management' })
  @IsString()
  @MaxLength(500)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ default: 5, minimum: 1, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  priority?: number;

  @ApiPropertyOptional({ enum: ['user', 'autonomous', 'learning_engine', 'scheduled'], default: 'user' })
  @IsOptional()
  @IsIn(['user', 'autonomous', 'learning_engine', 'scheduled'])
  origin?: string;

  @ApiPropertyOptional({ example: 'coding_agent' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  assignedAgent?: string;

  @ApiPropertyOptional({ description: 'Project UUID' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ description: 'Parent task UUID for sub-tasks' })
  @IsOptional()
  @IsUUID()
  parentTaskId?: string;
}
