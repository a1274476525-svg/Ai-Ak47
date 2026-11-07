import { Controller, Get, Post, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ApprovalsService } from './approvals.service';

@ApiTags('approvals')
@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get()
  @ApiOperation({ summary: 'List pending / decided actions awaiting human approval' })
  list(@Query('status') status?: string) {
    return this.approvals.list(status);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve a queued risky action and execute it' })
  approve(@Param('id') id: string) {
    return this.approvals.approve(id);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject a queued risky action — it will not run' })
  reject(@Param('id') id: string) {
    return this.approvals.reject(id);
  }
}
