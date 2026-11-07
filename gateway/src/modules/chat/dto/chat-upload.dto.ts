import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength, IsUUID } from 'class-validator';

/**
 * multipart/form-data fields for POST /chat/upload. `history` arrives as a
 * JSON-encoded string (form fields can't carry nested arrays) and is parsed
 * in ChatService.
 */
export class ChatUploadDto {
  @ApiProperty({ example: 'Summarize this file' })
  @IsString()
  @MaxLength(10000)
  message: string;

  @ApiPropertyOptional({ description: 'JSON-encoded array of {role, content} history messages' })
  @IsOptional()
  @IsString()
  history?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  provider?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  taskType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  conversationId?: string;
}
