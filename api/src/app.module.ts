import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './config/environment.js';
import { HealthController } from './health/health.controller.js';
import { ClassroomGateway } from './realtime/classroom.gateway.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment })],
  controllers: [HealthController],
  providers: [ClassroomGateway],
})
export class AppModule {}
