import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString, IsBoolean, IsNumber, IsOptional,
  IsInt, Min, Max, MaxLength,
} from 'class-validator';

export class CreateProviderDto {
  @ApiProperty({ example: 'claude' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ description: 'Raw API key — encrypted before storage' })
  @IsOptional()
  @IsString()
  apiKey?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ default: 5, minimum: 1, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  priority?: number;

  @ApiPropertyOptional({ example: 'claude-sonnet-4-6' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  modelDefault?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  costPer1k?: number;

  @ApiPropertyOptional({ default: 1000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  rateLimit?: number;

  @ApiPropertyOptional({ example: 'gpt' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  fallbackTo?: string;
}
