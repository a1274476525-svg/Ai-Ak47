import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('database.url'),
        autoLoadEntities: true,
        synchronize: false,           // schema managed by init.sql
        logging: config.get('env') === 'development' ? ['error', 'warn'] : ['error'],
        ssl: config.get('env') === 'production' ? { rejectUnauthorized: false } : false,
        extra: {
          max: 20,                    // connection pool size
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 2000,
        },
      }),
    }),
  ],
})
export class DatabaseModule {}
