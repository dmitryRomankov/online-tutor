import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import { TaskError, taskTypes } from '../application/tasks.js';
import type {
  SingleChoiceContent,
  Task,
  TaskContent,
  TaskRepository,
  TaskSummary,
  TaskType,
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
        `SELECT t.id,v.id AS "versionId",v.version_no AS version,v.title,v.type_code AS type
         FROM public.tasks t
         JOIN LATERAL (
           SELECT id,version_no,title,type_code FROM public.task_versions
           WHERE task_id=t.id AND published_at IS NOT NULL ORDER BY version_no DESC LIMIT 1
         ) v ON v.type_code=ANY($2::text[])
         WHERE t.owner_id=$1 AND t.archived_at IS NULL
         ORDER BY t.created_at DESC,t.id`,
        [ownerId, taskTypes]
      );
      return rows;
    });
  }

  find(ownerId: string, id: string) {
    return this.run(async (client): Promise<Task | undefined> => {
      const {
        rows: [row],
      } = await client.query<TaskSummary & { prompt: string; passage: string | null }>(
        `SELECT t.id,v.id AS "versionId",v.version_no AS version,v.title,v.type_code AS type,v.prompt,v.passage
         FROM public.tasks t
         JOIN LATERAL (
           SELECT id,version_no,title,prompt,passage,type_code FROM public.task_versions
           WHERE task_id=t.id AND published_at IS NOT NULL ORDER BY version_no DESC LIMIT 1
         ) v ON v.type_code=ANY($3::text[])
         WHERE t.owner_id=$1 AND t.id=$2 AND t.archived_at IS NULL`,
        [ownerId, id, taskTypes]
      );
      if (!row) return undefined;

      const { passage, type, ...task } = row;
      if (type === 'written_response') return { ...task, type };
      if (type === 'fill_blanks') {
        const { rows } = await client.query<{ label: string; answers: string[] }>(
          `SELECT i.label, array_agg(k.accepted_text ORDER BY k.variant_no) AS answers
           FROM public.task_inputs i JOIN private.task_text_keys k ON k.input_id=i.id
           WHERE i.task_version_id=$1 GROUP BY i.id ORDER BY i.position`,
          [task.versionId]
        );
        return {
          ...task,
          type,
          passage:
            passage ??
            rows
              .map(({ label }, index) => `${label.replace(/\[\d+\]/g, '').trim()} [${index + 1}]`)
              .join('\n'),
          blanks: rows.map(({ answers }) => answers),
        };
      }

      const { rows: options } = await client.query<ChoiceRow>(
        `SELECT c.label,k.choice_id IS NOT NULL AS correct
         FROM public.task_inputs i
         JOIN public.task_input_choices ic ON ic.input_id=i.id
         JOIN public.task_choices c ON c.id=ic.choice_id
         LEFT JOIN private.task_choice_keys k ON k.input_id=i.id AND k.choice_id=c.id
         WHERE i.task_version_id=$1 ORDER BY c.position`,
        [task.versionId]
      );
      return {
        ...task,
        type,
        choices: options.map((choice) => choice.label),
        correctChoiceIndex: options.findIndex((choice) => choice.correct),
      };
    });
  }

  save(ownerId: string, input: TaskContent, edit?: { id: string; expectedVersion: number }) {
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
    content: TaskContent,
    edit?: { id: string; expectedVersion: number }
  ): Promise<Task> {
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
    const version = edit ? await this.nextVersion(client, ownerId, edit, content.type) : 1;
    const {
      rows: [saved],
    } = await client.query<{ id: string }>(
      `INSERT INTO public.task_versions(task_id,version_no,type_code,title,prompt,passage)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
      [
        id,
        version,
        content.type,
        content.title,
        content.prompt,
        content.type === 'fill_blanks' ? content.passage : null,
      ]
    );
    if (content.type === 'fill_blanks') await this.writeBlanks(client, saved.id, content.blanks);
    else if (content.type === 'single_choice') await this.writeChoices(client, saved.id, content);
    else {
      await client.query(
        `INSERT INTO public.task_inputs(task_version_id,position,kind_code,label,required)
         VALUES($1,1,'text',$2,true)`,
        [saved.id, content.prompt]
      );
    }

    await client.query(
      'UPDATE public.task_versions SET published_at=clock_timestamp() WHERE id=$1',
      [saved.id]
    );
    return { ...content, id, versionId: saved.id, version };
  }

  private async writeBlanks(client: PoolClient, versionId: string, blanks: string[][]) {
    await client.query(
      `INSERT INTO public.task_inputs(task_version_id,position,kind_code,label)
       SELECT $1,number::int,'text','Blank ' || number
       FROM generate_series(1,$2::int) AS number`,
      [versionId, blanks.length]
    );
    await client.query(
      `INSERT INTO private.task_text_keys(input_id,variant_no,accepted_text)
       SELECT i.id,variant.number::int,variant.answer
       FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS blank(answers,number)
       JOIN public.task_inputs i ON i.task_version_id=$1 AND i.position=blank.number
       CROSS JOIN LATERAL jsonb_array_elements_text(blank.answers) WITH ORDINALITY AS variant(answer,number)`,
      [versionId, JSON.stringify(blanks)]
    );
  }

  private async writeChoices(client: PoolClient, versionId: string, content: SingleChoiceContent) {
    const {
      rows: [input],
    } = await client.query<{ id: string }>(
      `INSERT INTO public.task_inputs(task_version_id,position,kind_code,label)
       VALUES($1,1,'single_choice',$2) RETURNING id`,
      [versionId, content.prompt]
    );
    await client.query(
      `INSERT INTO public.task_choices(task_version_id,position,label)
       SELECT $1,ordinality::int,label FROM unnest($2::text[]) WITH ORDINALITY AS items(label,ordinality)`,
      [versionId, content.choices]
    );
    await client.query(
      `INSERT INTO public.task_input_choices(input_id,choice_id)
       SELECT $1,id FROM public.task_choices WHERE task_version_id=$2`,
      [input.id, versionId]
    );
    await client.query(
      `INSERT INTO private.task_choice_keys(input_id,choice_id)
       SELECT $1,id FROM public.task_choices WHERE task_version_id=$2 AND position=$3`,
      [input.id, versionId, content.correctChoiceIndex + 1]
    );
  }

  private async nextVersion(
    client: PoolClient,
    ownerId: string,
    edit: { id: string; expectedVersion: number },
    type: TaskType
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
    if (!current || !taskTypes.some((supported) => supported === current.type_code))
      throw new TaskError('not_found');
    if (current.type_code !== type) throw new TaskError('invalid_task');
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
