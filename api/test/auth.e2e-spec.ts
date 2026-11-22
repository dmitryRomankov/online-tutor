import 'reflect-metadata';
import { jest } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { Controller, Get } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import session from 'express-session';
import type { SessionData } from 'express-session';
import request from 'supertest';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import pg from 'pg';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.js';
import type { AccountRepository } from '../src/auth/application/authentication.js';
import { PrismaAccounts } from '../src/auth/infrastructure/prisma-accounts.js';
import { ArgonPasswords } from '../src/auth/infrastructure/argon-passwords.js';
import { SessionStorage } from '../src/auth/infrastructure/session-storage.js';
import { MemoryAccounts } from './support/memory-accounts.js';

@Controller('protected-test')
class ProtectedProbe {
  @Get() get() {
    return { protected: true };
  }
}

const PASSWORD = 'long password for tests';
const ORIGIN = 'http://localhost:3000';

describe('US01 and US02 authentication', () => {
  let app: INestApplication;
  let accounts: AccountRepository;
  let memoryAccounts: MemoryAccounts;
  let store: session.MemoryStore;
  let origin: string;
  const storage = {
    ready: jest.fn<() => Promise<void>>(),
    consumeAttempt: jest.fn<() => Promise<boolean>>(),
  };
  const sockets: Socket[] = [];
  const email = () => 'auth.' + randomUUID() + '@example.test';
  const cookieFrom = (cookies: string | string[]) =>
    (Array.isArray(cookies) ? cookies[0] : cookies).split(';')[0];
  const read = (id: string) =>
    new Promise<SessionData>((resolve, reject) =>
      store.get(id, (error, value) =>
        error || !value ? reject(error ?? new Error('Missing session')) : resolve(value)
      )
    );
  const write = (id: string, value: SessionData) =>
    new Promise<void>((resolve, reject) =>
      store.set(id, value, (error) => (error ? reject(error) : resolve()))
    );
  const sessionId = (cookie: string) =>
    decodeURIComponent(cookie.split('=')[1]).slice(2).split('.')[0];

  beforeAll(async () => {
    memoryAccounts = new MemoryAccounts();
    accounts = process.env.AUTH_TEST_DATABASE_URL
      ? new PrismaAccounts(process.env.AUTH_TEST_DATABASE_URL)
      : memoryAccounts;
    store = new session.MemoryStore();
    storage.ready.mockResolvedValue();
    storage.consumeAttempt.mockResolvedValue(true);
    const module = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProtectedProbe],
    })
      .overrideProvider(PrismaAccounts)
      .useValue(accounts)
      .overrideProvider(SessionStorage)
      .useValue({ ...storage, store })
      .overrideProvider(ConfigService)
      .useValue(
        new ConfigService({
          CLIENT_ORIGIN: ORIGIN,
          NODE_ENV: 'test',
          AUTH_SESSION_TTL_SECONDS: 28800,
          SESSION_SECRET: 'isolated-auth-test-signing-secret-32-characters',
        })
      )
      .compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    origin = await app.getUrl();
  });

  afterEach(() => {
    for (const socket of sockets.splice(0)) socket.disconnect();
    storage.ready.mockResolvedValue();
    storage.consumeAttempt.mockResolvedValue(true);
    jest.restoreAllMocks();
  });
  afterAll(async () => {
    await app?.close();
  });

  async function register(role = 'STUDENT') {
    return request(app.getHttpServer())
      .post('/api/auth/register')
      .set('Origin', ORIGIN)
      .send({ name: 'Alex', lastname: 'Rivera', email: email(), password: PASSWORD, role })
      .expect(201);
  }

  function connect(cookie?: string) {
    const socket = io(origin + '/classroom', {
      path: '/api/socket.io',
      transports: ['websocket'],
      reconnection: false,
      timeout: 1500,
      extraHeaders: { Origin: ORIGIN, ...(cookie ? { Cookie: cookie } : {}) },
      autoConnect: false,
    });
    sockets.push(socket);
    return socket;
  }

  function connected(socket: Socket): Promise<void> {
    return new Promise((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
      socket.connect();
    });
  }

  it.each(['TUTOR', 'STUDENT'])('registers %s and opens an authenticated session', async (role) => {
    const result = await register(role);
    const user = result.body.user as { id: string; email: string; role: string };
    expect(user).toEqual({
      id: expect.any(String),
      email: expect.any(String),
      name: 'Alex',
      lastname: 'Rivera',
      role,
    });
    expect(result.headers['set-cookie'][0]).toMatch(/HttpOnly/);
    expect(result.headers['set-cookie'][0]).toMatch(/SameSite=Lax/);
    const account = await accounts.findByEmail(user.email);
    expect(account?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(account?.passwordHash).not.toContain(PASSWORD);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookieFrom(result.headers['set-cookie']))
      .expect(200)
      .expect({ user });
  });

  it('trims international names and canonicalizes email without leaking credentials', async () => {
    const address = email();
    const result = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        name: '  Zoë  ',
        lastname: '  O’Connor-李  ',
        email: `  ${address.toUpperCase()}  `,
        password: PASSWORD,
        role: 'STUDENT',
      })
      .expect(201);
    expect(result.body.user).toEqual({
      id: expect.any(String),
      name: 'Zoë',
      lastname: 'O’Connor-李',
      email: address,
      role: 'STUDENT',
    });
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: ` ${address.toUpperCase()} `, password: PASSWORD })
      .expect(200);
  });

  it.each(['abcde', '     ', '🔑🔑🔑🔑🔑', 'x'.repeat(129)])(
    'accepts a password with at least five characters: %j',
    async (password) => {
      const address = email();
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ name: 'Alex', lastname: 'Rivera', email: address, password, role: 'STUDENT' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: address, password })
        .expect(200);
    }
  );

  it('rejects case-insensitive duplicates, including simultaneous registrations', async () => {
    const name = email();
    const send = (value: string) =>
      request(app.getHttpServer()).post('/api/auth/register').send({
        name: 'Alex',
        lastname: 'Rivera',
        email: value,
        password: PASSWORD,
        role: 'TUTOR',
      });
    const results = await Promise.all([send(name), send(name.toUpperCase())]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
  });

  it.each([
    { name: '' },
    { name: null },
    { lastname: ['Rivera'] },
    { email: 123 },
    { password: null },
    { role: ['TUTOR'] },
    { lastname: '123' },
    { name: 'x'.repeat(101) },
    { role: 'ADMIN' },
    { password: 'four' },
    { email: 'a..b@example.test' },
    { email: 'a@-invalid.test' },
    { email: 'with space' },
    { email: 'retired-reserved' },
    { email: ' ' },
    { authEpoch: 4 },
    { userId: randomUUID() },
  ])('rejects invalid or privileged registration fields %j', async (changes) => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        name: 'Alex',
        lastname: 'Rivera',
        email: email(),
        password: PASSWORD,
        role: 'STUDENT',
        ...changes,
      })
      .expect(400);
  });

  it.each([
    {}, { email: 'user@example.test' }, { password: 'abcde' },
    { email: 123, password: 'abcde' },
    { email: 'user@example.test', password: ['abcde'] },
    { email: 'user@example.test', password: 'abcde', role: 'ADMIN' },
  ])('rejects malformed login requests %j', async (body) => {
    await request(app.getHttpServer()).post('/api/auth/login').send(body).expect(400);
  });

  it('logs in an existing account case-insensitively and rotates its session', async () => {
    const registered = await register();
    const previous = cookieFrom(registered.headers['set-cookie']);
    const loggedIn = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Cookie', previous)
      .send({ email: (registered.body.user.email as string).toUpperCase(), password: PASSWORD })
      .expect(200);
    const next = cookieFrom(loggedIn.headers['set-cookie']);
    expect(next).not.toBe(previous);
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', previous).expect(401);
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', next).expect(200);
  });

  it('allows an existing legacy password while new registration requires 5 characters', async () => {
    const name = email();
    await accounts.create({
      name: 'Alex',
      lastname: 'Rivera',
      email: name,
      role: 'STUDENT',
      passwordHash: await new ArgonPasswords().hash('legacy123'),
    });
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: name, password: 'legacy123' })
      .expect(200);
  });

  it('matches email punctuation literally during login', async () => {
    const name = 'literal.%_' + randomUUID() + '@example.test';
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ name: 'Alex', lastname: 'Rivera', email: name, password: PASSWORD, role: 'TUTOR' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: name, password: PASSWORD })
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: '%', password: PASSWORD })
      .expect(401);
  });

  it('returns the same authentication error for unknown users and wrong passwords', async () => {
    const registered = await register();
    const unknown = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: email(), password: PASSWORD })
      .expect(401);
    const wrong = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: registered.body.user.email, password: 'wrong' })
      .expect(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it('protects HTTP routes by default and rejects forged session cookies', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    await request(app.getHttpServer()).get('/api/protected-test').expect(401);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', 'online_tutor.sid=forged')
      .expect(401);
    const registered = await register();
    await request(app.getHttpServer())
      .get('/api/protected-test')
      .set('Cookie', cookieFrom(registered.headers['set-cookie']))
      .expect(200);
    await request(app.getHttpServer())
      .patch('/api/auth/me')
      .set('Cookie', cookieFrom(registered.headers['set-cookie']))
      .send({ role: 'TUTOR' })
      .expect(404);
  });

  it('logs out idempotently and prevents replay of the previous cookie', async () => {
    const registered = await register();
    const cookie = cookieFrom(registered.headers['set-cookie']);
    const result = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', cookie)
      .expect(204);
    expect(result.headers['set-cookie'][0]).toMatch(/Expires=Thu, 01 Jan 1970/);
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(401);
    await request(app.getHttpServer()).post('/api/auth/logout').set('Cookie', cookie).expect(204);
  });

  it('rejects expired sessions even when a client keeps its cookie', async () => {
    const registered = await register();
    const cookie = cookieFrom(registered.headers['set-cookie']);
    const id = sessionId(cookie);
    const saved = await read(id);
    saved.principal!.expiresAt = Date.now() - 1;
    await write(id, saved);
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(401);
  });

  it('rejects cross-origin browser mutations', async () => {
    for (const endpoint of ['register', 'login', 'logout']) {
      await request(app.getHttpServer())
        .post('/api/auth/' + endpoint)
        .set('Origin', 'https://untrusted.example')
        .send({
          name: 'Alex',
          lastname: 'Rivera',
          email: email(),
          password: PASSWORD,
          role: 'STUDENT',
        })
        .expect(403);
    }
  });

  it('bounds authentication attempts before password hashing', async () => {
    storage.consumeAttempt.mockResolvedValueOnce(false);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: email(), password: PASSWORD })
      .expect(429);
  });

  it('fails closed when session storage is unavailable', async () => {
    storage.ready.mockRejectedValue(new Error('unavailable test store'));
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ name: 'Alex', lastname: 'Rivera', email: email(), password: PASSWORD, role: 'TUTOR' })
      .expect(503);
    await request(app.getHttpServer()).get('/api/health').expect(200);
  });

  it('reports a session-save failure and allows later login to the committed account', async () => {
    const name = email();
    jest
      .spyOn(store, 'set')
      .mockImplementationOnce((_id, _value, callback) =>
        callback?.(new Error('store save failed'))
      );
    const result = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ name: 'Alex', lastname: 'Rivera', email: name, password: PASSWORD, role: 'STUDENT' })
      .expect(503);
    expect(result.headers['set-cookie']).toBeUndefined();
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: name, password: PASSWORD })
      .expect(200);
  });

  it('rejects anonymous classroom connections', async () => {
    await expect(connected(connect())).rejects.toThrow('Unauthorized');
  });

  it('authenticates classroom events and disconnects on logout', async () => {
    const registered = await register();
    const cookie = cookieFrom(registered.headers['set-cookie']);
    const socket = connect(cookie);
    await connected(socket);
    const pong = new Promise((resolve) => socket.once('system:pong', resolve));
    socket.emit('system:ping');
    await expect(pong).resolves.toEqual({ status: 'ok' });
    const disconnected = new Promise((resolve) => socket.once('disconnect', resolve));
    await request(app.getHttpServer()).post('/api/auth/logout').set('Cookie', cookie).expect(204);
    await disconnected;
    await expect(connected(connect(cookie))).rejects.toThrow('Unauthorized');
  });

  it('rejects socket events immediately after session expiry', async () => {
    const registered = await register();
    const cookie = cookieFrom(registered.headers['set-cookie']);
    const socket = connect(cookie);
    await connected(socket);
    const saved = await read(sessionId(cookie));
    saved.principal!.expiresAt = Date.now() - 1;
    await write(sessionId(cookie), saved);
    const disconnected = new Promise((resolve) => socket.once('disconnect', resolve));
    socket.emit('system:ping');
    await disconnected;
    expect(socket.connected).toBe(false);
  });

  it('denies retired accounts and changed authentication epochs', async () => {
    const registered = await register();
    const cookie = cookieFrom(registered.headers['set-cookie']);
    if (process.env.AUTH_TEST_DATABASE_URL) {
      const client = new pg.Client({ connectionString: process.env.AUTH_TEST_DATABASE_URL });
      await client.connect();
      try {
        await client.query('SELECT public.retire_account($1)', [registered.body.user.id]);
      } finally {
        await client.end();
      }
    } else {
      const account = memoryAccounts.accounts.get(registered.body.user.id as string)!;
      account.authEpoch++;
      await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(401);
      account.retired = true;
    }
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: registered.body.user.email, password: PASSWORD })
      .expect(401);
  });

  it('publishes cookie authentication and safe response contracts in OpenAPI', async () => {
    const result = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(result.body.paths['/api/auth/register'].post.responses['201']).toBeDefined();
    expect(result.body.paths['/api/auth/me'].get.security).toEqual([{ cookie: [] }]);
  });

  it('sets Secure cookies behind the Vercel HTTPS proxy', async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaAccounts)
      .useValue(accounts)
      .overrideProvider(SessionStorage)
      .useValue({ ...storage, store })
      .overrideProvider(ConfigService)
      .useValue(
        new ConfigService({
          CLIENT_ORIGIN: 'https://tutor.example',
          NODE_ENV: 'production',
          VERCEL: '1',
          SESSION_SECRET: 'isolated-production-test-signing-secret-32-characters',
        })
      )
      .compile();
    const production = module.createNestApplication({ logger: false });
    configureApp(production);
    await production.init();
    try {
      const result = await request(production.getHttpServer())
        .post('/api/auth/register')
        .set('Origin', 'https://tutor.example')
        .set('X-Forwarded-Proto', 'https')
        .send({
          name: 'Alex',
          lastname: 'Rivera',
          email: email(),
          password: PASSWORD,
          role: 'TUTOR',
        })
        .expect(201);
      expect(result.headers['set-cookie'][0]).toMatch(/; Secure;/);
    } finally {
      await production.close();
    }
  });

  const databaseIt = process.env.AUTH_TEST_DATABASE_URL ? it : it.skip;
  databaseIt('rolls back account creation when credential persistence fails', async () => {
    const name = email();
    await expect(
      accounts.create({
        name: 'Alex',
        lastname: 'Rivera',
        email: name,
        role: 'STUDENT',
        passwordHash: 'invalid hash',
      })
    ).rejects.toThrow();
    await expect(accounts.findByEmail(name)).resolves.toBeUndefined();
  });
});
