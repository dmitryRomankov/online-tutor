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
  afterAll(async () => { await app.close(); });

  it('exposes liveness without external credentials', async () => {
    await request(app.getHttpServer()).get('/api/health').expect(200).expect({ status: 'ok', service: 'api' });
  });

  it('publishes OpenAPI for the actual route', async () => {
    const response = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(response.body.paths['/api/health'].get).toBeDefined();
  });

  it('allows credentialed browser requests from the configured client origin', async () => {
    await request(app.getHttpServer()).options('/api/health')
      .set('Origin', 'http://localhost:3000').set('Access-Control-Request-Method', 'GET')
      .expect('Access-Control-Allow-Origin', 'http://localhost:3000')
      .expect('Access-Control-Allow-Credentials', 'true').expect(204);
  });

  it('does not reflect an untrusted browser origin', async () => {
    const response = await request(app.getHttpServer()).get('/api/health').set('Origin', 'https://untrusted.example');
    expect(response.headers['access-control-allow-origin']).not.toBe('https://untrusted.example');
  });
});
