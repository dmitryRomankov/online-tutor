import { Catch, Module } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import type { Response } from 'express';
import { LessonImages, LessonImageStorage } from './application/lesson-images.js';
import { LessonError, Lessons } from './application/lessons.js';
import { SessionVersions } from './application/session-versions.js';
import { SessionVersionsController } from './http/session-versions.controller.js';
import { LessonsController } from './http/lessons.controller.js';
import { PostgresLessons } from './infrastructure/postgres-lessons.js';
import { LessonImageInspector, VercelLessonImages } from './infrastructure/vercel-lesson-images.js';

const errors = {
  forbidden: [403, 'Only tutors can manage lessons.'],
  invalid_lesson: [400, 'Check the title, blocks, and access to attached content.'],
  invalid_image: [400, 'Upload a valid PNG, JPEG or WebP image up to 2 MB.'],
  image_too_large: [413, 'Upload an image up to 2 MB.'],
  not_found: [404, 'Lesson content not found.'],
  version_conflict: [409, 'A newer version of this lesson was saved.'],
  task_version_conflict: [409, 'An attached task changed. Review the latest version.'],
  session_conflict: [409, 'This session cannot be started.'],
  unavailable: [503, 'Lesson storage is temporarily unavailable.'],
} as const;

@Catch(LessonError)
class LessonErrorFilter implements ExceptionFilter<LessonError> {
  catch(error: LessonError, host: ArgumentsHost) {
    const [statusCode, message] = errors[error.code];
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(statusCode)
      .json({ statusCode, code: error.code, message });
  }
}

@Module({
  controllers: [LessonsController, SessionVersionsController],
  providers: [
    {
      provide: PostgresLessons,
      useFactory: (config: ConfigService) =>
        new PostgresLessons(config.get<string>('DATABASE_URL')),
      inject: [ConfigService],
    },
    { provide: LessonImageStorage, useClass: VercelLessonImages },
    {
      provide: Lessons,
      useFactory: (repository: PostgresLessons) => new Lessons(repository),
      inject: [PostgresLessons],
    },
    {
      provide: LessonImages,
      useFactory: (repository: PostgresLessons, storage: LessonImageStorage) =>
        new LessonImages(repository, storage, new LessonImageInspector()),
      inject: [PostgresLessons, LessonImageStorage],
    },
    {
      provide: SessionVersions,
      useFactory: (repository: PostgresLessons) => new SessionVersions(repository),
      inject: [PostgresLessons],
    },
    { provide: APP_FILTER, useClass: LessonErrorFilter },
  ],
})
export class LessonsModule {}
