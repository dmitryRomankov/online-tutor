import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { Authentication } from './application/authentication.js';
import { PrismaAccounts } from './infrastructure/prisma-accounts.js';
import { ArgonPasswords } from './infrastructure/argon-passwords.js';
import { SessionStorage } from './infrastructure/session-storage.js';
import { SessionRuntime } from './http/session-runtime.js';
import { AuthGuard } from './http/auth.guard.js';
import { AuthErrorsFilter } from './http/auth-errors.filter.js';
import { AuthController } from './http/auth.controller.js';

@Module({
  controllers: [AuthController],
  providers: [
    {
      provide: PrismaAccounts,
      useFactory: (config: ConfigService) => new PrismaAccounts(config.get<string>('DATABASE_URL')),
      inject: [ConfigService],
    },
    ArgonPasswords,
    {
      provide: Authentication,
      useFactory: (accounts: PrismaAccounts, passwords: ArgonPasswords) =>
        new Authentication(accounts, passwords),
      inject: [PrismaAccounts, ArgonPasswords],
    },
    SessionStorage,
    SessionRuntime,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: AuthErrorsFilter },
  ],
  exports: [SessionRuntime],
})
export class AuthModule {}
