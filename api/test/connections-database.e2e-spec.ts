import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { PostgresConnections } from '../src/connections/infrastructure/postgres-connections.js';
import { CryptoInvitationTokens } from '../src/connections/infrastructure/invitation-tokens.js';
import { Connections } from '../src/connections/application/connections.js';
import { ArgonPasswords } from '../src/auth/infrastructure/argon-passwords.js';
import { PrismaAccounts } from '../src/auth/infrastructure/prisma-accounts.js';

const databaseDescribe = process.env.AUTH_TEST_DATABASE_URL ? describe : describe.skip;
databaseDescribe('US03 PostgreSQL atomic invitations', () => {
  const url = process.env.AUTH_TEST_DATABASE_URL;
  const repository = new PostgresConnections(url);
  const tokens = new CryptoInvitationTokens();
  const service = new Connections(repository, tokens);
  const accounts = new PrismaAccounts(url);
  const database = new pg.Client({ connectionString: url });
  let passwordHash: string;

  beforeAll(async () => {
    await database.connect();
    passwordHash = await new ArgonPasswords().hash('abcde');
  });

  afterAll(async () => {
    await repository.onModuleDestroy();
    await accounts.onModuleDestroy();
    await database.end();
  });

  const user = (role: 'TUTOR' | 'STUDENT') =>
    accounts.create({
      email: randomUUID() + '@example.test',
      name: 'Alex',
      lastname: 'Rivera',
      role,
      passwordHash,
    });
  async function fixture() {
    return { tutor: await user('TUTOR'), student: await user('STUDENT') };
  }

  it('stores only hashes and sets seven-day expiry', async () => {
    const { tutor } = await fixture();
    const value = await service.create(tutor);
    const { rows } = await database.query(
      'SELECT token_hash,extract(epoch from (expires_at-created_at)) AS ttl FROM tutor_invitations WHERE id=$1',
      [value.id]
    );
    expect(rows[0].token_hash).toBe(tokens.hash(value.token));
    expect(Number(rows[0].ttl)).toBe(604800);
    expect(await service.invitations(tutor)).toEqual([
      expect.not.objectContaining({ token: expect.anything(), token_hash: expect.anything() }),
    ]);
  });

  it('accepts repeated concurrent requests once and shows both sides', async () => {
    const { tutor, student } = await fixture();
    const invite = await service.create(tutor);
    expect((await service.preview(student, invite.token)).tutor.id).toBe(tutor.id);
    expect(await service.list(student)).toEqual([]);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => service.accept(student, invite.token))
    );
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect((await service.list(tutor)).map((r) => r.person.id)).toEqual([student.id]);
    expect((await service.list(student)).map((r) => r.person.id)).toEqual([tutor.id]);
    expect((await service.preview(student, invite.token)).accepted).toBe(true);
  });

  it('keeps a used invitation unavailable after its relationship ends', async () => {
    const { tutor, student } = await fixture();
    const otherTutor = await user('TUTOR');
    const invite = await service.create(tutor);
    const original = await service.accept(student, invite.token);
    const close = (id: string) =>
      database.query('UPDATE tutor_students SET ended_at=clock_timestamp() WHERE id=$1', [id]);
    const expectUnavailable = async () => {
      await expect(service.preview(student, invite.token)).rejects.toMatchObject({
        code: 'invitation_unavailable',
      });
      await expect(service.accept(student, invite.token)).rejects.toMatchObject({
        code: 'invitation_unavailable',
      });
    };

    await close(original.id);
    await expectUnavailable();

    const next = await service.create(otherTutor);
    const reassigned = await service.accept(student, next.token);
    await expectUnavailable();
    expect(await service.list(student)).toEqual([reassigned]);

    await close(reassigned.id);
    const fresh = await service.create(tutor);
    await service.accept(student, fresh.token);
    await expectUnavailable();
    expect((await service.preview(student, fresh.token)).accepted).toBe(true);
    expect((await service.invitations(tutor)).find(({ id }) => id === invite.id)?.status).toBe(
      'accepted'
    );
  });

  it('allows exactly one student to consume a shared invitation', async () => {
    const { tutor, student } = await fixture();
    const other = await user('STUDENT');
    const invite = await service.create(tutor);
    const results = await Promise.allSettled([
      service.accept(student, invite.token),
      service.accept(other, invite.token),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toEqual([
      expect.objectContaining({
        reason: expect.objectContaining({ code: 'invitation_unavailable' }),
      }),
    ]);
    expect(await service.list(tutor)).toHaveLength(1);
  });

  it('prevents two tutors racing to connect one student', async () => {
    const { tutor, student } = await fixture();
    const other = await user('TUTOR');
    const first = await service.create(tutor);
    const second = await service.create(other);
    const results = await Promise.allSettled([
      service.accept(student, first.token),
      service.accept(student, second.token),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toEqual([
      expect.objectContaining({ reason: expect.objectContaining({ code: 'already_connected' }) }),
    ]);
    expect(await service.list(student)).toHaveLength(1);
    const count = await database.query(
      'SELECT count(*)::int AS n FROM tutor_invitations WHERE id=ANY($1::uuid[]) AND accepted_at IS NOT NULL',
      [[first.id, second.id]]
    );
    expect(count.rows[0].n).toBe(1);
  });

  it('rejects foreign revocation, expired and revoked tokens without changing links', async () => {
    const { tutor, student } = await fixture();
    const other = await user('TUTOR');
    const invite = await service.create(tutor);
    await expect(service.revoke(other, invite.id)).rejects.toMatchObject({
      code: 'invitation_unavailable',
    });
    await service.revoke(tutor, invite.id);
    await service.revoke(tutor, invite.id);
    await expect(service.accept(student, invite.token)).rejects.toMatchObject({
      code: 'invitation_unavailable',
    });
    const expired = tokens.generate();
    await database.query(
      `INSERT INTO tutor_invitations(tutor_id,token_hash,created_at,expires_at)
      VALUES($1,$2,now()-interval '8 days',now()-interval '1 day')`,
      [tutor.id, tokens.hash(expired)]
    );
    for (const token of [expired, tokens.generate()]) {
      await expect(service.preview(student, token)).rejects.toMatchObject({
        code: 'invitation_unavailable',
      });
      await expect(service.accept(student, token)).rejects.toMatchObject({
        code: 'invitation_unavailable',
      });
    }
    expect(await service.list(student)).toEqual([]);
  });

  it('serializes revocation racing acceptance with one final outcome', async () => {
    const { tutor, student } = await fixture();
    const invite = await service.create(tutor);
    await Promise.allSettled([
      service.revoke(tutor, invite.id),
      service.accept(student, invite.token),
    ]);
    const { rows } = await database.query(
      'SELECT accepted_at,revoked_at FROM tutor_invitations WHERE id=$1',
      [invite.id]
    );
    expect(Boolean(rows[0].accepted_at)).not.toBe(Boolean(rows[0].revoked_at));
    expect(await service.list(student)).toHaveLength(rows[0].accepted_at ? 1 : 0);
  });

  it('hides another student and denies retired tutors and tutor actors', async () => {
    const { tutor, student } = await fixture();
    const other = await user('STUDENT');
    const invite = await service.create(tutor);
    await service.accept(student, invite.token);
    await expect(service.preview(other, invite.token)).rejects.toMatchObject({
      code: 'invitation_unavailable',
    });
    expect(await service.list(other)).toEqual([]);
    expect(() => service.accept(tutor, invite.token)).toThrow('forbidden');
    const pending = await service.create(tutor);
    await database.query('SELECT public.retire_account($1)', [tutor.id]);
    await expect(service.accept(other, pending.token)).rejects.toMatchObject({
      code: 'invitation_unavailable',
    });
    expect(await service.list(student)).toEqual([]);
  });
});
