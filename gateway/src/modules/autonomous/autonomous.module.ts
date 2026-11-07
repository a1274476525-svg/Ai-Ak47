import { Module } from '@nestjs/common';
import { AutonomousController } from './autonomous.controller';
import { AutonomousService } from './autonomous.service';

@Module({
  controllers: [AutonomousController],
  providers:   [AutonomousService],
})
export class AutonomousModule {}
