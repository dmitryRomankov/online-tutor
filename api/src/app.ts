import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { SocketAdapter } from './realtime/socket.adapter.js';

export async function createApp() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const clientOrigin = config.getOrThrow<string>('CLIENT_ORIGIN');

  app.setGlobalPrefix('api');
  app.use(helmet());
  app.enableCors({ origin: clientOrigin, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useWebSocketAdapter(new SocketAdapter(app, clientOrigin));
  app.enableShutdownHooks();

  const document = SwaggerModule.createDocument(app, new DocumentBuilder()
    .setTitle('Lesson Workspace API')
    .setDescription('REST API for the one-to-one lesson platform. Initial setup: health endpoint.')
    .setVersion('0.1.0')
    .build());
  SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/docs-json' });

  return app;
}
