import { Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../../auth/http/auth.guard.js';
import { apiError, invalidSession, rejectedOrigin } from '../../docs/error-response.js';
import { SessionVersions } from '../application/session-versions.js';

class PublishedVersionResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: 'integer', minimum: 1 }) number!: number;
  @ApiProperty() title!: string;
  @ApiProperty({ type: 'integer', minimum: 1 }) activityCount!: number;
}

class SessionVersionResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['scheduled', 'active', 'ended', 'cancelled'] }) state!: string;
  @ApiProperty({ type: PublishedVersionResponse, nullable: true })
  version!: PublishedVersionResponse | null;
}

@ApiTags('Session content')
@ApiCookieAuth()
@apiError(401, 'Sign in required.', invalidSession)
@apiError(
  403,
  'Tutor profile and allowed origin required.',
  { code: 'forbidden', message: 'Only tutors can manage lessons.' },
  rejectedOrigin
)
@apiError(404, 'Session unavailable.', { code: 'not_found', message: 'Lesson content not found.' })
@apiError(503, 'Lesson storage unavailable.', {
  code: 'unavailable',
  message: 'Lesson storage is temporarily unavailable.',
})
@Controller('sessions/:id')
export class SessionVersionsController {
  constructor(private readonly versions: SessionVersions) {}

  @Get('content-version')
  @Header('Cache-Control', 'private, no-store')
  @ApiResponse({ status: 200, type: SessionVersionResponse })
  get(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.versions.get(request.user, id);
  }

  @Post('start')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @ApiResponse({ status: 200, type: SessionVersionResponse })
  @apiError(409, 'Session cannot start in its current state.', {
    code: 'session_conflict',
    message: 'This session cannot be started.',
  })
  start(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.versions.start(request.user, id);
  }
}
