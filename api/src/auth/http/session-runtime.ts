import { Injectable, ServiceUnavailableException, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import session from 'express-session';
import type { Request, RequestHandler } from 'express';
import type { SessionData } from 'express-session';
import type { Server, Socket } from 'socket.io';
import { Authentication, AuthError } from '../application/authentication.js';
import type { SessionIdentity, UserIdentity } from '../application/authentication.js';
import { SessionStorage } from '../infrastructure/session-storage.js';

declare module 'express-session' {
  interface SessionData {
    principal?: { userId: string; authEpoch: number; expiresAt: number };
  }
}

export const SESSION_COOKIE = 'online_tutor.sid';

@Injectable()
export class SessionRuntime {
  readonly middleware: RequestHandler;
  readonly cookieOptions;
  private readonly duration: number;
  private readonly configured: boolean;
  private readonly sockets = new Map<string, Set<Socket>>();

  constructor(
    private readonly config: ConfigService,
    private readonly storage: SessionStorage,
    private readonly authentication: Authentication
  ) {
    this.duration = Number(config.get('AUTH_SESSION_TTL_SECONDS') || 28800) * 1000;
    const secret = config.get<string>('SESSION_SECRET');
    this.configured = Boolean(storage.store && secret && secret.length >= 32);
    this.cookieOptions = {
      httpOnly: true,
      secure: config.get('NODE_ENV') === 'production' || Boolean(config.get('VERCEL')),
      sameSite: 'lax' as const,
      path: '/api',
    };
    const handler = this.configured
      ? session({
          name: SESSION_COOKIE,
          secret: secret!,
          store: storage.store,
          resave: false,
          saveUninitialized: false,
          rolling: false,
          cookie: { ...this.cookieOptions, maxAge: this.duration },
        })
      : undefined;
    this.middleware = (request, response, next) => {
      if (!handler || request.path === '/api/health' || request.path?.startsWith('/api/docs'))
        return next();
      void storage
        .ready()
        .then(() => handler(request, response, next))
        .catch(() => next(new ServiceUnavailableException()));
    };
  }

  async prepare(request: Request): Promise<void> {
    if (!this.configured) throw new AuthError('unavailable');
    await this.storage.ready();
    if (!(await this.storage.consumeAttempt(request.ip ?? 'unknown'))) {
      throw new HttpException(
        'Too many authentication attempts. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
  }

  async establish(request: Request, account: SessionIdentity): Promise<UserIdentity> {
    const previousId = request.sessionID;
    await new Promise<void>((resolve, reject) =>
      request.session.regenerate((error) =>
        error ? reject(new AuthError('unavailable')) : resolve()
      )
    );
    this.disconnect(previousId);
    request.session.principal = {
      userId: account.id,
      authEpoch: account.authEpoch,
      expiresAt: Date.now() + this.duration,
    };
    try {
      await new Promise<void>((resolve, reject) =>
        request.session.save((error) => (error ? reject(error) : resolve()))
      );
    } catch {
      await new Promise<void>((resolve) => request.session.destroy(() => resolve()));
      throw new AuthError('unavailable');
    }
    return {
      id: account.id,
      email: account.email,
      name: account.name,
      lastname: account.lastname,
      role: account.role,
    };
  }

  async logout(request: Request): Promise<void> {
    if (!this.configured) throw new AuthError('unavailable');
    const id = request.sessionID;
    if (request.session) {
      await new Promise<void>((resolve, reject) =>
        request.session.destroy((error) =>
          error ? reject(new AuthError('unavailable')) : resolve()
        )
      );
    }
    this.disconnect(id);
  }

  async authenticate(id?: string): Promise<UserIdentity> {
    if (!id || !this.configured) throw new AuthError('invalid_credentials');
    await this.storage.ready();
    const stored = await new Promise<SessionData | null | undefined>((resolve, reject) => {
      this.storage.store!.get(id, (error, value) =>
        error ? reject(new AuthError('unavailable')) : resolve(value)
      );
    });
    if (!stored?.principal || stored.principal.expiresAt <= Date.now())
      throw new AuthError('invalid_credentials');
    return this.authentication.authenticate(stored.principal);
  }

  attach(server: Server): void {
    server.engine.use(this.middleware as Parameters<typeof server.engine.use>[0]);
    const namespace = server.of('/classroom');
    namespace.use((socket, next) => {
      const request = socket.request as Request;
      const origin = request.headers.origin;
      if (origin && origin !== this.config.get<string>('CLIENT_ORIGIN'))
        return next(new Error('Unauthorized'));
      void this.authenticate(request.sessionID)
        .then(() => next())
        .catch(() => next(new Error('Unauthorized')));
    });
    namespace.on('connection', (socket) => this.track(socket));
  }

  private track(socket: Socket): void {
    const id = (socket.request as Request).sessionID;
    const group = this.sockets.get(id) ?? new Set<Socket>();
    this.sockets.set(id, group);
    group.add(socket);
    const verify = () => this.authenticate(id);
    socket.use((_packet, next) => {
      void verify()
        .then(() => next())
        .catch(() => {
          next(new Error('Unauthorized'));
          socket.disconnect(true);
        });
    });
    // Polling also revokes idle sockets across API instances after logout or retirement.
    const timer = setInterval(() => {
      void verify().catch(() => socket.disconnect(true));
    }, 5000);
    timer.unref();
    socket.once('disconnect', () => {
      clearInterval(timer);
      group.delete(socket);
      if (group.size === 0) this.sockets.delete(id);
    });
  }

  private disconnect(id: string): void {
    for (const socket of this.sockets.get(id) ?? []) socket.disconnect(true);
  }
}
