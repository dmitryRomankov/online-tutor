import { validateEnvironment } from '../src/config/environment.js';

describe('Environment schema', () => {
  it('provides local defaults without external credentials', () => {
    expect(validateEnvironment({})).toEqual({
      PORT: 3001,
      CLIENT_ORIGIN: 'http://localhost:3000',
      AUTH_SESSION_TTL_SECONDS: 28800,
    });
  });

  it('normalizes configured numbers and preserves unrelated environment variables', () => {
    expect(validateEnvironment({
      PORT: '443', CLIENT_ORIGIN: 'https://tutor.example',
      AUTH_SESSION_TTL_SECONDS: '604800', SESSION_SECRET: 'x'.repeat(32), NODE_ENV: 'production',
    })).toMatchObject({ PORT: 443, AUTH_SESSION_TTL_SECONDS: 604800, NODE_ENV: 'production' });
  });

  it('treats empty optional settings as defaults', () => {
    expect(validateEnvironment({ PORT: '', CLIENT_ORIGIN: '', AUTH_SESSION_TTL_SECONDS: '', SESSION_SECRET: '' }))
      .toMatchObject({ PORT: 3001, CLIENT_ORIGIN: 'http://localhost:3000', AUTH_SESSION_TTL_SECONDS: 28800 });
  });

  it.each([
    { PORT: '0' }, { PORT: '65536' }, { PORT: '1.5' }, { PORT: 'invalid' },
    { CLIENT_ORIGIN: 'not-a-url' }, { CLIENT_ORIGIN: 'ftp://example.com' },
    { CLIENT_ORIGIN: 'https://example.com/' }, { CLIENT_ORIGIN: 'https://example.com/path' },
    { CLIENT_ORIGIN: 'https://user:password@example.com' },
    { AUTH_SESSION_TTL_SECONDS: '0' }, { AUTH_SESSION_TTL_SECONDS: '604801' },
    { AUTH_SESSION_TTL_SECONDS: '1.5' }, { SESSION_SECRET: 'too-short' },
  ])('rejects invalid configuration %j', (values) => {
    expect(() => validateEnvironment(values)).toThrow('Invalid environment configuration:');
  });

  it('never includes secret values in validation errors', () => {
    expect(() => validateEnvironment({ SESSION_SECRET: 'private-secret' }))
      .toThrow('Invalid environment configuration: SESSION_SECRET.');
  });
});
