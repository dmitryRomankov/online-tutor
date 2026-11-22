import { Injectable, ForbiddenException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { UserIdentity } from '../application/authentication.js';
import { SessionRuntime } from './session-runtime.js';
import { PUBLIC_ROUTE } from './public.js';

export interface AuthenticatedRequest extends Request {
  user: UserIdentity;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionRuntime,
    private readonly config: ConfigService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const origin = request.headers.origin;
      if (
        (origin && origin !== this.config.get<string>('CLIENT_ORIGIN')) ||
        request.headers['sec-fetch-site'] === 'cross-site'
      ) {
        throw new ForbiddenException('Request origin is not allowed.');
      }
    }
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    request.user = await this.sessions.authenticate(request.sessionID);
    return true;
  }
}
