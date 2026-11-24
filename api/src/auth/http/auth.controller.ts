import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiProperty, ApiOperation, ApiTags, ApiCookieAuth, ApiResponse } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsString, Length, MinLength } from 'class-validator';
import type { Request, Response } from 'express';
import { Authentication } from '../application/authentication.js';
import type { ProfileRole } from '../application/authentication.js';
import type { AuthenticatedRequest } from './auth.guard.js';
import { Public } from './public.js';
import { SessionRuntime, SESSION_COOKIE } from './session-runtime.js';

import {
  apiError,
  invalidSession,
  rejectedOrigin,
  storageUnavailable,
} from '../../docs/error-response.js';

const authUnavailable = {
  code: 'unavailable',
  message: 'Authentication is temporarily unavailable.',
};
const originError = apiError(403, 'Request origin is not allowed.', rejectedOrigin);
const unavailable = apiError(
  503,
  'Authentication or session storage unavailable.',
  authUnavailable,
  storageUnavailable
);
const rateLimited = apiError(429, 'Authentication attempt limit exceeded.', {
  message: 'Too many authentication attempts. Try again later.',
});
const validationError = { error: 'Bad Request', message: ['password must be a string'] };
const sessionHeader = {
  'Set-Cookie': {
    description: 'Sets or clears the HttpOnly session cookie.',
    schema: { type: 'string' },
  },
};

class LoginBody {
  @ApiProperty({ minLength: 1, maxLength: 254, example: 'alex@example.test' })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value
  )
  @Length(1, 254)
  email!: string;

  @ApiProperty({ writeOnly: true, minLength: 1, example: 'example-password' })
  @IsString()
  @MinLength(1)
  password!: string;
}

class RegisterBody {
  @ApiProperty({
    minLength: 1,
    maxLength: 254,
    format: 'email',
    example: 'alex@example.test',
    description: 'Valid email address; trimmed and lowercase; case-insensitive uniqueness.',
  })
  @IsEmail()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value
  )
  @Length(1, 254)
  email!: string;

  @ApiProperty({
    minLength: 1,
    maxLength: 100,
    example: 'Alex',
    description: 'Trimmed name with letters, spaces, hyphens or apostrophes.',
  })
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @Length(1, 100)
  name!: string;

  @ApiProperty({
    minLength: 1,
    maxLength: 100,
    example: 'Rivera',
    description: 'Trimmed name with letters, spaces, hyphens or apostrophes.',
  })
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @Length(1, 100)
  lastname!: string;

  @ApiProperty({ minLength: 5, writeOnly: true, example: 'example-password' })
  @IsString()
  @MinLength(5)
  password!: string;

  @ApiProperty({ enum: ['TUTOR', 'STUDENT'], example: 'STUDENT' })
  @IsIn(['TUTOR', 'STUDENT'])
  role!: ProfileRole;
}

class UserBody {
  @ApiProperty({ format: 'uuid', example: '9bde4480-bcc5-4159-8c74-304e887bbd67' }) id!: string;
  @ApiProperty({ format: 'email', example: 'alex@example.test' }) email!: string;
  @ApiProperty({ example: 'Alex' }) name!: string;
  @ApiProperty({ example: 'Rivera' }) lastname!: string;
  @ApiProperty({ enum: ['TUTOR', 'STUDENT'], example: 'STUDENT' }) role!: ProfileRole;
}

class AuthResponse {
  @ApiProperty({ type: UserBody }) user!: UserBody;
}

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authentication: Authentication,
    private readonly sessions: SessionRuntime
  ) {}

  @Public()
  @Post('register')
  @ApiResponse({
    status: 201,
    type: AuthResponse,
    headers: sessionHeader,
    description: 'Account created and signed in. Role is permanent.',
  })
  @apiError(409, 'Email is already taken.', {
    code: 'duplicate_email',
    message: 'Email is already taken.',
  })
  @apiError(400, 'Invalid registration.', validationError, {
    code: 'invalid_input',
    message: 'Email, password or profile type is invalid.',
  })
  @originError
  @rateLimited
  @apiError(
    503,
    'Authentication unavailable. If the account was created, sign in when service recovers.',
    authUnavailable,
    storageUnavailable
  )
  async register(@Body() body: RegisterBody, @Req() request: Request) {
    await this.sessions.prepare(request);
    const account = await this.authentication.register(body);
    return { user: await this.sessions.establish(request, account) };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiResponse({ status: 200, type: AuthResponse, headers: sessionHeader })
  @apiError(400, 'Invalid login request.', validationError)
  @apiError(401, 'Invalid credentials or retired account.', invalidSession)
  @originError
  @rateLimited
  @unavailable
  async login(@Body() body: LoginBody, @Req() request: Request) {
    await this.sessions.prepare(request);
    const account = await this.authentication.login(body.email, body.password);
    return { user: await this.sessions.establish(request, account) };
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ security: [{ cookie: [] }, {}] })
  @ApiResponse({
    status: 204,
    description: 'Current session invalidated and cookie cleared.',
    headers: sessionHeader,
  })
  @originError
  @unavailable
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.sessions.logout(request);
    response.clearCookie(SESSION_COOKIE, this.sessions.cookieOptions);
  }

  @Get('me')
  @ApiCookieAuth()
  @ApiResponse({ status: 200, type: AuthResponse })
  @apiError(401, 'Missing, expired, revoked or retired account session.', invalidSession)
  @unavailable
  me(@Req() request: AuthenticatedRequest) {
    return { user: request.user };
  }
}
