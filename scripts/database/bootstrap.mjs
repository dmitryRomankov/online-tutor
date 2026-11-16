import { connect, isMain, literal, identifier } from './lib.mjs';

// Administrator-only provisioning; ordinary migrations never need CREATEROLE.
export async function bootstrap(client, passwords) {
  await client.query('BEGIN');
  try {
    for (const role of ['tutor_owner', 'tutor_migrator', 'tutor_app', 'tutor_reporter']) {
      if (!(await client.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role])).rowCount) {
        await client.query(
          `CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`
        );
      }
      // Refuse adoption of an existing privileged account instead of silently modifying it.
      const {
        rows: [existing],
      } = await client.query(
        'SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=$1',
        [role]
      );
      if (Object.values(existing).some(Boolean))
        throw new Error(`Refusing privileged existing role: ${role}`);
      if (role === 'tutor_owner') await client.query('ALTER ROLE tutor_owner NOLOGIN');
      if (role !== 'tutor_owner') {
        const password = passwords[role];
        if (!password || password.length < 16)
          throw new Error(`Supply a password of at least 16 characters for ${role}`);
        await client.query(`ALTER ROLE ${role} LOGIN PASSWORD ${literal(password)}`);
      }
    }
    const memberships = await client.query(
      "SELECT member::regrole::text AS member, roleid::regrole::text AS parent FROM pg_auth_members WHERE member IN ('tutor_app'::regrole,'tutor_reporter'::regrole,'tutor_owner'::regrole,'tutor_migrator'::regrole)"
    );
    if (memberships.rows.some((r) => r.member !== 'tutor_migrator' || r.parent !== 'tutor_owner'))
      throw new Error('Unexpected database role membership; review manually');
    await client.query('GRANT tutor_owner TO tutor_migrator');
    const database = (await client.query('SELECT current_database() AS name')).rows[0].name;
    await client.query(`REVOKE TEMPORARY ON DATABASE ${identifier(database)} FROM PUBLIC`);
    await client.query('ALTER SCHEMA public OWNER TO tutor_owner');
    await client.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
if (isMain(import.meta.url)) {
  const client = await connect(process.env.ADMIN_DATABASE_URL);
  try {
    await bootstrap(client, {
      tutor_migrator: process.env.MIGRATOR_PASSWORD,
      tutor_app: process.env.APP_PASSWORD,
      tutor_reporter: process.env.REPORTER_PASSWORD,
    });
    console.log('Database roles provisioned. Credentials were not printed.');
  } finally {
    await client.end();
  }
}
