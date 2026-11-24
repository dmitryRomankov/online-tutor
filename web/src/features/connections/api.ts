import { z } from 'zod';
import { apiUrl } from '@/lib/api';

const person = z.object({ id: z.string(), name: z.string(), lastname: z.string() });
const connection = z.object({ id: z.string(), person, linkedAt: z.string() });
const invitation = z.object({
  id: z.string(),
  expiresAt: z.string(),
  status: z.enum(['pending', 'accepted', 'revoked', 'expired']),
});
const preview = z.object({ tutor: person, expiresAt: z.string(), accepted: z.boolean() });
export type Connection = z.infer<typeof connection>;
export type Invitation = z.infer<typeof invitation>;
export class ConnectionApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}
async function request(path: string, options: RequestInit = {}): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/connections${path}`, {
      ...options,
      credentials: 'include',
      cache: 'no-store',
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new ConnectionApiError(0, 'Could not connect. Check your connection and try again.');
  }
  if (!response.ok) {
    const messages: Record<number, string> = {
      400: 'This invitation link is invalid.',
      401: 'Your session ended. Sign in again.',
      403: 'This action is not available for your profile type.',
      404: 'This invitation is invalid, expired, revoked or already used. Ask your tutor for a new link.',
      409: 'You are already connected to another tutor. You cannot accept this invitation.',
    };
    throw new ConnectionApiError(
      response.status,
      messages[response.status] ?? 'Connections are temporarily unavailable. Please try again.'
    );
  }
  return response.status === 204 ? undefined : response.json();
}
export const connectionsApi = {
  list: async (signal?: AbortSignal) => z.array(connection).parse(await request('', { signal })),
  invitations: async (signal?: AbortSignal) =>
    z.array(invitation).parse(await request('/invitations', { signal })),
  create: async () =>
    invitation
      .extend({ token: z.string().regex(/^[a-f0-9]{64}$/) })
      .parse(await request('/invitations', { method: 'POST' })),
  revoke: async (id: string) => {
    await request(`/invitations/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  preview: async (token: string, signal?: AbortSignal) =>
    preview.parse(
      await request('/invitations/preview', {
        method: 'POST',
        body: JSON.stringify({ token }),
        signal,
      })
    ),
  accept: async (token: string) =>
    connection.parse(
      await request('/invitations/accept', {
        method: 'POST',
        body: JSON.stringify({ token }),
      })
    ),
};
export function connectionError(error: unknown) {
  return error instanceof ConnectionApiError
    ? error.message
    : 'Could not load connections. Please try again.';
}
