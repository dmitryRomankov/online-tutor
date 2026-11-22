import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiProperty, ApiTags, ApiCookieAuth, ApiResponse } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsString, Length, MinLength } from 'class-validator';
import type { Request, Response } from 'express';
import { Authentication } from '../application/authentication.js';
import type { ProfileRole } from '../application/authentication.js';
import type { AuthenticatedRequest } from './auth.guard.js';
import { Public } from './public.js';
import { SessionRuntime, SESSION_COOKIE } from './session-runtime.js';

class LoginBody {
  @ApiProperty({ maxLength: 254 })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value
  )
  @Length(1, 254)
  email!: string;

  @ApiProperty({ writeOnly: true })
  @IsString()
  @MinLength(1)
  password!: string;
}

class RegisterBody {
  @ApiProperty({
    minLength: 1,
    maxLength: 254,
    description: 'Valid email address; trimmed and lowercase; case-insensitive uniqueness.',
  })
  @IsEmail()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value
  )
  @Length(1, 254)
  email!: string;

  @ApiProperty({ maxLength: 100 })
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @Length(1, 100)
  name!: string;

  @ApiProperty({ maxLength: 100 })
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @Length(1, 100)
  lastname!: string;

  @ApiProperty({ minLength: 5, writeOnly: true })
  @IsString()
  @MinLength(5)
  password!: string;

  @ApiProperty({ enum: ['TUTOR', 'STUDENT'] })
  @IsIn(['TUTOR', 'STUDENT'])
  role!: ProfileRole;
}

class UserBody {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() name!: string;
  @ApiProperty() lastname!: string;
  @ApiProperty({ enum: ['TUTOR', 'STUDENT'] }) role!: ProfileRole;
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
    description: 'Account created and signed in. Role is permanent.',
  })
  @ApiResponse({ status: 409, description: 'Email is already taken.' })
  @ApiResponse({ status: 400, description: 'Invalid fields, password, email or profile type.' })
  @ApiResponse({ status: 429, description: 'Authentication attempt limit exceeded.' })
  @ApiResponse({
    status: 503,
    description:
      'Authentication storage unavailable. If session saving fails after account commit, sign in when storage recovers.',
  })
  async register(@Body() body: RegisterBody, @Req() request: Request) {
    await this.sessions.prepare(request);
    const account = await this.authentication.register(body);
    return { user: await this.sessions.establish(request, account) };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiResponse({ status: 200, type: AuthResponse })
  @ApiResponse({ status: 401, description: 'Invalid credentials or retired account.' })
  @ApiResponse({ status: 429, description: 'Authentication attempt limit exceeded.' })
  async login(@Body() body: LoginBody, @Req() request: Request) {
    await this.sessions.prepare(request);
    const account = await this.authentication.login(body.email, body.password);
    return { user: await this.sessions.establish(request, account) };
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @ApiResponse({ status: 204, description: 'Current session invalidated and cookie cleared.' })
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.sessions.logout(request);
    response.clearCookie(SESSION_COOKIE, this.sessions.cookieOptions);
  }

  @Get('me')
  @ApiCookieAuth()
  @ApiResponse({ status: 200, type: AuthResponse })
  @ApiResponse({
    status: 401,
    description: 'Missing, expired, revoked or retired account session.',
  })
  me(@Req() request: AuthenticatedRequest) {
    return { user: request.user };
  }
}
