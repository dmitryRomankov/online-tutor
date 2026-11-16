import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
export const root = fileURLToPath(new URL('../../', import.meta.url));
dotenv.config({ path: root + 'api/.env', quiet: true });
export async function connect(url) {
  if (!url) throw new Error('Required database URL is missing');
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return client;
}
export async function transaction(client, run) {
  await client.query('BEGIN');
  try {
    const result = await run();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
export const isMain = (url) => process.argv[1] === fileURLToPath(url);
export function identifier(value) {
  return '"' + value.replaceAll('"', '""') + '"';
}
export function literal(value) {
  return "'" + value.replaceAll("'", "''") + "'";
}
