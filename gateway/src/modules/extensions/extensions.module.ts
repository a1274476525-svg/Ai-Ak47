import { Module } from '@nestjs/common';
import { ExtensionsController } from './extensions.controller';

@Module({
  controllers: [ExtensionsController],
})
export class ExtensionsModule {}
