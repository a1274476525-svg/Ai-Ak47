import { Module } from '@nestjs/common';
import { BudgetController } from './budget.controller';

@Module({
  controllers: [BudgetController],
})
export class BudgetModule {}
