import { createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { Pool } from 'pg';
import { AuthError } from '../application/authentication.js';

const PostgresStore = connectPgSimple(session);

@Injectable()
export class SessionStorage {
  readonly store?: session.Store;
  private readonly pool?: Pool;
  private readonly keySecret: string;
  private nextCleanup = 0;

  constructor(config: ConfigService) {
    const connectionString = config.get<string>('DATABASE_URL');
    this.keySecret = config.get<string>('SESSION_SECRET') ?? '';
    if (!connectionString || this.keySecret.length < 32) return;
    this.pool = new Pool({
      connectionString,
      max: 5,
      connectionTimeoutMillis: 10000,
      query_timeout: 10000,
      idleTimeoutMillis: 30000,
      allowExitOnIdle: true,
    });
    // Connection errors reach callers without exposing connection credentials in logs.
    this.pool.on('error', () => {});
    this.store = new PostgresStore({
      pool: this.pool,
      schemaName: 'private',
      tableName: 'auth_sessions',
      createTableIfMissing: false,
      disableTouch: true,
      pruneSessionInterval: false,
      errorLog: () => {},
    });
  }

  async ready(): Promise<void> {
    if (!this.pool) throw new AuthError('unavailable');
    try {
      await this.pool.query('SELECT sid FROM private.auth_sessions LIMIT 0');
      if (Date.now() >= this.nextCleanup) {
        this.nextCleanup = Date.now() + 15 * 60 * 1000;
        try {
          await this.cleanupExpired();
        } catch {
          this.nextCleanup = 0;
          throw new AuthError('unavailable');
        }
      }
    } catch {
      throw new AuthError('unavailable');
    }
  }

  async consumeAttempt(ip: string): Promise<boolean> {
    if (!this.pool) throw new AuthError('unavailable');
    const key = createHmac('sha256', this.keySecret).update(ip).digest('hex');
    try {
      const result = await this.pool.query<{ attempts: number }>(
        `
        INSERT INTO private.auth_rate_limits AS limits (key_hash, attempts, expires_at)
        VALUES ($1, 1, statement_timestamp() + interval '60 seconds')
        ON CONFLICT (key_hash) DO UPDATE SET
          attempts = CASE WHEN limits.expires_at <= statement_timestamp()
            THEN 1 ELSE LEAST(limits.attempts + 1, 21) END,
          expires_at = CASE WHEN limits.expires_at <= statement_timestamp()
            THEN statement_timestamp() + interval '60 seconds' ELSE limits.expires_at END
        RETURNING attempts`,
        [key]
      );
      return result.rows[0].attempts <= 20;
    } catch {
      throw new AuthError('unavailable');
    }
  }

  async cleanupExpired(): Promise<void> {
    if (!this.pool) throw new AuthError('unavailable');
    await this.pool.query(`DELETE FROM private.auth_sessions WHERE expire < now() AND sid IN
      (SELECT sid FROM private.auth_sessions WHERE expire < now() ORDER BY expire LIMIT 1000)`);
    await this.pool
      .query(`DELETE FROM private.auth_rate_limits WHERE expires_at <= now() AND key_hash IN
      (SELECT key_hash FROM private.auth_rate_limits WHERE expires_at <= now() ORDER BY expires_at LIMIT 1000)`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }
}
