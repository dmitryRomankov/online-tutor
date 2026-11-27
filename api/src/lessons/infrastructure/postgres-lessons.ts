import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import type { SessionVersion, SessionVersionsRepository } from '../application/session-versions.js';
import { LessonError } from '../application/lessons.js';
import type {
  LessonEdit,
  LessonInput,
  LessonItem,
  LessonRepository,
  LessonSummary,
  TaskPreview,
} from '../application/lessons.js';
import type { ImageAsset, LessonImageRepository } from '../application/lesson-images.js';

const latestLesson = `
  SELECT l.id,v.id AS "versionId",v.version_no AS version,v.title
  FROM public.lessons l
  JOIN LATERAL (
    SELECT id,version_no,title FROM public.lesson_versions
    WHERE lesson_id=l.id AND published_at IS NOT NULL ORDER BY version_no DESC LIMIT 1
  ) v ON true
  WHERE l.owner_id=$1 AND l.archived_at IS NULL`;

type ItemRow = {
  id: string;
  kind_code: LessonItem['kind'];
  text_content: string;
  link_url: string;
  asset_id: string;
  task_version_id: string;
};

function toItem(row: ItemRow): LessonItem {
  switch (row.kind_code) {
    case 'text':
      return { kind: 'text', text: row.text_content };
    case 'link':
      return { kind: 'link', url: row.link_url };
    case 'image':
      return { kind: 'image', assetId: row.asset_id };
    case 'task':
      return { kind: 'task', taskVersionId: row.task_version_id, retainedItemId: row.id };
  }
}

export class PostgresLessons
  implements LessonRepository, LessonImageRepository, SessionVersionsRepository
{
  private readonly pool?: Pool;

  constructor(url?: string) {
    if (url) {
      this.pool = new Pool({ connectionString: url, max: 5, connectionTimeoutMillis: 10_000 });
      this.pool.on('error', () => {});
    }
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }

  list(ownerId: string) {
    return this.run(
      async (client) =>
        (
          await client.query<LessonSummary>(`${latestLesson} ORDER BY l.created_at DESC,l.id`, [
            ownerId,
          ])
        ).rows
    );
  }

  find(ownerId: string, id: string) {
    return this.run(async (client) => {
      const {
        rows: [lesson],
      } = await client.query<LessonSummary>(`${latestLesson} AND l.id=$2`, [ownerId, id]);
      if (!lesson) return undefined;
      const { rows } = await client.query<ItemRow>(
        `SELECT id,kind_code,text_content,link_url,asset_id,task_version_id
         FROM public.lesson_items WHERE lesson_version_id=$1 ORDER BY position`,
        [lesson.versionId]
      );
      return { ...lesson, items: rows.map(toItem) };
    });
  }

  taskPreview(ownerId: string, versionId: string) {
    return this.run(async (client) => {
      const {
        rows: [task],
      } = await client.query<TaskPreview>(
        `SELECT v.title,v.prompt,v.type_code AS type,v.version_no AS version,
           CASE WHEN v.type_code='fill_blanks' THEN coalesce(v.passage,(
             SELECT string_agg(regexp_replace(i.label,'[[][0-9]+[]]','','g') || ' [' || i.position || ']',E'\\n' ORDER BY i.position)
             FROM public.task_inputs i WHERE i.task_version_id=v.id
           )) END AS passage,
           ARRAY(SELECT label FROM public.task_choices WHERE task_version_id=v.id ORDER BY position) AS choices,
           (SELECT json_build_object('versionId',id,'version',version_no,'title',title)
            FROM public.task_versions WHERE task_id=t.id AND published_at IS NOT NULL
              AND t.archived_at IS NULL ORDER BY version_no DESC LIMIT 1) AS latest
         FROM public.task_versions v JOIN public.tasks t ON t.id=v.task_id
         WHERE v.id=$2 AND t.owner_id=$1 AND v.published_at IS NOT NULL`,
        [ownerId, versionId]
      );
      return task;
    });
  }

  save(ownerId: string, input: LessonInput, edit?: LessonEdit) {
    return this.run(async (client) => {
      await client.query('BEGIN');
      try {
        const owner = await client.query(
          "SELECT id FROM public.users WHERE id=$1 AND role_code='TUTOR' AND retired_at IS NULL FOR UPDATE",
          [ownerId]
        );
        if (!owner.rowCount) throw new LessonError('forbidden');

        const id =
          edit?.id ??
          (
            await client.query<{ id: string }>(
              'INSERT INTO public.lessons(owner_id) VALUES($1) RETURNING id',
              [ownerId]
            )
          ).rows[0].id;
        const version = edit ? await this.nextVersion(client, ownerId, edit) : 1;
        await this.checkAttachments(client, ownerId, input, edit);
        const {
          rows: [saved],
        } = await client.query<{ id: string }>(
          'INSERT INTO public.lesson_versions(lesson_id,version_no,title) VALUES($1,$2,$3) RETURNING id',
          [id, version, input.title]
        );
        const { rows: blocks } = await client.query<ItemRow>(
          `WITH inserted AS (
           INSERT INTO public.lesson_items(lesson_version_id,position,kind_code,text_content,link_url,asset_id,task_version_id)
           SELECT $1,position,item->>'kind',item->>'text',item->>'url',
                  (item->>'assetId')::uuid,(item->>'taskVersionId')::uuid
           FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS blocks(item,position) ORDER BY position
           RETURNING id,position,kind_code,text_content,link_url,asset_id,task_version_id
           ) SELECT * FROM inserted ORDER BY position`,
          [saved.id, JSON.stringify(input.items)]
        );
        await client.query(
          'UPDATE public.lesson_versions SET published_at=clock_timestamp() WHERE id=$1',
          [saved.id]
        );
        await client.query('COMMIT');
        return { title: input.title, items: blocks.map(toItem), id, version, versionId: saved.id };
      } catch (error) {
        await client.query('ROLLBACK');
        if (
          error instanceof Error &&
          'code' in error &&
          ['23514', '23503'].includes(String(error.code))
        ) {
          throw new LessonError('invalid_lesson');
        }
        throw error;
      }
    });
  }

  private async checkAttachments(
    client: PoolClient,
    ownerId: string,
    input: LessonInput,
    edit?: LessonEdit
  ) {
    const tasks = input.items.filter((item) => item.kind === 'task');
    const retained = tasks.flatMap((item) => (item.retainedItemId ? [item.retainedItemId] : []));
    if (new Set(retained).size !== retained.length) throw new LessonError('invalid_lesson');
    const { rows } = await client.query<{ valid: boolean; current: boolean }>(
      `SELECT CASE WHEN item ? 'retainedItemId' THEN prior.id IS NOT NULL
                   ELSE t.id IS NOT NULL END AS valid,
              (item ? 'retainedItemId' OR v.id=(
                SELECT id FROM public.task_versions WHERE task_id=t.id AND published_at IS NOT NULL
                ORDER BY version_no DESC LIMIT 1
              )) AS current
       FROM jsonb_array_elements($1::jsonb) item
       LEFT JOIN public.task_versions v ON v.id=(item->>'taskVersionId')::uuid AND v.published_at IS NOT NULL
       LEFT JOIN public.tasks t ON t.id=v.task_id AND t.owner_id=$2 AND t.archived_at IS NULL
       LEFT JOIN public.lesson_versions base ON base.lesson_id=$3 AND base.version_no=$4
       LEFT JOIN public.lesson_items prior ON prior.id=(item->>'retainedItemId')::uuid
         AND prior.lesson_version_id=base.id AND prior.task_version_id=v.id`,
      [JSON.stringify(tasks), ownerId, edit?.id, edit?.expectedVersion]
    );
    if (rows.some(({ valid }) => !valid)) throw new LessonError('invalid_lesson');
    if (rows.some(({ current }) => !current)) throw new LessonError('task_version_conflict');
  }

  getSessionVersion(tutorId: string, id: string) {
    return this.run((client) => this.readSessionVersion(client, tutorId, id));
  }

  startSession(tutorId: string, id: string) {
    return this.run(async (client) => {
      await client.query('BEGIN');
      try {
        const read = await this.readSessionVersion(client, tutorId, id);
        if (!read) throw new LessonError('not_found');
        if (read.state === 'scheduled') {
          // The link guard locks both users before the session. Lesson publication locks the tutor.
          await client.query('SELECT private.require_link($1)', [read.linkId]);
        }
        const {
          rows: [session],
        } = await client.query<{ state_code: SessionVersion['state'] }>(
          'SELECT state_code FROM public.sessions WHERE id=$1 FOR UPDATE',
          [id]
        );
        if (session.state_code === 'scheduled') {
          const prepared = await this.readSessionVersion(client, tutorId, id);
          if (!prepared?.version) throw new LessonError('session_conflict');
          await client.query('SELECT public.start_session($1)', [id]);
        } else if (session.state_code !== 'active') {
          throw new LessonError('session_conflict');
        }
        const result = await this.readSessionVersion(client, tutorId, id);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        if (error instanceof Error && 'code' in error && error.code === '23514') {
          throw new LessonError('session_conflict');
        }
        throw error;
      }
    });
  }

  private async readSessionVersion(client: PoolClient, tutorId: string, id: string) {
    const { rows } = await client.query<SessionVersion & { linkId: string }>(
      `SELECT s.id,s.state_code AS state,s.tutor_student_id AS "linkId",
         CASE WHEN v.id IS NOT NULL THEN
           json_build_object('id',v.id,'number',v.version_no,'title',v.title,
             'activityCount',(SELECT count(*) FROM public.lesson_items WHERE lesson_version_id=v.id))
         END AS version
       FROM public.sessions s
       JOIN public.tutor_students link ON link.id=s.tutor_student_id
       LEFT JOIN public.session_content pin ON pin.session_id=s.id
       LEFT JOIN LATERAL (
         SELECT id,version_no,title FROM public.lesson_versions
         WHERE lesson_id=s.planned_lesson_id AND published_at IS NOT NULL
           AND (id=pin.lesson_version_id OR s.state_code='scheduled')
         ORDER BY version_no DESC LIMIT 1
       ) v ON true
       WHERE s.id=$1 AND link.tutor_id=$2`,
      [id, tutorId]
    );
    return rows.at(0);
  }

  private async nextVersion(client: PoolClient, ownerId: string, edit: LessonEdit) {
    const lesson = await client.query(
      'SELECT id FROM public.lessons WHERE id=$1 AND owner_id=$2 AND archived_at IS NULL FOR UPDATE',
      [edit.id, ownerId]
    );
    if (!lesson.rowCount) throw new LessonError('not_found');
    const {
      rows: [versions],
    } = await client.query<{ current: number | null; latest: number }>(
      `SELECT max(version_no) FILTER (WHERE published_at IS NOT NULL) AS current,max(version_no) AS latest
       FROM public.lesson_versions WHERE lesson_id=$1`,
      [edit.id]
    );
    if (versions.current === null) throw new LessonError('not_found');
    if (versions.current !== edit.expectedVersion) throw new LessonError('version_conflict');
    return versions.latest + 1;
  }

  createAsset(ownerId: string, asset: ImageAsset, byteSize: number) {
    return this.run(
      async (client) =>
        (
          await client.query<{ id: string }>(
            `INSERT INTO public.assets(owner_id,object_key,media_type,byte_size) VALUES($1,$2,$3,$4) RETURNING id`,
            [ownerId, asset.objectKey, asset.mediaType, byteSize]
          )
        ).rows[0].id
    );
  }

  findAsset(ownerId: string, id: string) {
    return this.run(async (client) =>
      (
        await client.query<ImageAsset>(
          'SELECT object_key AS "objectKey",media_type AS "mediaType" FROM public.assets WHERE owner_id=$1 AND id=$2',
          [ownerId, id]
        )
      ).rows.at(0)
    );
  }

  private async run<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
    let client: PoolClient | undefined;
    try {
      if (!this.pool) throw new LessonError('unavailable');
      client = await this.pool.connect();
      return await action(client);
    } catch (error) {
      if (error instanceof LessonError) throw error;
      throw new LessonError('unavailable');
    } finally {
      client?.release();
    }
  }
}
