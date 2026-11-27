import { z } from 'zod';
import { apiUrl } from '@/lib/api';

const booking = z.object({
  id: z.uuid(),
  lessonId: z.uuid(),
  title: z.string(),
  participantName: z.string(),
  scheduledStart: z.iso.datetime(),
  durationMinutes: z.number().int().positive(),
  state: z.enum(['scheduled', 'active', 'ended', 'cancelled']),
  canJoin: z.boolean(),
  canPrepare: z.boolean(),
});

export type Booking = z.infer<typeof booking>;
export type BookingInput = Pick<
  Booking,
  'id' | 'lessonId' | 'scheduledStart' | 'durationMinutes'
> & { connectionId: string };

export class ScheduleApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

async function request(path: string, options?: RequestInit): Promise<unknown> {
  const response = await fetch(`${apiUrl}/sessions${path}`, {
    credentials: 'include',
    cache: 'no-store',
    ...options,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      response.status === 401
        ? 'Your session ended. Sign in again.'
        : typeof data?.message === 'string'
          ? data.message
          : 'Could not load the schedule. Try again.';
    throw new ScheduleApiError(response.status, message);
  }
  return data;
}

export const scheduleApi = {
  list: async (signal: AbortSignal) =>
    z
      .object({ serverNow: z.iso.datetime(), sessions: z.array(booking) })
      .parse(await request('', { signal })),
  detail: async (id: string, signal: AbortSignal) =>
    booking.parse(await request(`/${encodeURIComponent(id)}`, { signal })),
  entry: async (id: string, signal: AbortSignal) =>
    booking.parse(await request(`/${encodeURIComponent(id)}/entry`, { signal })),
  create: async (input: BookingInput) =>
    booking.parse(
      await request('', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
    ),
};

export function scheduleErrorMessage(error: unknown) {
  return error instanceof ScheduleApiError
    ? error.message
    : 'Could not connect. Check your connection and try again.';
}
