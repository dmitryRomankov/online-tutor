import { Catch, Module } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import type { Response } from 'express';
import { TaskError, Tasks } from './application/tasks.js';
import { TasksController } from './http/tasks.controller.js';
import { PostgresTasks } from './infrastructure/postgres-tasks.js';

const errors = {
  forbidden: [403, 'Only tutors can manage tasks.'],
  invalid_task: [400, 'Check the task fields and its answer configuration.'],
  not_found: [404, 'Task not found.'],
  version_conflict: [409, 'A newer version of this task was saved.'],
  unavailable: [503, 'Tasks are temporarily unavailable.'],
} as const;

@Catch(TaskError)
class TaskErrorFilter implements ExceptionFilter<TaskError> {
  catch(error: TaskError, host: ArgumentsHost) {
    const [statusCode, message] = errors[error.code];
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(statusCode)
      .json({ statusCode, code: error.code, message });
  }
}

@Module({
  controllers: [TasksController],
  providers: [
    {
      provide: PostgresTasks,
      useFactory: (config: ConfigService) => new PostgresTasks(config.get<string>('DATABASE_URL')),
      inject: [ConfigService],
    },
    {
      provide: Tasks,
      useFactory: (repository: PostgresTasks) => new Tasks(repository),
      inject: [PostgresTasks],
    },
    { provide: APP_FILTER, useClass: TaskErrorFilter },
  ],
})
export class TasksModule {}
