import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './config/environment.js';
import { HealthController } from './health/health.controller.js';
import { ClassroomGateway } from './realtime/classroom.gateway.js';
import { ConnectionsModule } from './connections/connections.module.js';
import { TasksModule } from './tasks/tasks.module.js';
import { AuthModule } from './auth/auth.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    AuthModule,
    ConnectionsModule,
    TasksModule,
  ],
  controllers: [HealthController],
  providers: [ClassroomGateway],
})
export class AppModule {}
