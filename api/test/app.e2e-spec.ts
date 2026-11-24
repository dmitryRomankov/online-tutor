import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('Application HTTP setup', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp();
    app.useLogger(false);
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });

  it('exposes liveness without external credentials', async () => {
    await request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect({ status: 'ok', service: 'api' });
  });

  it('publishes OpenAPI for the actual route', async () => {
    const response = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(response.body.paths['/api/health'].get).toBeDefined();
  });

  it('publishes client request and response contracts for auth and invitations', async () => {
    const { body: spec } = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    const json = 'application/json';
    const schemas = spec.components.schemas;
    const auth = spec.paths['/api/auth/register'].post;
    expect(auth.requestBody.content[json].schema.$ref).toBe('#/components/schemas/RegisterBody');
    expect(schemas.RegisterBody.properties.password).toMatchObject({
      minLength: 5,
      writeOnly: true,
    });
    expect(auth.responses['201'].headers['Set-Cookie']).toBeDefined();
    expect(auth.responses['409'].content[json].examples.duplicate_email.value.statusCode).toBe(409);

    const invites = spec.paths['/api/connections/invitations'];
    expect(invites.post.security).toContainEqual({ cookie: [] });
    expect(invites.post.responses['201'].content[json].schema.$ref).toBe(
      '#/components/schemas/CreatedInvitationResponse'
    );
    expect(schemas.CreatedInvitationResponse.required).toContain('token');
    expect(schemas.InvitationResponse.properties).not.toHaveProperty('token');
    expect(invites.get.responses['200'].content[json].schema.items.$ref).toBe(
      '#/components/schemas/InvitationResponse'
    );

    const accept = spec.paths['/api/connections/invitations/accept'].post;
    expect(accept.requestBody.content[json].schema.$ref).toBe(
      '#/components/schemas/InvitationTokenBody'
    );
    expect(accept.responses['200'].content[json].schema.$ref).toBe(
      '#/components/schemas/ConnectionResponse'
    );
    expect(accept.responses['409'].content[json].examples.already_connected.value.code).toBe(
      'already_connected'
    );
    const revoke = spec.paths['/api/connections/invitations/{id}'].delete;
    expect(revoke.parameters).toContainEqual(
      expect.objectContaining({
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string', format: 'uuid' },
      })
    );
    expect(revoke.responses['204']).not.toHaveProperty('content');
  });

  it('allows credentialed browser requests from the configured client origin', async () => {
    await request(app.getHttpServer())
      .options('/api/health')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'GET')
      .expect('Access-Control-Allow-Origin', 'http://localhost:3000')
      .expect('Access-Control-Allow-Credentials', 'true')
      .expect(204);
  });

  it('does not reflect an untrusted browser origin', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health')
      .set('Origin', 'https://untrusted.example');
    expect(response.headers['access-control-allow-origin']).not.toBe('https://untrusted.example');
  });
});
