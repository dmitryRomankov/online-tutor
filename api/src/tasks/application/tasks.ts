import { z } from 'zod';
import type { UserIdentity } from '../../auth/application/authentication.js';

const taskFields = {
  title: z.string().trim().min(1).max(200),
  prompt: z.string().trim().min(1).max(5000),
};

const singleChoice = z.strictObject({
  ...taskFields,
  type: z.literal('single_choice').default('single_choice'),
  choices: z.array(z.string().trim().min(1).max(500)).min(2).max(50),
  correctChoiceIndex: z.number().int().min(0),
});

const acceptedAnswers = z
  .array(z.string().trim().min(1).max(500))
  .min(1)
  .max(20)
  .refine(
    (answers) => new Set(answers.map((answer) => answer.toLowerCase())).size === answers.length
  );

const fillBlanks = z.strictObject({
  ...taskFields,
  type: z.literal('fill_blanks'),
  passage: z.string().trim().min(1).max(5000),
  blanks: z.array(acceptedAnswers).min(1).max(50),
});

const writtenResponse = z.strictObject({
  ...taskFields,
  type: z.literal('written_response'),
});

const taskContent = z.union([singleChoice, fillBlanks, writtenResponse]);

function validContent(task: TaskContent) {
  if (task.type === 'single_choice') return task.correctChoiceIndex < task.choices.length;

  if (task.type === 'written_response') return true;

  const markers = [...task.passage.matchAll(/\[(\d+)\]/g)];
  return (
    markers.length === task.blanks.length &&
    markers.every((match, index) => match[1] === String(index + 1))
  );
}

const version = { expectedVersion: z.number().int().positive() };
const createTask = taskContent.refine(validContent);
const editTask = z
  .union([
    singleChoice.extend(version),
    fillBlanks.extend(version),
    writtenResponse.extend(version),
  ])
  .refine(validContent);

export type SingleChoiceContent = z.infer<typeof singleChoice>;
export type TaskContent = z.infer<typeof taskContent>;
export type TaskType = TaskContent['type'];
export const taskTypes = [
  'single_choice',
  'fill_blanks',
  'written_response',
] as const satisfies readonly TaskType[];
export type TaskSummary = {
  id: string;
  versionId: string;
  version: number;
  title: string;
  type: TaskType;
};
export type Task = TaskSummary & TaskContent;

export interface TaskRepository {
  list(ownerId: string): Promise<TaskSummary[]>;
  find(ownerId: string, id: string): Promise<Task | undefined>;
  save(
    ownerId: string,
    input: TaskContent,
    edit?: { id: string; expectedVersion: number }
  ): Promise<Task>;
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
