import type { Pool, PoolClient } from 'pg';
import type { UserIdentity } from '../../auth/application/authentication.js';
import type { Booking, ScheduleInput, ScheduleRepository } from '../application/schedule.js';
import { ScheduleError } from '../application/schedule.js';

const selection = `
  SELECT s.id, s.tutor_student_id AS "connectionId", s.planned_lesson_id AS "lessonId",
    s.scheduled_start AS "scheduledStart", s.duration_minutes AS "durationMinutes",
    s.state_code AS state, COALESCE(version.title, 'Lesson') AS title,
    concat_ws(' ', other.name, other.lastname) AS "participantName",
    link.ended_at IS NULL AND other.retired_at IS NULL AS connected
  FROM public.sessions s
  JOIN public.tutor_students link ON link.id=s.tutor_student_id
  JOIN public.users other ON other.id=CASE WHEN $2='TUTOR' THEN link.student_id ELSE link.tutor_id END
  LEFT JOIN public.session_content pin ON pin.session_id=s.id
  LEFT JOIN LATERAL (
    SELECT title FROM public.lesson_versions
    WHERE lesson_id=s.planned_lesson_id AND published_at IS NOT NULL
      AND (pin.lesson_version_id IS NULL OR id=pin.lesson_version_id)
    ORDER BY version_no DESC LIMIT 1
  ) version ON true
  WHERE $1::uuid=CASE WHEN $2='TUTOR' THEN link.tutor_id ELSE link.student_id END`;

type Row = Omit<Booking, 'scheduledStart'> & { scheduledStart: Date };
const booking = (row: Row): Booking => ({
  ...row,
  scheduledStart: row.scheduledStart.toISOString(),
});

export class PostgresSchedule implements ScheduleRepository {
  constructor(private readonly pool?: Pool) {}

  async list(actor: UserIdentity) {
    return this.run(async (client) => {
      const { rows } = await client.query<Row>(
        `${selection} AND s.state_code IN ('scheduled','active')
           ORDER BY s.scheduled_start, s.id`,
        [actor.id, actor.role]
      );
      return rows.map(booking);
    });
  }

  find(actor: UserIdentity, id: string) {
    return this.run((client) => this.findOwned(client, actor, id));
  }

  create(tutorId: string, input: ScheduleInput) {
    return this.run(async (client) => {
      const tutor = { id: tutorId, role: 'TUTOR' as const };
      const prior = await this.findOwned(client, tutor, input.id);
      if (prior) return this.matchSubmission(prior, input);

      const result = await client.query(
        `INSERT INTO public.sessions(id,tutor_student_id,planned_lesson_id,scheduled_start,duration_minutes)
         SELECT $1, link.id, lesson.id, $4, $5
         FROM public.tutor_students link
         JOIN public.lessons lesson ON lesson.id=$3 AND lesson.owner_id=link.tutor_id
         WHERE link.id=$2 AND link.tutor_id=$6 AND link.ended_at IS NULL
           AND lesson.archived_at IS NULL
           AND EXISTS (SELECT 1 FROM public.lesson_versions
                       WHERE lesson_id=lesson.id AND published_at IS NOT NULL)
         ON CONFLICT (id) DO NOTHING`,
        [
          input.id,
          input.connectionId,
          input.lessonId,
          input.scheduledStart,
          input.durationMinutes,
          tutorId,
        ]
      );
      const confirmed = await this.findOwned(client, tutor, input.id);
      if (!confirmed) throw new ScheduleError('schedule_missing');
      return result.rowCount ? confirmed : this.matchSubmission(confirmed, input);
    });
  }

  private matchSubmission(current: Booking, input: ScheduleInput) {
    if (
      current.connectionId !== input.connectionId ||
      current.lessonId !== input.lessonId ||
      current.scheduledStart !== input.scheduledStart ||
      current.durationMinutes !== input.durationMinutes
    ) {
      throw new ScheduleError('schedule_conflict');
    }
    return current;
  }

  private async findOwned(
    client: PoolClient,
    actor: Pick<UserIdentity, 'id' | 'role'>,
    id: string
  ) {
    const {
      rows: [row],
    } = await client.query<Row>(`${selection} AND s.id=$3`, [actor.id, actor.role, id]);
    return row && booking(row);
  }

  private async run<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
    let client: PoolClient | undefined;
    try {
      if (!this.pool) throw new ScheduleError('schedule_unavailable');
      client = await this.pool.connect();
      return await action(client);
    } catch (error) {
      if (error instanceof ScheduleError) throw error;
      if (
        error instanceof Error &&
        'code' in error &&
        ['23514', '23503'].includes(String(error.code))
      ) {
        throw new ScheduleError('schedule_missing');
      }
      throw new ScheduleError('schedule_unavailable');
    } finally {
      client?.release();
    }
  }
}
