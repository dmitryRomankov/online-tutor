import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { Connections } from './application/connections.js';
import { PostgresConnections } from './infrastructure/postgres-connections.js';
import { CryptoInvitationTokens } from './infrastructure/invitation-tokens.js';
import { ConnectionsController } from './http/connections.controller.js';
import { ConnectionErrorsFilter } from './http/connection-errors.filter.js';

@Module({
  controllers: [ConnectionsController],
  providers: [
    {
      provide: PostgresConnections,
      useFactory: (config: ConfigService) =>
        new PostgresConnections(config.get<string>('DATABASE_URL')),
      inject: [ConfigService],
    },
    {
      provide: Connections,
      useFactory: (repository: PostgresConnections) =>
        new Connections(repository, new CryptoInvitationTokens()),
      inject: [PostgresConnections],
    },
    { provide: APP_FILTER, useClass: ConnectionErrorsFilter },
  ],
})
export class ConnectionsModule {}
