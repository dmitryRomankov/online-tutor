import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { createApp } from './app.js';

async function bootstrap() {
  const app = await createApp();
  const config = app.get(ConfigService);
  await app.listen(config.getOrThrow<number>('PORT'), config.get<string>('HOST') ?? '0.0.0.0');
  Logger.log(`API listening at ${await app.getUrl()}/api`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
