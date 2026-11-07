import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  const config = app.get(ConfigService);
  const port = config.get<number>('port') ?? 3000;
  const env = config.get<string>('env') ?? 'development';

  // API versioning
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Global prefix
  app.setGlobalPrefix('api');

  // CORS
  app.enableCors({
    origin: config.get<string[]>('cors.origins'),
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,          // strip unknown properties
      forbidNonWhitelisted: true,
      transform: true,          // auto-transform types
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new AllExceptionsFilter());

  // Global logging interceptor
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Swagger — only in non-production
  if (env !== 'production') {
    const doc = new DocumentBuilder()
      .setTitle('AI OS — Gateway API')
      .setDescription('AI Operating System API Gateway')
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('health', 'Service health & readiness')
      .addTag('providers', 'AI model providers management')
      .addTag('tasks', 'Task creation & tracking')
      .addTag('chat', 'Chat with AI models')
      .build();

    const document = SwaggerModule.createDocument(app, doc);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });

    Logger.log(`Swagger docs → http://localhost:${port}/docs`, 'Bootstrap');
  }

  await app.listen(port);
  Logger.log(`AI OS Gateway running on port ${port} [${env}]`, 'Bootstrap');
}

bootstrap();
