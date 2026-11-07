import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsArray, ValidateNested,
  IsIn, MaxLength, IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';

export class MessageDto {
  @ApiProperty({ enum: ['user', 'assistant', 'system'] })
  @IsIn(['user', 'assistant', 'system'])
  role: 'user' | 'assistant' | 'system';

  @ApiProperty()
  @IsString()
  content: string;
}

export class ChatRequestDto {
  @ApiProperty({ example: 'Write a Python function that sorts a list of dicts by a key.' })
  @IsString()
  @MaxLength(10000)
  message: string;

  @ApiPropertyOptional({ description: 'Conversation history' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MessageDto)
  history?: MessageDto[];

  @ApiPropertyOptional({ example: 'claude', description: 'Force a specific provider. Omit for auto-routing.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  provider?: string;

  @ApiPropertyOptional({ example: 'coding', enum: ['coding', 'research', 'math', 'creative', 'general'] })
  @IsOptional()
  @IsIn(['coding', 'research', 'math', 'creative', 'general'])
  taskType?: string;

  @ApiPropertyOptional({ description: 'Link this chat to an existing conversation UUID' })
  @IsOptional()
  @IsUUID()
  conversationId?: string;
}
