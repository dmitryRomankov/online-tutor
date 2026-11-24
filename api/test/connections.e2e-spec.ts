import 'reflect-metadata';
import { jest } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import session from 'express-session';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.js';
import { SessionStorage } from '../src/auth/infrastructure/session-storage.js';
import { PrismaAccounts } from '../src/auth/infrastructure/prisma-accounts.js';
import { MemoryAccounts } from './support/memory-accounts.js';
import { PostgresConnections } from '../src/connections/infrastructure/postgres-connections.js';
import { CryptoInvitationTokens } from '../src/connections/infrastructure/invitation-tokens.js';
import { ConnectionError } from '../src/connections/application/connections.js';
import type { ConnectionRepository } from '../src/connections/application/connections.js';

const token = 'a'.repeat(64);
const tutorId = randomUUID();
const invitation = { id: randomUUID(), expiresAt: '2026-12-01T00:00:00.000Z', status: 'pending' as const };
const person = { id: tutorId, name: 'Alex', lastname: 'Rivera' };
const repository = {
  create: jest.fn<ConnectionRepository['create']>(), invitations: jest.fn<ConnectionRepository['invitations']>(),
  revoke: jest.fn<ConnectionRepository['revoke']>(), preview: jest.fn<ConnectionRepository['preview']>(),
  accept: jest.fn<ConnectionRepository['accept']>(), connections: jest.fn<ConnectionRepository['connections']>(),
};

describe('US03 HTTP boundaries', () => {
  let app: INestApplication;
  let tutor: string;
  let student: string;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaAccounts).useValue(new MemoryAccounts())
      .overrideProvider(PostgresConnections).useValue(repository)
      .overrideProvider(SessionStorage).useValue({ store: new session.MemoryStore(), ready: async () => {}, consumeAttempt: async () => true })
      .overrideProvider(ConfigService).useValue(new ConfigService({
        CLIENT_ORIGIN: 'http://localhost:3000', SESSION_SECRET: 'isolated-connections-test-secret-32-characters',
      })).compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app); await app.init();
    async function register(role: string) {
      const result = await request(app.getHttpServer()).post('/api/auth/register').send({
        name: 'Alex', lastname: 'Rivera', email: randomUUID()+'@example.test', password: 'abcde', role,
      }).expect(201);
      return result.headers['set-cookie'][0].split(';')[0];
    }
    tutor = await register('TUTOR'); student = await register('STUDENT');
  });
  beforeEach(() => {
    jest.clearAllMocks();
    repository.create.mockResolvedValue(invitation);
    repository.invitations.mockResolvedValue([invitation]);
    repository.revoke.mockResolvedValue();
    repository.preview.mockResolvedValue({ tutor: person, expiresAt: invitation.expiresAt, accepted: false });
    repository.accept.mockResolvedValue({ id: randomUUID(), person, linkedAt: new Date().toISOString() });
    repository.connections.mockResolvedValue([]);
  });
  afterAll(async () => { await app?.close(); });

  it('requires authentication for connection data', async () => {
    await request(app.getHttpServer()).get('/api/connections').expect(401);
    expect(repository.connections).not.toHaveBeenCalled();
  });
  it('creates random single-use tokens but passes only hashes to persistence', async () => {
    const result = await request(app.getHttpServer()).post('/api/connections/invitations').set('Cookie', tutor).expect(201);
    expect(result.body.token).toMatch(/^[a-f0-9]{64}$/);
    expect(repository.create.mock.calls[0][1]).toBe(new CryptoInvitationTokens().hash(result.body.token));
    expect(repository.create.mock.calls[0][1]).not.toBe(result.body.token);
    expect(result.headers['cache-control']).toBe('no-store');
  });
  it('denies student invitation management and tutor acceptance/preview', async () => {
    await request(app.getHttpServer()).post('/api/connections/invitations').set('Cookie', student).expect(403);
    await request(app.getHttpServer()).get('/api/connections/invitations').set('Cookie', student).expect(403);
    await request(app.getHttpServer()).delete('/api/connections/invitations/'+invitation.id).set('Cookie', student).expect(403);
    for (const path of ['preview', 'accept']) await request(app.getHttpServer())
      .post('/api/connections/invitations/'+path).set('Cookie', tutor).send({ token }).expect(403);
    expect(repository.accept).not.toHaveBeenCalled();
  });
  it.each([{}, {token: 'bad'}, {token: 123}, {token, studentId: tutorId}])('rejects malformed or privileged acceptance %j', async body => {
    await request(app.getHttpServer()).post('/api/connections/invitations/accept').set('Cookie', student).send(body).expect(400);
    expect(repository.accept).not.toHaveBeenCalled();
  });
  it('previews without accepting and scopes acceptance to signed-in identity', async () => {
    await request(app.getHttpServer()).post('/api/connections/invitations/preview').set('Cookie', student).send({token}).expect(200);
    expect(repository.accept).not.toHaveBeenCalled();
    await request(app.getHttpServer()).post('/api/connections/invitations/accept').set('Cookie', student).send({token}).expect(200);
    expect(repository.accept.mock.calls[0]).toEqual([expect.any(String), new CryptoInvitationTokens().hash(token)]);
  });
  it('returns safe unavailable/conflict errors', async () => {
    repository.accept.mockRejectedValueOnce(new ConnectionError('already_connected'));
    await request(app.getHttpServer()).post('/api/connections/invitations/accept').set('Cookie', student).send({token}).expect(409);
    repository.preview.mockRejectedValueOnce(new ConnectionError('invitation_unavailable'));
    const result = await request(app.getHttpServer()).post('/api/connections/invitations/preview').set('Cookie', student).send({token}).expect(404);
    expect(result.body).not.toHaveProperty('accepted_student_id');
  });
  it('enforces browser origin and validates revoke IDs', async () => {
    await request(app.getHttpServer()).post('/api/connections/invitations').set('Cookie', tutor).set('Origin','https://evil.test').expect(403);
    await request(app.getHttpServer()).delete('/api/connections/invitations/not-a-uuid').set('Cookie', tutor).expect(400);
    expect(repository.revoke).not.toHaveBeenCalled();
  });
  it('lists and revokes with owner identity from session', async () => {
    await request(app.getHttpServer()).get('/api/connections/invitations').set('Cookie', tutor).expect(200, [invitation]);
    await request(app.getHttpServer()).delete('/api/connections/invitations/'+invitation.id).set('Cookie', tutor).expect(204);
    expect(repository.revoke).toHaveBeenCalledWith(expect.any(String), invitation.id);
    const result = await request(app.getHttpServer()).get('/api/connections').set('Cookie', student).expect(200);
    expect(result.body).toEqual([]);
    expect(repository.connections.mock.calls[0][0].role).toBe('STUDENT');
  });
});
