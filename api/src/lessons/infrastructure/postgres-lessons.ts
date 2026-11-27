import { Pool } from 'pg';
import type { PoolClient } from 'pg';
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
      return { kind: 'task', taskVersionId: row.task_version_id };
  }
}

export class PostgresLessons implements LessonRepository, LessonImageRepository {
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
        `SELECT kind_code,text_content,link_url,asset_id,task_version_id
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
           ARRAY(SELECT label FROM public.task_choices WHERE task_version_id=v.id ORDER BY position) AS choices
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
        const {
          rows: [saved],
        } = await client.query<{ id: string }>(
          'INSERT INTO public.lesson_versions(lesson_id,version_no,title) VALUES($1,$2,$3) RETURNING id',
          [id, version, input.title]
        );
        await client.query(
          `INSERT INTO public.lesson_items(lesson_version_id,position,kind_code,text_content,link_url,asset_id,task_version_id)
           SELECT $1,position,item->>'kind',item->>'text',item->>'url',
                  (item->>'assetId')::uuid,(item->>'taskVersionId')::uuid
           FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS blocks(item,position)`,
          [saved.id, JSON.stringify(input.items)]
        );
        await client.query(
          'UPDATE public.lesson_versions SET published_at=clock_timestamp() WHERE id=$1',
          [saved.id]
        );
        await client.query('COMMIT');
        return { ...input, id, version, versionId: saved.id };
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
