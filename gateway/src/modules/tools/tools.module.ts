import { Module } from '@nestjs/common';
import { ToolsController } from './tools.controller';
import { ApprovalsModule } from '../approvals/approvals.module';

@Module({
  imports: [ApprovalsModule],
  controllers: [ToolsController],
})
export class ToolsModule {}
