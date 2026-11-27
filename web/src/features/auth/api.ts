import { apiUrl } from '@/lib/api';

export type ProfileRole = 'TUTOR' | 'STUDENT';
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  lastname: string;
  role: ProfileRole;
}
export interface Credentials {
  email: string;
  password: string;
}
export interface Registration extends Credentials {
  name: string;
  lastname: string;
  role: ProfileRole;
}

export type RegistrationField = 'name' | 'lastname' | 'email' | 'password' | 'role';

export class AuthApiError extends Error {
  constructor(
    readonly status: number,
    readonly fields: Partial<Record<RegistrationField, string>> = {}
  ) {
    super('Authentication request failed');
  }
}

async function authRequest(path: string, options: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(`${apiUrl}/auth/${path}`, {
      credentials: 'include',
      cache: 'no-store',
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new AuthApiError(0);
  }
}

function isAuthUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== 'object') return false;
  const user = value as Record<string, unknown>;
  return (
    typeof user.id === 'string' &&
    typeof user.email === 'string' &&
    typeof user.name === 'string' &&
    typeof user.lastname === 'string' &&
    (user.role === 'TUTOR' || user.role === 'STUDENT')
  );
}

async function readUser(response: Response): Promise<AuthUser> {
  if (!response.ok) {
    const fields: Partial<Record<RegistrationField, string>> = {};
    if (response.status === 400) {
      const body: unknown = await response.json().catch(() => null);
      const messages =
        body && typeof body === 'object' && 'message' in body ? body.message : undefined;
      const hints = {
        name: 'Use 1-100 characters: letters, spaces, hyphens or apostrophes.',
        lastname: 'Use 1-100 characters: letters, spaces, hyphens or apostrophes.',
        email: 'Enter a valid email address.',
        password: 'Use at least 5 characters.',
        role: 'Choose Tutor or Student.',
      };
      for (const field of Object.keys(hints) as RegistrationField[]) {
        if (
          Array.isArray(messages) &&
          messages.some((message) => typeof message === 'string' && message.startsWith(`${field} `))
        )
          fields[field] = hints[field];
      }
    }
    throw new AuthApiError(response.status, fields);
  }
  const body: unknown = await response.json().catch(() => null);
  const user = body && typeof body === 'object' && 'user' in body ? body.user : undefined;
  if (!isAuthUser(user)) throw new AuthApiError(502);
  return user;
}

export async function getCurrentUser(signal?: AbortSignal): Promise<AuthUser | null> {
  const response = await authRequest('me', { signal });
  return response.status === 401 ? null : readUser(response);
}

export async function signIn(credentials: Credentials, signal?: AbortSignal): Promise<AuthUser> {
  return readUser(
    await authRequest('login', { method: 'POST', body: JSON.stringify(credentials), signal })
  );
}

export async function registerAccount(
  registration: Registration,
  signal?: AbortSignal
): Promise<AuthUser> {
  return readUser(
    await authRequest('register', { method: 'POST', body: JSON.stringify(registration), signal })
  );
}

export async function signOut(): Promise<void> {
  const response = await authRequest('logout', { method: 'POST' });
  if (!response.ok) throw new AuthApiError(response.status);
}

export const dashboardPath = (role: ProfileRole) => (role === 'TUTOR' ? '/tutor' : '/student');

const ErrorStatus = {
  0: 'Could not connect. Check your internet connection and try again.',
  401: 'Email or password is incorrect.',
  409: 'An account with this email already exists. Sign in or use another email.',
  429: 'Too many attempts. Please wait a minute and try again.',
  400: 'Check your name, lastname, email, password and profile type, then try again.',
  403: 'This request could not be verified. Reload the page and try again.',
};

type ErrorStatusKey = keyof typeof ErrorStatus;

export function authErrorMessage(error: unknown): string {
  const isValidErrorStatus = error instanceof AuthApiError && error.status in ErrorStatus;

  return isValidErrorStatus
    ? ErrorStatus[error.status as ErrorStatusKey]
    : 'Authentication is temporarily unavailable. Please try again shortly.';
}
