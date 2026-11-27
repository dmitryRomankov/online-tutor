import {
  Body,
  Catch,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../auth/http/auth.guard.js';
import { apiError, invalidSession, rejectedOrigin } from '../../docs/error-response.js';
import { Schedule, ScheduleError } from '../application/schedule.js';

import type { ScheduleErrorCode } from '../application/schedule.js';

const scheduleErrors = {
  schedule_invalid: [400, 'Check the date, start time, and duration.'],
  schedule_forbidden: [403, 'This action is unavailable for your profile.'],
  schedule_missing: [404, 'Booking, student connection, or lesson unavailable.'],
  schedule_conflict: [409, 'This submission ID already belongs to a different booking.'],
  schedule_early: [409, 'Join opens at the scheduled start.'],
  schedule_closed: [409, 'This session is closed for entry.'],
  schedule_unavailable: [503, 'Scheduling is temporarily unavailable. Try again.'],
} as const satisfies Record<ScheduleErrorCode, readonly [number, string]>;

@Catch(ScheduleError)
export class ScheduleErrorFilter implements ExceptionFilter<ScheduleError> {
  catch(error: ScheduleError, host: ArgumentsHost) {
    const [statusCode, message] = scheduleErrors[error.code];
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(statusCode)
      .json({ statusCode, code: error.code, message });
  }
}

class BookingTimes {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) lessonId!: string;
  @ApiProperty({ format: 'date-time' }) scheduledStart!: string;
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 2_147_483_647 }) durationMinutes!: number;
}

class CreateBooking extends BookingTimes {
  @ApiProperty({ format: 'uuid' }) connectionId!: string;
}

class BookingResponse extends BookingTimes {
  @ApiProperty() title!: string;
  @ApiProperty() participantName!: string;
  @ApiProperty({ enum: ['scheduled', 'active', 'ended', 'cancelled'] }) state!: string;
  @ApiProperty() canJoin!: boolean;
  @ApiProperty() canPrepare!: boolean;
}

class ScheduleResponse {
  @ApiProperty({ format: 'date-time' }) serverNow!: string;
  @ApiProperty({ type: [BookingResponse] }) sessions!: BookingResponse[];
}

const problem = (code: keyof typeof scheduleErrors) => ({ code, message: scheduleErrors[code][1] });

@ApiTags('Schedule')
@ApiCookieAuth()
@apiError(401, 'Sign in required.', invalidSession)
@apiError(503, 'Schedule unavailable.', problem('schedule_unavailable'))
@Controller('sessions')
export class ScheduleController {
  constructor(private readonly schedule: Schedule) {}

  @Post()
  @Header('Cache-Control', 'private, no-store')
  @ApiBody({ type: CreateBooking })
  @ApiResponse({ status: 201, type: BookingResponse })
  @apiError(400, 'Invalid booking.', problem('schedule_invalid'))
  @apiError(
    403,
    'Tutor profile and allowed origin required.',
    problem('schedule_forbidden'),
    rejectedOrigin
  )
  @apiError(404, 'Booking, connection, or lesson unavailable.', problem('schedule_missing'))
  @apiError(409, 'Submission already used.', problem('schedule_conflict'))
  create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.schedule.create(request.user, body);
  }

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiResponse({ status: 200, type: ScheduleResponse })
  list(@Req() request: AuthenticatedRequest) {
    return this.schedule.list(request.user);
  }

  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  @ApiResponse({ status: 200, type: BookingResponse })
  @apiError(404, 'Booking unavailable.', problem('schedule_missing'))
  detail(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.schedule.detail(request.user, id);
  }

  @Get(':id/entry')
  @Header('Cache-Control', 'private, no-store')
  @ApiResponse({ status: 200, type: BookingResponse })
  @apiError(403, 'Student profile required.', problem('schedule_forbidden'))
  @apiError(404, 'Booking unavailable.', problem('schedule_missing'))
  @apiError(409, 'Entry is early or closed.', problem('schedule_early'), problem('schedule_closed'))
  entry(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.schedule.studentEntry(request.user, id);
  }
}
