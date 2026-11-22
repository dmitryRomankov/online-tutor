import { randomUUID, createHmac } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import type { SessionData } from 'express-session';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.js';
import { SessionStorage } from '../src/auth/infrastructure/session-storage.js';

const databaseDescribe = process.env.AUTH_TEST_DATABASE_URL ? describe : describe.skip;
const SECRET = 'isolated-postgres-session-test-secret-32-characters';

databaseDescribe('PostgreSQL session storage', () => {
  const apps: INestApplication[] = [];
  const stores: SessionStorage[] = [];
  let client: pg.Client;
  const cookieFrom = (cookies: string | string[]) => (Array.isArray(cookies) ? cookies[0] : cookies).split(';')[0];
  const sidFrom = (cookie: string) => decodeURIComponent(cookie.split('=')[1]).slice(2).split('.')[0];
  const get = (store: SessionStorage, sid: string) => new Promise<SessionData | null | undefined>((resolve, reject) =>
    store.store!.get(sid, (error, value) => error ? reject(error) : resolve(value)));

  beforeAll(async () => {
    client = new pg.Client({ connectionString: process.env.AUTH_TEST_DATABASE_URL });
    await client.connect();
    for (let index = 0; index < 2; index++) {
      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(ConfigService).useValue(new ConfigService({
          DATABASE_URL: process.env.AUTH_TEST_DATABASE_URL, SESSION_SECRET: SECRET,
          CLIENT_ORIGIN: 'http://localhost:3000', NODE_ENV: 'test', AUTH_SESSION_TTL_SECONDS: 28800,
        })).compile();
      const app = module.createNestApplication({ logger: false });
      configureApp(app);
      await app.listen(0, '127.0.0.1');
      apps.push(app);
      stores.push(app.get(SessionStorage));
    }
  });
  afterAll(async () => {
    await Promise.all(apps.map(app => app.close()));
    await client?.end();
  });
  beforeEach(async () => { await client.query('DELETE FROM private.auth_rate_limits'); });

  async function register() {
    return request(apps[0].getHttpServer()).post('/api/auth/register').send({
      name: 'Postgres', lastname: 'Session', email: `pg.${randomUUID()}@example.test`,
      password: 'abcde', role: 'STUDENT',
    }).expect(201);
  }

  it('persists a real registration across API instances and revokes rotated/logout cookies', async () => {
    const registered = await register();
    const first = cookieFrom(registered.headers['set-cookie']);
    const sid = sidFrom(first);
    const { rows: [row] } = await client.query('SELECT sess FROM private.auth_sessions WHERE sid=$1', [sid]);
    expect(row.sess.principal.userId).toBe(registered.body.user.id);
    expect(row.sess).not.toHaveProperty('password');
    expect(JSON.stringify(row.sess)).not.toContain(registered.body.user.email);
    await request(apps[1].getHttpServer()).get('/api/auth/me').set('Cookie', first).expect(200).expect(registered.body);
    const login = await request(apps[1].getHttpServer()).post('/api/auth/login').set('Cookie', first)
      .send({ email: registered.body.user.email, password: 'abcde' }).expect(200);
    const next = cookieFrom(login.headers['set-cookie']);
    expect(next).not.toBe(first);
    await request(apps[0].getHttpServer()).get('/api/auth/me').set('Cookie', first).expect(401);
    await request(apps[0].getHttpServer()).post('/api/auth/logout').set('Cookie', next).expect(204);
    await request(apps[1].getHttpServer()).get('/api/auth/me').set('Cookie', next).expect(401);
    expect(await get(stores[1], sidFrom(next))).toBeFalsy();
  });

  it('rejects expired database sessions and expired principals', async () => {
    const registration = await register();
    const cookie = cookieFrom(registration.headers['set-cookie']);
    await client.query("UPDATE private.auth_sessions SET expire=now()-interval '2 seconds' WHERE sid=$1", [sidFrom(cookie)]);
    expect(await get(stores[1], sidFrom(cookie))).toBeFalsy();
    await request(apps[1].getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(401);
    const second = await register();
    const next = cookieFrom(second.headers['set-cookie']);
    await client.query(`UPDATE private.auth_sessions SET sess=jsonb_set(sess::jsonb, '{principal,expiresAt}', '1')::json WHERE sid=$1`, [sidFrom(next)]);
    await request(apps[1].getHttpServer()).get('/api/auth/me').set('Cookie', next).expect(401);
  });

  it('atomically limits concurrent attempts across instances and resets an expired window', async () => {
    const ip = `isolated-${randomUUID()}`;
    const allowed = await Promise.all(Array.from({ length: 40 }, (_, index) => stores[index % 2].consumeAttempt(ip)));
    expect(allowed.filter(Boolean)).toHaveLength(20);
    const key = createHmac('sha256', SECRET).update(ip).digest('hex');
    const { rows: [row] } = await client.query('SELECT * FROM private.auth_rate_limits WHERE key_hash=$1', [key]);
    expect(row.attempts).toBe(21);
    expect(JSON.stringify(row)).not.toContain(ip);
    await client.query("UPDATE private.auth_rate_limits SET expires_at=now()-interval '1 second' WHERE key_hash=$1", [key]);
    expect(await stores[0].consumeAttempt(ip)).toBe(true);
    const { rows: [reset] } = await client.query('SELECT attempts FROM private.auth_rate_limits WHERE key_hash=$1', [key]);
    expect(reset.attempts).toBe(1);
  });

  it('returns HTTP 429 after the shared allowance', async () => {
    for (let index = 0; index < 20; index++) {
      await request(apps[index % 2].getHttpServer()).post('/api/auth/login')
        .send({ email: 'nobody@example.test', password: 'abcde' }).expect(401);
    }
    await request(apps[1].getHttpServer()).post('/api/auth/login')
      .send({ email: 'nobody@example.test', password: 'abcde' }).expect(429);
  });

  it('cleans expired rows while retaining active sessions and counters', async () => {
    const suffix = randomUUID();
    await client.query(`INSERT INTO private.auth_sessions(sid,sess,expire) VALUES
      ($1, '{}', now()-interval '1 day'), ($2, '{}', now()+interval '1 day')`, [`expired-${suffix}`, `active-${suffix}`]);
    const dead = createHmac('sha256', SECRET).update('dead-' + suffix).digest('hex');
    const active = createHmac('sha256', SECRET).update('active-' + suffix).digest('hex');
    await client.query(`INSERT INTO private.auth_rate_limits(key_hash,attempts,expires_at) VALUES
      ($1,1,now()-interval '1 day'), ($2,1,now()+interval '1 day')`, [dead, active]);
    await stores[0].cleanupExpired();
    expect((await client.query('SELECT sid FROM private.auth_sessions WHERE sid=$1', [`expired-${suffix}`])).rowCount).toBe(0);
    expect((await client.query('SELECT sid FROM private.auth_sessions WHERE sid=$1', [`active-${suffix}`])).rowCount).toBe(1);
    expect((await client.query('SELECT key_hash FROM private.auth_rate_limits WHERE key_hash=$1', [dead])).rowCount).toBe(0);
    expect((await client.query('SELECT key_hash FROM private.auth_rate_limits WHERE key_hash=$1', [active])).rowCount).toBe(1);
  });
});
