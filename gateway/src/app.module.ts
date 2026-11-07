import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { validationSchema } from './config/validation.schema';
import { DatabaseModule } from './database/database.module';
import { APP_GUARD } from '@nestjs/core';
import { HealthModule } from './modules/health/health.module';
import { ProvidersModule } from './modules/providers/providers.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { ChatModule } from './modules/chat/chat.module';
import { AutonomousModule } from './modules/autonomous/autonomous.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { ToolsModule } from './modules/tools/tools.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { ExtensionsModule } from './modules/extensions/extensions.module';
import { MemoryModule } from './modules/memory/memory.module';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { BudgetModule } from './modules/budget/budget.module';
import { NotificationsModule } from './modules/notifications/notifications.module';

@Module({
  imports: [
    // Config — loaded first, available everywhere
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
      validationOptions: { allowUnknown: true, abortEarly: false },
    }),

    // Rate Limiting
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 10 },   // 10 req/sec
      { name: 'long',  ttl: 60000, limit: 300 },  // 300 req/min
    ]),

    // Infrastructure
    DatabaseModule,

    // Auth
    AuthModule,

    // Feature Modules
    HealthModule,
    ProvidersModule,
    TasksModule,
    ChatModule,
    AutonomousModule,
    ConversationsModule,
    KnowledgeModule,
    ToolsModule,
    AnalyticsModule,
    ExtensionsModule,
    MemoryModule,
    ApprovalsModule,
    BudgetModule,
    NotificationsModule,
  ],
  providers: [
    // Global JWT guard — all routes protected unless decorated with @Public()
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
