import { z } from 'zod';
import type { UserIdentity } from '../../auth/application/authentication.js';

const httpsLink = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    if (!/^https:\/\/[^\s]+$/u.test(value)) return false;
    try {
      const url = new URL(value);
      return Boolean(url.hostname) && !url.username && !url.password;
    } catch {
      return false;
    }
  });

const lessonItem = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('text'), text: z.string().trim().min(1).max(5000) }),
  z.strictObject({ kind: z.literal('link'), url: httpsLink }),
  z.strictObject({ kind: z.literal('image'), assetId: z.uuid() }),
  z.strictObject({
    kind: z.literal('task'),
    taskVersionId: z.uuid(),
    retainedItemId: z.uuid().optional(),
  }),
]);
const lessonInput = z.strictObject({
  title: z.string().trim().min(1).max(200),
  items: z.array(lessonItem).min(1).max(50),
});
const editLesson = lessonInput.extend({ expectedVersion: z.number().int().positive() });

export type LessonItem = z.infer<typeof lessonItem>;
export type LessonInput = z.infer<typeof lessonInput>;
export type LessonSummary = { id: string; versionId: string; version: number; title: string };
export type Lesson = LessonSummary & LessonInput;
export type LessonEdit = { id: string; expectedVersion: number };
export interface TaskPreview {
  title: string;
  version: number;
  type: string;
  prompt: string;
  passage: string | null;
  choices: string[];
  latest: { versionId: string; version: number; title: string } | null;
}

export interface LessonRepository {
  list(ownerId: string): Promise<LessonSummary[]>;
  find(ownerId: string, id: string): Promise<Lesson | undefined>;
  taskPreview(ownerId: string, versionId: string): Promise<TaskPreview | undefined>;
  save(ownerId: string, input: LessonInput, edit?: LessonEdit): Promise<Lesson>;
}

export class LessonError extends Error {
  constructor(
    readonly code:
      | 'forbidden'
      | 'invalid_lesson'
      | 'invalid_image'
      | 'image_too_large'
      | 'not_found'
      | 'version_conflict'
      | 'task_version_conflict'
      | 'session_conflict'
      | 'session_end_conflict'
      | 'unavailable'
  ) {
    super(code);
  }
}

export function requireTutor(actor: UserIdentity): string {
  if (actor.role !== 'TUTOR') throw new LessonError('forbidden');
  return actor.id;
}

export class Lessons {
  constructor(private readonly repository: LessonRepository) {}

  list(actor: UserIdentity) {
    return this.repository.list(requireTutor(actor));
  }

  async find(actor: UserIdentity, id: string) {
    const lesson = await this.repository.find(requireTutor(actor), id);
    if (!lesson) throw new LessonError('not_found');
    return lesson;
  }

  async taskPreview(actor: UserIdentity, id: string) {
    const task = await this.repository.taskPreview(requireTutor(actor), id);
    if (!task) throw new LessonError('not_found');
    return task;
  }

  create(actor: UserIdentity, body: unknown) {
    const ownerId = requireTutor(actor);
    const parsed = lessonInput.safeParse(body);
    if (!parsed.success) throw new LessonError('invalid_lesson');
    return this.repository.save(ownerId, parsed.data);
  }

  edit(actor: UserIdentity, id: string, body: unknown) {
    const ownerId = requireTutor(actor);
    const parsed = editLesson.safeParse(body);
    if (!parsed.success) throw new LessonError('invalid_lesson');
    const { expectedVersion, ...input } = parsed.data;
    return this.repository.save(ownerId, input, { id, expectedVersion });
  }
}
