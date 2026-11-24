import { Catch } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { ConnectionError } from '../application/connections.js';

const errors = {
  forbidden: { status: 403, message: 'Your profile type cannot perform this action.' },
  invitation_unavailable: {
    status: 404,
    message: 'This invitation is invalid, expired, revoked or already used.',
  },
  already_connected: { status: 409, message: 'You are already connected to another tutor.' },
  unavailable: {
    status: 503,
    message: 'Connections are temporarily unavailable. Please try again.',
  },
};

@Catch(ConnectionError)
export class ConnectionErrorsFilter implements ExceptionFilter<ConnectionError> {
  catch(error: ConnectionError, host: ArgumentsHost) {
    const result = errors[error.code];
    host.switchToHttp().getResponse<Response>().status(result.status).json({
      statusCode: result.status,
      code: error.code,
      message: result.message,
    });
  }
}
