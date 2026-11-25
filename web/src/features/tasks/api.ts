import { z } from 'zod';
import { apiUrl } from '@/lib/api';

const summary = z.object({
  id: z.uuid(),
  versionId: z.uuid(),
  version: z.number().int().positive(),
  title: z.string(),
});
const task = summary.extend({
  prompt: z.string(),
  choices: z.array(z.string()),
  correctChoiceIndex: z.number().int().nonnegative(),
});

export type Task = z.infer<typeof task>;
export type TaskInput = Pick<Task, 'title' | 'prompt' | 'choices' | 'correctChoiceIndex'>;

export class TaskApiError extends Error {
  constructor(readonly status: number) {
    super(
      {
        400: 'Check the task fields and select one correct answer.',
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

export const tasksApi = {
  list: async (signal?: AbortSignal) => z.array(summary).parse(await request('', { signal })),
  get: async (id: string, signal?: AbortSignal) =>
    task.parse(await request(`/${encodeURIComponent(id)}`, { signal })),
  save: async (input: TaskInput, previous?: Task) =>
    task.parse(
      await request(previous ? `/${previous.id}` : '', {
        method: previous ? 'PUT' : 'POST',
        body: JSON.stringify(previous ? { ...input, expectedVersion: previous.version } : input),
      })
    ),
};

export function taskErrorMessage(error: unknown) {
  return error instanceof TaskApiError
    ? error.message
    : 'Could not complete the request. Check your connection and try again.';
}
