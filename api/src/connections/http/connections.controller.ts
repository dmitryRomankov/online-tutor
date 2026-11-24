import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';
import type { AuthenticatedRequest } from '../../auth/http/auth.guard.js';
import { Connections } from '../application/connections.js';

import {
  apiError,
  invalidSession,
  rejectedOrigin,
  storageUnavailable,
} from '../../docs/error-response.js';
import {
  ConnectionResponse,
  CreatedInvitationResponse,
  InvitationPreviewResponse,
  InvitationResponse,
  exampleToken,
} from './connection-responses.js';

const wrongRole = { code: 'forbidden', message: 'Your profile type cannot perform this action.' };
const unavailable = apiError(404, 'Invitation is unavailable.', {
  code: 'invitation_unavailable',
  message: 'This invitation is invalid, expired, revoked or already used.',
});
const invalidToken = apiError(400, 'Invalid request body.', {
  error: 'Bad Request',
  message: ['token must be a string'],
});

class InvitationTokenBody {
  @ApiProperty({ pattern: '^[a-f0-9]{64}$', writeOnly: true, example: exampleToken })
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  token!: string;
}

@ApiTags('Connections')
@ApiCookieAuth()
@apiError(401, 'Sign in required.', invalidSession)
@apiError(503, 'Connection or session storage unavailable.', storageUnavailable, {
  code: 'unavailable',
  message: 'Connections are temporarily unavailable. Please try again.',
})
@Controller('connections')
export class ConnectionsController {
  constructor(private readonly connections: Connections) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'List only your active tutor/student connections.' })
  @ApiResponse({ status: 200, type: ConnectionResponse, isArray: true })
  list(@Req() request: AuthenticatedRequest) {
    return this.connections.list(request.user);
  }

  @Post('invitations')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Tutor: create a single-use invitation, valid for seven days. Token returned once.',
  })
  @ApiResponse({ status: 201, type: CreatedInvitationResponse })
  @apiError(403, 'Tutor profile and allowed origin required.', wrongRole, rejectedOrigin)
  create(@Req() request: AuthenticatedRequest) {
    return this.connections.create(request.user);
  }

  @Get('invitations')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Tutor: list your latest 100 invitations without tokens.' })
  @ApiResponse({ status: 200, type: InvitationResponse, isArray: true })
  @apiError(403, 'Tutor profile required.', wrongRole)
  invitations(@Req() request: AuthenticatedRequest) {
    return this.connections.invitations(request.user);
  }

  @Delete('invitations/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Tutor: revoke your unaccepted invitation. Retry is safe.' })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiResponse({
    status: 204,
    description: 'Invitation revoked or already revoked. No response body.',
  })
  @apiError(400, 'Invalid invitation ID.', {
    error: 'Bad Request',
    message: 'Validation failed (uuid is expected)',
  })
  @apiError(403, 'Tutor profile and allowed origin required.', wrongRole, rejectedOrigin)
  @unavailable
  revoke(@Req() request: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.connections.revoke(request.user, id);
  }

  @Post('invitations/preview')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Student: inspect tutor identity without accepting. Token stays out of API URLs.',
  })
  @ApiResponse({ status: 200, type: InvitationPreviewResponse })
  @invalidToken
  @apiError(403, 'Student profile and allowed origin required.', wrongRole, rejectedOrigin)
  @unavailable
  preview(@Req() request: AuthenticatedRequest, @Body() body: InvitationTokenBody) {
    return this.connections.preview(request.user, body.token);
  }

  @Post('invitations/accept')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Student: atomically accept; retries return the same active connection.',
  })
  @ApiResponse({ status: 200, type: ConnectionResponse })
  @invalidToken
  @apiError(403, 'Student profile and allowed origin required.', wrongRole, rejectedOrigin)
  @unavailable
  @apiError(409, 'Student already has another tutor.', {
    code: 'already_connected',
    message: 'You are already connected to another tutor.',
  })
  accept(@Req() request: AuthenticatedRequest, @Body() body: InvitationTokenBody) {
    return this.connections.accept(request.user, body.token);
  }
}
