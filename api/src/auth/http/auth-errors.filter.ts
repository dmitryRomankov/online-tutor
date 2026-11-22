import { Catch } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { AuthError } from '../application/authentication.js';

const errors = {
  invalid_input: { status: 400, message: 'Email, password or profile type is invalid.' },
  invalid_credentials: {
    status: 401,
    message: 'Authentication required or credentials are invalid.',
  },
  duplicate_email: { status: 409, message: 'Email is already taken.' },
  unavailable: { status: 503, message: 'Authentication is temporarily unavailable.' },
};

@Catch(AuthError)
export class AuthErrorsFilter implements ExceptionFilter<AuthError> {
  catch(error: AuthError, host: ArgumentsHost): void {
    const result = errors[error.reason];
    host.switchToHttp().getResponse<Response>().status(result.status).json({
      statusCode: result.status,
      code: error.reason,
      message: result.message,
    });
  }
}
