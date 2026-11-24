import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InvitationScreen } from './invitation-screen';
import { ConnectionsPanel } from './connections-panel';
import { AuthForm } from '@/features/auth/auth-form';
import { authHref, invitationDestination } from '@/features/auth/invitation-links';

const token = 'a'.repeat(64);
const tutor = {
  id: 'tutor',
  name: 'Elena',
  lastname: 'Martin',
  email: 'tutor@example.test',
  role: 'TUTOR',
};
const student = {
  id: 'student',
  name: 'Alex',
  lastname: 'Rivera',
  email: 'student@example.test',
  role: 'STUDENT',
};
const connection = { id: 'connection', person: tutor, linkedAt: '2026-11-24T12:00:00Z' };
const preview = { tutor, expiresAt: '2026-12-01T12:00:00Z', accepted: false };
const invitation = { id: 'invitation', status: 'pending', expiresAt: preview.expiresAt };
const replace = jest.fn();
let parameters = new URLSearchParams();
let auth: {
  user: typeof student | null;
  checking: boolean;
  error: Error | null;
  refresh: jest.Mock;
  expire: jest.Mock;
  login: jest.Mock;
  register: jest.Mock;
  logout: jest.Mock;
};
let fetchMock: jest.Mock;
jest.mock('next/navigation', () => ({
  useSearchParams: () => parameters,
  useRouter: () => ({ replace }),
}));
jest.mock('@/features/auth/auth-provider', () => ({ useAuth: () => auth }));

const reply = (status: number, body: unknown = {}) =>
  ({ status, ok: status >= 200 && status < 300, json: async () => body }) as Response;

function setup(element: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
  return userEvent.setup();
}

beforeEach(() => {
  parameters = new URLSearchParams({ token });
  replace.mockReset();
  auth = {
    user: student,
    checking: false,
    error: null,
    refresh: jest.fn(),
    expire: jest.fn(),
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(),
  };
  fetchMock = jest.fn().mockResolvedValue(reply(200, preview));
  global.fetch = fetchMock;
});

it('keeps invitation through guest sign-in and registration links without previewing', () => {
  auth.user = null;
  setup(<InvitationScreen />);
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
    'href',
    `/sign-in?invitation=${token}`
  );
  expect(screen.getByRole('link', { name: 'Create student account' })).toHaveAttribute(
    'href',
    `/register?invitation=${token}`
  );
  expect(fetchMock).not.toHaveBeenCalled();
});

it('previews tutor and accepts only after explicit confirmation', async () => {
  const user = setup(<InvitationScreen />);
  expect(await screen.findByText('Elena Martin')).toBeVisible();
  expect(fetchMock.mock.calls).toHaveLength(1);
  fetchMock.mockResolvedValue(reply(200, connection));
  await user.click(screen.getByRole('button', { name: 'Accept invitation' }));
  expect(await screen.findByText('You are connected to Elena Martin.')).toBeVisible();
  const accept = fetchMock.mock.calls.find(([url]) => url.endsWith('/accept'));
  expect(JSON.parse(accept[1].body)).toEqual({ token });
  expect(accept[1].credentials).toBe('include');
});

it('shows already accepted invitations without another acceptance', async () => {
  fetchMock.mockResolvedValue(reply(200, { ...preview, accepted: true }));
  setup(<InvitationScreen />);
  expect(await screen.findByRole('link', { name: 'Go to dashboard' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Accept invitation' })).not.toBeInTheDocument();
});

it('blocks tutor profiles without fetching invitation details', () => {
  auth.user = tutor;
  setup(<InvitationScreen />);
  expect(screen.getByRole('alert')).toHaveTextContent('Only student accounts');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('rejects invalid links locally', () => {
  parameters = new URLSearchParams({ token: 'bad' });
  setup(<InvitationScreen />);
  expect(screen.getByRole('alert')).toHaveTextContent('invalid');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('explains unavailable invitations with a retry action', async () => {
  fetchMock.mockResolvedValue(reply(404));
  setup(<InvitationScreen />);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'invalid, expired, revoked or already used'
  );
  expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
});

it('shows tutor conflict without false success', async () => {
  const user = setup(<InvitationScreen />);
  await screen.findByText('Elena Martin');
  fetchMock.mockResolvedValue(reply(409));
  await user.click(screen.getByRole('button', { name: 'Accept invitation' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('already connected to another tutor');
  expect(screen.queryByRole('link', { name: 'Go to dashboard' })).not.toBeInTheDocument();
});

it('offers sign-in with invitation preserved after session expiry', async () => {
  fetchMock.mockResolvedValue(reply(401));
  setup(<InvitationScreen />);
  expect(await screen.findByRole('link', { name: 'Sign in' })).toHaveAttribute(
    'href',
    `/sign-in?invitation=${token}`
  );
});

it('creates a link, copies it, and revokes it', async () => {
  auth.user = tutor;
  const user = userEvent.setup();
  const clipboard = jest.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  let revoked = false;
  fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
    if (options?.method === 'POST') return reply(201, { ...invitation, token });
    if (options?.method === 'DELETE') {
      revoked = true;
      return reply(204);
    }
    return reply(
      200,
      url.endsWith('/invitations')
        ? [{ ...invitation, status: revoked ? 'revoked' : 'pending' }]
        : []
    );
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ConnectionsPanel manage />
    </QueryClientProvider>
  );
  await user.click(screen.getByRole('button', { name: 'Create invitation link' }));
  expect(await screen.findByLabelText('Invitation link')).toHaveValue(
    `${window.location.origin}/invite?token=${token}`
  );
  await user.click(screen.getByRole('button', { name: 'Copy invitation link' }));
  expect(clipboard).toHaveBeenCalledWith(`${window.location.origin}/invite?token=${token}`);
  expect(await screen.findByText('Invitation link copied.')).toBeVisible();
  await user.click(screen.getByRole('button', { name: /Revoke invitation expiring/ }));
  expect(await screen.findByText('Invitation revoked.')).toBeVisible();
  expect(screen.queryByLabelText('Invitation link')).not.toBeInTheDocument();
  clipboard.mockRestore();
});

it('renders connection and handles failed connection loading', async () => {
  fetchMock.mockResolvedValue(reply(200, [connection]));
  setup(<ConnectionsPanel />);
  expect(await screen.findByText('Elena Martin')).toBeVisible();
});

it('preserves invitation when switching auth forms and defaults signup to Student', () => {
  auth.user = null;
  parameters = new URLSearchParams({ invitation: token });
  setup(<AuthForm mode="register" />);
  expect(screen.getByLabelText('Student', { selector: 'input' })).toBeChecked();
  for (const link of screen.getAllByRole('link', { name: 'Sign in' }))
    expect(link).toHaveAttribute('href', `/sign-in?invitation=${token}`);
});

it('redirects signed-in users to confirmation, never arbitrary next URLs', async () => {
  parameters = new URLSearchParams({ invitation: token, next: 'https://evil.test' });
  setup(<AuthForm mode="login" />);
  await waitFor(() => expect(replace).toHaveBeenCalledWith(`/invite?token=${token}`));
  expect(invitationDestination('https://evil.test')).toBeNull();
  expect(authHref('register', 'bad')).toBe('/register');
});

it('does not carry accepted state to another invitation token', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = () => (
    <QueryClientProvider client={client}>
      <InvitationScreen />
    </QueryClientProvider>
  );
  const view = render(tree());
  const user = userEvent.setup();
  await screen.findByText('Elena Martin');
  fetchMock.mockResolvedValue(reply(200, connection));
  await user.click(screen.getByRole('button', { name: 'Accept invitation' }));
  await screen.findByText('You are connected to Elena Martin.');
  parameters = new URLSearchParams({ token: 'b'.repeat(64) });
  fetchMock.mockResolvedValue(
    reply(200, { ...preview, tutor: { ...tutor, name: 'New', lastname: 'Tutor' } })
  );
  view.rerender(tree());
  expect(await screen.findByText('New Tutor')).toBeVisible();
  expect(screen.queryByText('You are connected to Elena Martin.')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Accept invitation' })).toBeVisible();
});
