import { z } from 'zod';
import { apiUrl } from '@/lib/api';

const link = z
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
  }, 'Enter a valid HTTPS link.');

const block = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), text: z.string().trim().min(1, 'Enter text.').max(5000) }),
  z.object({ kind: z.literal('link'), url: link }),
  z.object({ kind: z.literal('image'), assetId: z.uuid('Upload an image for this block.') }),
  z.object({
    kind: z.literal('task'),
    taskVersionId: z.uuid('Choose a task.'),
    retainedItemId: z.uuid().optional(),
  }),
]);

export const lessonInputSchema = z.object({
  title: z.string().trim().min(1, 'Enter a lesson title.').max(200),
  items: z.array(block).min(1, 'Add at least one activity.').max(50),
});

const summary = z.object({
  id: z.uuid(),
  versionId: z.uuid(),
  version: z.number().int().positive(),
  title: z.string(),
});
const lesson = summary.extend({ items: z.array(block) });
const taskPreview = z.object({
  title: z.string(),
  version: z.number(),
  type: z.string(),
  prompt: z.string(),
  passage: z.string().nullable(),
  choices: z.array(z.string()),
  latest: z
    .object({ versionId: z.uuid(), version: z.number().int().positive(), title: z.string() })
    .nullable(),
});

export type Lesson = z.infer<typeof lesson>;
export type LessonInput = z.infer<typeof lessonInputSchema>;
export type LessonItem = LessonInput['items'][number];
export const maxImageBytes = 2 * 1024 * 1024;

export class LessonApiError extends Error {
  constructor(
    readonly status: number,
    message?: string,
    readonly code?: string
  ) {
    super(message ?? 'The request could not be completed. Please try again.');
  }
}

async function request(path: string, options: RequestInit = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    credentials: 'include',
    cache: 'no-store',
    ...options,
  });
  if (!response.ok) {
    const messages: Record<number, string> = {
      400: 'Check the lesson fields and access to attached content.',
      401: 'Your session ended. Sign in again.',
      403: 'Only tutors can manage lessons.',
      404: 'Lesson content not found.',
      409: 'A newer version was saved. Reopen the lesson from the library.',
      413: 'Upload an image up to 2 MB.',
      503: 'Lesson storage is temporarily unavailable. Please try again.',
    };
    const payload = await response.json().catch(() => null);
    const specific: Record<string, string> = {
      invalid_image: 'Upload a valid PNG, JPEG or WebP image up to 2 MB.',
      task_version_conflict: 'A task changed. Review the latest version below before saving.',
      session_conflict: 'This session cannot be started.',
    };
    throw new LessonApiError(
      response.status,
      specific[payload?.code] ?? messages[response.status],
      payload?.code
    );
  }
  return response;
}

export const lessonImageUrl = (id: string) => `${apiUrl}/lessons/images/${encodeURIComponent(id)}`;

export function lessonErrorMessage(error: unknown) {
  return error instanceof LessonApiError
    ? error.message
    : 'Could not complete the request. Check your connection and try again.';
}

export const lessonsApi = {
  list: async (signal?: AbortSignal) =>
    z.array(summary).parse(await (await request('/lessons', { signal })).json()),
  get: async (id: string, signal?: AbortSignal) =>
    lesson.parse(await (await request(`/lessons/${encodeURIComponent(id)}`, { signal })).json()),
  taskPreview: async (id: string, signal?: AbortSignal) =>
    taskPreview.parse(
      await (await request(`/lessons/tasks/${encodeURIComponent(id)}`, { signal })).json()
    ),
  save: async (input: LessonInput, previous?: Lesson) =>
    lesson.parse(
      await (
        await request(previous ? `/lessons/${previous.id}` : '/lessons', {
          method: previous ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(previous ? { ...input, expectedVersion: previous.version } : input),
        })
      ).json()
    ),
  upload: async (file: File) => {
    if (!file.size || file.size > maxImageBytes)
      throw new LessonApiError(413, 'Upload an image up to 2 MB.');
    const data = new FormData();
    data.append('file', file);
    return z
      .object({ id: z.uuid() })
      .parse(await (await request('/lessons/images', { method: 'POST', body: data })).json());
  },
};

const sessionVersion = z.object({
  id: z.uuid(),
  state: z.enum(['scheduled', 'active', 'ended', 'cancelled']),
  version: z
    .object({
      id: z.uuid(),
      number: z.number().int().positive(),
      title: z.string(),
      activityCount: z.number().int().positive(),
    })
    .nullable(),
});

export const sessionVersionsApi = {
  get: async (id: string, signal?: AbortSignal) =>
    sessionVersion.parse(
      await (
        await request(`/sessions/${encodeURIComponent(id)}/content-version`, { signal })
      ).json()
    ),
  start: async (id: string) =>
    sessionVersion.parse(
      await (await request(`/sessions/${encodeURIComponent(id)}/start`, { method: 'POST' })).json()
    ),
};
