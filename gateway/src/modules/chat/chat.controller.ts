import {
  Controller, Post, Body, Res, UseInterceptors, UploadedFile,
  ParseFilePipeBuilder, HttpCode, HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import type { Response } from 'express';
import { ChatService } from './chat.service';
import { ChatRequestDto } from './dto/chat.dto';
import { ChatUploadDto } from './dto/chat-upload.dto';

@ApiTags('chat')
@ApiBearerAuth()
@Controller('chat')
export class ChatController {
  constructor(private readonly service: ChatService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a message — auto-routed to the best AI provider' })
  @ApiResponse({
    status: 200,
    description: 'AI response with provider/model info and token usage',
  })
  chat(@Body() dto: ChatRequestDto) {
    return this.service.chat(dto);
  }

  @Post('stream')
  @ApiOperation({ summary: 'Streaming chat over SSE (direct provider only — no debate/specialised agents)' })
  async stream(@Body() dto: ChatRequestDto, @Res() res: Response) {
    await this.service.streamChat(dto, res);
  }

  @Post('upload')
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Send a message with a file attachment (text files are read into context; images require a vision-capable provider)' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  chatWithFile(
    @Body() dto: ChatUploadDto,
    @UploadedFile(
      new ParseFilePipeBuilder().build({ fileIsRequired: true }),
    )
    file: Express.Multer.File,
  ) {
    return this.service.chatWithAttachment(dto, file);
  }
}
