import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import { TaskError } from '../application/tasks.js';
import type {
  SingleChoiceTask,
  TaskSchema,
  TaskRepository,
  TaskSummary,
} from '../application/tasks.js';

type ChoiceRow = { label: string; correct: boolean };

export class PostgresTasks implements TaskRepository {
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
    return this.run(async (client) => {
      const { rows } = await client.query<TaskSummary>(
        `SELECT t.id,v.id AS "versionId",v.version_no AS version,v.title
         FROM public.tasks t
         JOIN LATERAL (
           SELECT id,version_no,title,type_code FROM public.task_versions
           WHERE task_id=t.id AND published_at IS NOT NULL ORDER BY version_no DESC LIMIT 1
         ) v ON v.type_code='single_choice'
         WHERE t.owner_id=$1 AND t.archived_at IS NULL
         ORDER BY t.created_at DESC,t.id`,
        [ownerId]
      );
      return rows;
    });
  }

  find(ownerId: string, id: string) {
    return this.run(async (client) => {
      const { rows } = await client.query<TaskSummary & { prompt: string; options: ChoiceRow[] }>(
        `SELECT t.id,v.id AS "versionId",v.version_no AS version,v.title,v.prompt,options.choices AS options
         FROM public.tasks t
         JOIN LATERAL (
           SELECT id,version_no,title,prompt,type_code FROM public.task_versions
           WHERE task_id=t.id AND published_at IS NOT NULL ORDER BY version_no DESC LIMIT 1
         ) v ON v.type_code='single_choice'
         CROSS JOIN LATERAL (
           SELECT json_agg(json_build_object('label',c.label,'correct',k.choice_id IS NOT NULL)
                           ORDER BY c.position) AS choices
           FROM public.task_inputs i
           JOIN public.task_input_choices ic ON ic.input_id=i.id
           JOIN public.task_choices c ON c.id=ic.choice_id
           LEFT JOIN private.task_choice_keys k ON k.input_id=i.id AND k.choice_id=c.id
           WHERE i.task_version_id=v.id
         ) options
         WHERE t.owner_id=$1 AND t.id=$2 AND t.archived_at IS NULL`,
        [ownerId, id]
      );
      const row = rows[0];
      if (!row) return undefined;
      const { options, ...task } = row;
      return {
        ...task,
        choices: options.map((choice) => choice.label),
        correctChoiceIndex: options.findIndex((choice) => choice.correct),
      };
    });
  }

  save(ownerId: string, input: TaskSchema, edit?: { id: string; expectedVersion: number }) {
    return this.run(async (client) => {
      await client.query('BEGIN');
      try {
        const task = await this.writeVersion(client, ownerId, input, edit);
        await client.query('COMMIT');
        return task;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  private async writeVersion(
    client: PoolClient,
    ownerId: string,
    content: TaskSchema,
    edit?: { id: string; expectedVersion: number }
  ): Promise<SingleChoiceTask> {
    // Match account retirement's lock order before locking or creating a task.
    const owner = await client.query(
      "SELECT id FROM public.users WHERE id=$1 AND role_code='TUTOR' AND retired_at IS NULL FOR UPDATE",
      [ownerId]
    );
    if (!owner.rowCount) throw new TaskError('forbidden');

    const id =
      edit?.id ??
      (
        await client.query<{ id: string }>(
          'INSERT INTO public.tasks(owner_id) VALUES($1) RETURNING id',
          [ownerId]
        )
      ).rows[0].id;
    const version = edit ? await this.nextVersion(client, ownerId, edit) : 1;
    const {
      rows: [saved],
    } = await client.query<{ id: string }>(
      `INSERT INTO public.task_versions(task_id,version_no,type_code,title,prompt)
       VALUES($1,$2,'single_choice',$3,$4) RETURNING id`,
      [id, version, content.title, content.prompt]
    );
    const {
      rows: [input],
    } = await client.query<{ id: string }>(
      `INSERT INTO public.task_inputs(task_version_id,position,kind_code,label)
       VALUES($1,1,'single_choice',$2) RETURNING id`,
      [saved.id, content.prompt]
    );
    await client.query(
      `INSERT INTO public.task_choices(task_version_id,position,label)
       SELECT $1,ordinality::int,label FROM unnest($2::text[]) WITH ORDINALITY AS items(label,ordinality)`,
      [saved.id, content.choices]
    );
    await client.query(
      `INSERT INTO public.task_input_choices(input_id,choice_id)
       SELECT $1,id FROM public.task_choices WHERE task_version_id=$2`,
      [input.id, saved.id]
    );
    await client.query(
      `INSERT INTO private.task_choice_keys(input_id,choice_id)
       SELECT $1,id FROM public.task_choices WHERE task_version_id=$2 AND position=$3`,
      [input.id, saved.id, content.correctChoiceIndex + 1]
    );
    await client.query(
      'UPDATE public.task_versions SET published_at=clock_timestamp() WHERE id=$1',
      [saved.id]
    );
    return { ...content, id, versionId: saved.id, version };
  }

  private async nextVersion(
    client: PoolClient,
    ownerId: string,
    edit: { id: string; expectedVersion: number }
  ) {
    const task = await client.query(
      'SELECT id FROM public.tasks WHERE id=$1 AND owner_id=$2 AND archived_at IS NULL FOR UPDATE',
      [edit.id, ownerId]
    );
    if (!task.rowCount) throw new TaskError('not_found');
    const { rows } = await client.query<{
      version_no: number;
      type_code: string;
      published: boolean;
    }>(
      `SELECT version_no,type_code,published_at IS NOT NULL AS published FROM public.task_versions
       WHERE task_id=$1 ORDER BY version_no DESC`,
      [edit.id]
    );
    const current = rows.find((row) => row.published);
    if (!current || current.type_code !== 'single_choice') throw new TaskError('not_found');
    if (current.version_no !== edit.expectedVersion) throw new TaskError('version_conflict');
    return rows[0].version_no + 1;
  }

  private async run<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
    let client: PoolClient | undefined;
    try {
      if (!this.pool) throw new TaskError('unavailable');
      client = await this.pool.connect();
      return await action(client);
    } catch (error) {
      if (error instanceof TaskError) throw error;
      throw new TaskError('unavailable');
    } finally {
      client?.release();
    }
  }
}
