import { connect } from './lib.mjs';

const client = await connect(process.env.DATABASE_URL);
try {
  const sessions = await client.query('DELETE FROM private.auth_sessions WHERE expire < now()');
  const limits = await client.query('DELETE FROM private.auth_rate_limits WHERE expires_at <= now()');
  console.log(`Removed ${sessions.rowCount} expired sessions and ${limits.rowCount} expired authentication counters.`);
} finally {
  await client.end();
}
