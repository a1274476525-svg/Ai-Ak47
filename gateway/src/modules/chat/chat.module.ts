import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ConversationService } from './conversation.service';

@Module({
  controllers: [ChatController],
  providers: [ChatService, ConversationService],
})
export class ChatModule {}
