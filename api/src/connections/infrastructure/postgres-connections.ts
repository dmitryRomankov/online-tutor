import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import type { UserIdentity } from '../../auth/application/authentication.js';
import { ConnectionError } from '../application/connections.js';
import type {
  Connection,
  ConnectionRepository,
  Invitation,
  InvitationPreview,
} from '../application/connections.js';

type InviteRow = {
  id: string;
  tutor_id: string;
  expires_at: Date;
  revoked_at: Date | null;
  accepted_at: Date | null;
  accepted_student_id: string | null;
  expired: boolean;
};

type LinkRow = { id: string; person_id: string; name: string; lastname: string; linked_at: Date };

const connection = (row: LinkRow): Connection => ({
  id: row.id,
  linkedAt: row.linked_at.toISOString(),
  person: { id: row.person_id, name: row.name, lastname: row.lastname },
});

const invitation = (row: InviteRow): Invitation => ({
  id: row.id,
  expiresAt: row.expires_at.toISOString(),
  status: row.accepted_at
    ? 'accepted'
    : row.revoked_at
      ? 'revoked'
      : row.expired
        ? 'expired'
        : 'pending',
});

export class PostgresConnections implements ConnectionRepository {
  private readonly pool?: Pool;
  constructor(url?: string) {
    if (url) {
      this.pool = new Pool({
        connectionString: url,
        max: 5,
        connectionTimeoutMillis: 10000,
        query_timeout: 10000,
      });
      this.pool.on('error', () => {});
    }
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }

  private async run<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!this.pool) throw new ConnectionError('unavailable');
    let client: PoolClient | undefined;
    try {
      client = await this.pool.connect();
      return await action(client);
    } catch (error) {
      if (error instanceof ConnectionError) throw error;
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === '23514' &&
        'message' in error &&
        error.message === 'Invitation is no longer valid'
      )
        throw new ConnectionError('invitation_unavailable');
      throw new ConnectionError('unavailable');
    } finally {
      client?.release();
    }
  }

  private async transaction<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.run(async (client) => {
      await client.query('BEGIN');
      try {
        const value = await action(client);
        await client.query('COMMIT');
        return value;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  async create(tutorId: string, tokenHash: string) {
    return this.run(async (client) => {
      const { rows } = await client.query<InviteRow>(
        `
        INSERT INTO public.tutor_invitations(tutor_id, token_hash, expires_at)
        VALUES ($1,$2,now()+interval '7 days') RETURNING *, false AS expired`,
        [tutorId, tokenHash]
      );
      return invitation(rows[0]);
    });
  }

  async invitations(tutorId: string) {
    return this.run(async (client) => {
      const { rows } = await client.query<InviteRow>(
        `
        SELECT *, expires_at<=clock_timestamp() AS expired FROM public.tutor_invitations
        WHERE tutor_id=$1 ORDER BY created_at DESC, id DESC LIMIT 100`,
        [tutorId]
      );
      return rows.map(invitation);
    });
  }

  async revoke(tutorId: string, id: string) {
    return this.transaction(async (client) => {
      await client.query('SELECT id FROM public.users WHERE id=$1 FOR UPDATE', [tutorId]);
      const { rows } = await client.query<InviteRow>(
        'SELECT * FROM public.tutor_invitations WHERE id=$1 AND tutor_id=$2 FOR UPDATE',
        [id, tutorId]
      );
      const row = rows[0];
      if (!row || row.accepted_at) throw new ConnectionError('invitation_unavailable');
      if (!row.revoked_at)
        await client.query(
          'UPDATE public.tutor_invitations SET revoked_at=clock_timestamp() WHERE id=$1',
          [id]
        );
    });
  }

  async preview(studentId: string, hash: string): Promise<InvitationPreview> {
    return this.run(async (client) => {
      const { rows } = await client.query<InviteRow & { name: string; lastname: string }>(
        `
        SELECT i.*, i.expires_at<=clock_timestamp() AS expired, u.name, u.lastname
        FROM public.tutor_invitations i JOIN public.users u ON u.id=i.tutor_id
        WHERE i.token_hash=$1 AND u.retired_at IS NULL
          AND (
            i.accepted_at IS NULL
            OR (i.accepted_student_id=$2 AND EXISTS (
              SELECT 1 FROM public.tutor_students l
              WHERE l.tutor_id=i.tutor_id AND l.student_id=$2 AND l.ended_at IS NULL
                AND l.linked_at<=i.accepted_at
            ))
          )`,
        [hash, studentId]
      );
      const row = rows[0];
      if (!row || row.revoked_at || (!row.accepted_at && row.expired))
        throw new ConnectionError('invitation_unavailable');
      return {
        tutor: { id: row.tutor_id, name: row.name, lastname: row.lastname },
        expiresAt: row.expires_at.toISOString(),
        accepted: Boolean(row.accepted_at),
      };
    });
  }

  async accept(studentId: string, hash: string): Promise<Connection> {
    return this.transaction(async (client) => {
      const initial = await client.query<{ tutor_id: string }>(
        'SELECT tutor_id FROM public.tutor_invitations WHERE token_hash=$1',
        [hash]
      );
      const tutorId = initial.rows[0]?.tutor_id;
      if (!tutorId) throw new ConnectionError('invitation_unavailable');
      // Account locks precede invitation/link locks, matching account retirement.
      const users = await client.query<{ id: string; role_code: string; retired_at: Date | null }>(
        `
        SELECT id,role_code,retired_at FROM public.users WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
        [[studentId, tutorId]]
      );

      if (
        !users.rows.some((u) => u.id === studentId && u.role_code === 'STUDENT' && !u.retired_at) ||
        !users.rows.some((u) => u.id === tutorId && u.role_code === 'TUTOR' && !u.retired_at)
      )
        throw new ConnectionError('invitation_unavailable');
      const { rows } = await client.query<InviteRow>(
        `
        SELECT *,expires_at<=clock_timestamp() AS expired FROM public.tutor_invitations WHERE token_hash=$1 FOR UPDATE`,
        [hash]
      );

      const row = rows[0];
      if (row.revoked_at || (row.accepted_at ? row.accepted_student_id !== studentId : row.expired))
        throw new ConnectionError('invitation_unavailable');
      const links = await client.query<{
        id: string;
        tutor_id: string;
        existed_at_acceptance: boolean | null;
      }>(
        `SELECT l.id,l.tutor_id,l.linked_at<=i.accepted_at AS existed_at_acceptance
         FROM public.tutor_students l JOIN public.tutor_invitations i ON i.id=$2
         WHERE l.student_id=$1 AND l.ended_at IS NULL FOR UPDATE OF l`,
        [studentId, row.id]
      );

      const activeLink = links.rows[0];
      if (
        row.accepted_at &&
        (activeLink?.tutor_id !== tutorId || !activeLink.existed_at_acceptance)
      )
        throw new ConnectionError('invitation_unavailable');
      if (activeLink && activeLink.tutor_id !== tutorId)
        throw new ConnectionError('already_connected');

      let linkId = activeLink?.id;
      if (!linkId)
        linkId = (
          await client.query<{ id: string }>(
            `
        INSERT INTO public.tutor_students(tutor_id,student_id,linked_at)
        VALUES($1,$2,clock_timestamp()) RETURNING id`,
            [tutorId, studentId]
          )
        ).rows[0].id;

      if (!row.accepted_at)
        await client.query(
          `
        UPDATE public.tutor_invitations SET accepted_student_id=$1,accepted_at=clock_timestamp() WHERE id=$2`,
          [studentId, row.id]
        );
      const result = await client.query<LinkRow>(
        `
        SELECT l.id,l.linked_at,u.id AS person_id,u.name,u.lastname FROM public.tutor_students l
        JOIN public.users u ON u.id=l.tutor_id WHERE l.id=$1`,
        [linkId]
      );
      return connection(result.rows[0]);
    });
  }
  async connections(actor: UserIdentity) {
    return this.run(async (client) => {
      const { rows } = await client.query<LinkRow>(
        `
        SELECT l.id,l.linked_at,u.id AS person_id,u.name,u.lastname FROM public.tutor_students l
        JOIN public.users u ON u.id=CASE WHEN $2='TUTOR' THEN l.student_id ELSE l.tutor_id END
        WHERE (CASE WHEN $2='TUTOR' THEN l.tutor_id ELSE l.student_id END)=$1::uuid
          AND l.ended_at IS NULL AND u.retired_at IS NULL ORDER BY l.linked_at,l.id`,
        [actor.id, actor.role]
      );
      return rows.map(connection);
    });
  }
}
