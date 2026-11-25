import { z } from 'zod';
import type { UserIdentity } from '../../auth/application/authentication.js';

const taskSchema = z.strictObject({
  title: z.string().trim().min(1).max(200),
  prompt: z.string().trim().min(1).max(5000),
  choices: z.array(z.string().trim().min(1).max(500)).min(2).max(50),
  correctChoiceIndex: z.number().int().min(0),
});

const checkChoice = (task: TaskSchema) => task.correctChoiceIndex < task.choices.length;

const createTask = taskSchema.refine(checkChoice);

const editTask = taskSchema
  .extend({ expectedVersion: z.number().int().positive() })
  .refine(checkChoice);

export type TaskSchema = z.infer<typeof taskSchema>;
export type TaskSummary = { id: string; versionId: string; version: number; title: string };
export type SingleChoiceTask = TaskSummary & TaskSchema;

export interface TaskRepository {
  list(ownerId: string): Promise<TaskSummary[]>;
  find(ownerId: string, id: string): Promise<SingleChoiceTask | undefined>;
  save(
    ownerId: string,
    input: TaskSchema,
    edit?: { id: string; expectedVersion: number }
  ): Promise<SingleChoiceTask>;
}

export class TaskError extends Error {
  constructor(
    readonly code: 'forbidden' | 'invalid_task' | 'not_found' | 'version_conflict' | 'unavailable'
  ) {
    super(code);
  }
}

export class Tasks {
  constructor(private readonly repository: TaskRepository) {}

  list(actor: UserIdentity) {
    return this.repository.list(this.tutorId(actor));
  }

  async find(actor: UserIdentity, id: string) {
    const task = await this.repository.find(this.tutorId(actor), id);
    if (!task) throw new TaskError('not_found');
    return task;
  }

  create(actor: UserIdentity, body: unknown) {
    const ownerId = this.tutorId(actor);
    const parsed = createTask.safeParse(body);
    if (!parsed.success) throw new TaskError('invalid_task');
    return this.repository.save(ownerId, parsed.data);
  }

  edit(actor: UserIdentity, id: string, body: unknown) {
    const ownerId = this.tutorId(actor);
    const parsed = editTask.safeParse(body);
    if (!parsed.success) throw new TaskError('invalid_task');
    const { expectedVersion, ...content } = parsed.data;
    return this.repository.save(ownerId, content, { id, expectedVersion });
  }

  private tutorId(actor: UserIdentity) {
    if (actor.role !== 'TUTOR') throw new TaskError('forbidden');
    return actor.id;
  }
}
