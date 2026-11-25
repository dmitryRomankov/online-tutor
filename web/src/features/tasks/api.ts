import { z } from 'zod';
import { apiUrl } from '@/lib/api';

const taskType = z.enum(['single_choice', 'fill_blanks']);
const taskIdentity = z.object({
  id: z.uuid(),
  versionId: z.uuid(),
  version: z.number().int().positive(),
  title: z.string(),
});
const summary = taskIdentity.extend({ type: taskType.default('single_choice') });
const choiceTask = taskIdentity.extend({
  type: z.literal('single_choice').default('single_choice'),
  prompt: z.string(),
  choices: z.array(z.string()),
  correctChoiceIndex: z.number().int().nonnegative(),
});
const fillBlanksTask = taskIdentity.extend({
  type: z.literal('fill_blanks'),
  prompt: z.string(),
  passage: z.string(),
  blanks: z.array(z.array(z.string())),
});
const task = z.union([choiceTask, fillBlanksTask]);

export type Task = z.infer<typeof task>;
export type TaskType = Task['type'];
export type SingleChoiceTask = z.infer<typeof choiceTask>;
export type FillBlanksTask = z.infer<typeof fillBlanksTask>;
export type TaskInput =
  | Pick<SingleChoiceTask, 'type' | 'title' | 'prompt' | 'choices' | 'correctChoiceIndex'>
  | Pick<FillBlanksTask, 'type' | 'title' | 'prompt' | 'passage' | 'blanks'>;

export const taskFormatLabels = {
  single_choice: 'Single choice',
  fill_blanks: 'Fill in the blanks',
} satisfies Record<TaskType, string>;

export class TaskApiError extends Error {
  constructor(readonly status: number) {
    super(
      {
        400: 'Check the task fields and its answer configuration.',
        401: 'Your session ended. Sign in again.',
        403: 'Only tutors can manage tasks.',
        404: 'Task not found.',
        409: 'A newer version was saved. Open it from the library before editing again.',
      }[status] ?? 'Tasks are temporarily unavailable. Please try again.'
    );
  }
}

async function request(path: string, options: RequestInit): Promise<unknown> {
  const response = await fetch(`${apiUrl}/tasks${path}`, {
    credentials: 'include',
    cache: 'no-store',
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  if (!response.ok) throw new TaskApiError(response.status);
  return response.json();
}

function requestBody(input: TaskInput, previous?: Task) {
  const body =
    input.type === 'single_choice'
      ? {
          title: input.title,
          prompt: input.prompt,
          choices: input.choices,
          correctChoiceIndex: input.correctChoiceIndex,
        }
      : input;
  return previous ? { ...body, expectedVersion: previous.version } : body;
}

export const tasksApi = {
  list: async (signal?: AbortSignal) => z.array(summary).parse(await request('', { signal })),
  get: async (id: string, signal?: AbortSignal) =>
    task.parse(await request(`/${encodeURIComponent(id)}`, { signal })),
  save: async (input: TaskInput, previous?: Task) =>
    task.parse(
      await request(previous ? `/${previous.id}` : '', {
        method: previous ? 'PUT' : 'POST',
        body: JSON.stringify(requestBody(input, previous)),
      })
    ),
};

export function taskErrorMessage(error: unknown) {
  return error instanceof TaskApiError
    ? error.message
    : 'Could not complete the request. Check your connection and try again.';
}
