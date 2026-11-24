import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { SocketAdapter } from './realtime/socket.adapter.js';
import { SessionRuntime } from './auth/http/session-runtime.js';

export async function createApp(swaggerUiPath?: string) {
  const app = await NestFactory.create(AppModule);
  configureApp(app, swaggerUiPath);
  return app;
}

export function configureApp(app: INestApplication, swaggerUiPath?: string): void {
  const config = app.get(ConfigService);
  const clientOrigin = config.getOrThrow<string>('CLIENT_ORIGIN');
  const sessions = app.get(SessionRuntime);

  app.setGlobalPrefix('api');
  if (config.get<string>('VERCEL')) app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.use(helmet());
  app.use(sessions.middleware);
  app.enableCors({ origin: clientOrigin, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
  );
  app.useWebSocketAdapter(new SocketAdapter(app, clientOrigin, sessions));
  app.enableShutdownHooks();

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Lesson Workspace API')
      .setDescription(
        'REST API for the one-to-one lesson platform. Authentication uses an HttpOnly session cookie. Mutation requests from browsers must use the configured frontend origin.'
      )
      .setVersion('0.1.0')
      .addCookieAuth('online_tutor.sid')
      .build()
  );
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
    customSwaggerUiPath: swaggerUiPath,
  });
}
