import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './auth-provider';
import { AuthForm } from './auth-form';
import { AccountHome } from './account-home';

const replace = jest.fn();
const router = { replace };
let parameters = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => router,
  useSearchParams: () => parameters,
}));

const student = {
  id: 'student-id',
  email: 'alex.rivera@example.test',
  name: 'Alex',
  lastname: 'Rivera',
  role: 'STUDENT',
};
const tutor = {
  id: 'tutor-id',
  email: 'alex!rivera@example.test',
  name: 'Alex',
  lastname: 'Rivera',
  role: 'TUTOR',
};
const reply = (status: number, body: unknown = {}) =>
  ({ status, ok: status >= 200 && status < 300, json: async () => body }) as Response;
let fetchMock: jest.Mock;

function setup(children: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
  return { client, user: userEvent.setup() };
}

async function fillLogin(user: ReturnType<typeof userEvent.setup>, email = student.email) {
  if (screen.queryByLabelText('Name')) {
    await user.type(screen.getByLabelText('Name'), 'Alex');
    await user.type(screen.getByLabelText('Last name'), 'Rivera');
  }
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password', { exact: true }), 'a long test password');
}

beforeEach(() => {
  replace.mockReset();
  parameters = new URLSearchParams();
  fetchMock = jest.fn().mockResolvedValue(reply(401));
  global.fetch = fetchMock;
});

afterEach(() => {
  jest.restoreAllMocks();
});

it('validates missing credentials, focuses email and keeps password hidden', async () => {
  const { user } = setup(<AuthForm mode="login" />);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(screen.getByText('Enter your email.')).toBeVisible();
  await waitFor(() => expect(screen.getByLabelText('Email')).toHaveFocus());
  expect(screen.getByLabelText('Password', { exact: true })).toHaveAttribute('type', 'password');
  expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0);
});

it.each([student, tutor])(
  'signs in $role with cookies and routes to its own dashboard',
  async (account) => {
    fetchMock.mockImplementation((_url: string, options?: RequestInit) =>
      Promise.resolve(options?.method === 'POST' ? reply(200, { user: account }) : reply(401))
    );
    const { user } = setup(<AuthForm mode="login" />);
    await fillLogin(user, account.email.toUpperCase());
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(account.role === 'TUTOR' ? '/tutor' : '/student')
    );
    const [, options] = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST')!;
    expect(options.credentials).toBe('include');
    expect(JSON.parse(options.body)).toEqual({
      email: account.email,
      password: 'a long test password',
    });
  }
);

it('checks password length and confirmation before registration', async () => {
  const { user } = setup(<AuthForm mode="register" />);
  await user.type(screen.getByLabelText('Email'), 'alex.rivera@example.test');
  await user.type(screen.getByLabelText('Password', { exact: true }), 'four');
  await user.type(screen.getByLabelText('Confirm password'), 'different');
  await user.click(screen.getByRole('button', { name: 'Create account' }));
  expect(screen.getByText('Use at least 5 characters.')).toBeVisible();
  expect(screen.getByText('Passwords do not match.')).toBeVisible();
  expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0);
});

it('registers selected fixed role and sends only the backend contract', async () => {
  fetchMock.mockImplementation((_url: string, options?: RequestInit) =>
    Promise.resolve(options?.method === 'POST' ? reply(201, { user: tutor }) : reply(401))
  );
  const { user } = setup(<AuthForm mode="register" />);
  await user.click(screen.getByRole('radio', { name: 'Tutor' }));
  await fillLogin(user, tutor.email);
  await user.clear(screen.getByLabelText('Name'));
  await user.type(screen.getByLabelText('Name'), ' Zoë ');
  await user.clear(screen.getByLabelText('Last name'));
  await user.type(screen.getByLabelText('Last name'), ' O’Connor-李 ');
  await user.clear(screen.getByLabelText('Password', { exact: true }));
  await user.type(screen.getByLabelText('Password', { exact: true }), 'abcde');
  await user.type(screen.getByLabelText('Confirm password'), 'abcde');
  await user.click(screen.getByRole('button', { name: 'Create account' }));
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/tutor'));
  const [, options] = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST')!;
  expect(JSON.parse(options.body)).toEqual({
    email: tutor.email,
    password: 'abcde',
    name: 'Zoë',
    lastname: 'O’Connor-李',
    role: 'TUTOR',
  });
});

it('shows duplicate email next to the field and preserves the input', async () => {
  fetchMock.mockImplementation((_url: string, options?: RequestInit) =>
    Promise.resolve(reply(options?.method === 'POST' ? 409 : 401))
  );
  const { user } = setup(<AuthForm mode="register" />);
  await fillLogin(user);
  await user.type(screen.getByLabelText('Confirm password'), 'a long test password');
  await user.click(screen.getByRole('button', { name: 'Create account' }));
  expect(
    await screen.findByText(
      'An account with this email already exists. Sign in or use another email.'
    )
  ).toBeVisible();
  expect(screen.getByLabelText('Email')).toHaveValue('alex.rivera@example.test');
  await waitFor(() => expect(screen.getByLabelText('Email')).toHaveFocus());
  expect(replace).not.toHaveBeenCalled();
});

it.each([
  [401, 'Email or password is incorrect.'],
  [429, 'Too many attempts. Please wait a minute and try again.'],
  [503, 'Authentication is temporarily unavailable. Please try again shortly.'],
])('handles HTTP %s without success navigation', async (status, message) => {
  fetchMock.mockImplementation((_url: string, options?: RequestInit) =>
    Promise.resolve(reply(options?.method === 'POST' ? (status as number) : 401))
  );
  const { user } = setup(<AuthForm mode="login" />);
  await fillLogin(user);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByText(message as string)).toBeVisible();
  expect(replace).not.toHaveBeenCalled();
});

it('handles connection failures and restores the submit button', async () => {
  fetchMock.mockImplementation((_url: string, options?: RequestInit) =>
    options?.method === 'POST'
      ? Promise.reject(new TypeError('network error'))
      : Promise.resolve(reply(401))
  );
  const { user } = setup(<AuthForm mode="login" />);
  await fillLogin(user);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(
    await screen.findByText('Could not connect. Check your internet connection and try again.')
  ).toBeVisible();
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
});

it('prevents duplicate submissions while signing in', async () => {
  let finish!: (response: Response) => void;
  fetchMock.mockImplementation((_url: string, options?: RequestInit) =>
    options?.method === 'POST'
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : Promise.resolve(reply(401))
  );
  const { user } = setup(<AuthForm mode="login" />);
  await fillLogin(user);
  await user.dblClick(screen.getByRole('button', { name: 'Sign in' }));
  expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
  expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
  await act(async () => finish(reply(200, { user: student })));
});

it('offers password visibility without changing its value', async () => {
  const { user } = setup(<AuthForm mode="login" />);
  await user.type(screen.getByLabelText('Password', { exact: true }), 'a long test password');
  await user.click(screen.getByRole('button', { name: 'Show password' }));
  expect(screen.getByLabelText('Password', { exact: true })).toHaveAttribute('type', 'text');
  expect(screen.getByLabelText('Password', { exact: true })).toHaveValue('a long test password');
});

it('redirects existing authenticated users away from sign-in', async () => {
  fetchMock.mockResolvedValue(reply(200, { user: tutor }));
  setup(<AuthForm mode="login" />);
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/tutor'));
});

it('keeps private content hidden until identity is verified', async () => {
  fetchMock.mockImplementation(() => new Promise(() => {}));
  setup(<AccountHome role="TUTOR" />);
  expect(screen.queryByText('Your account is ready')).not.toBeInTheDocument();
});

it('redirects guests and prevents opening another role dashboard', async () => {
  fetchMock.mockResolvedValue(reply(200, { user: student }));
  setup(<AccountHome role="TUTOR" />);
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/student'));
  expect(screen.queryByText('Your account is ready')).not.toBeInTheDocument();
});

it('redirects an expired session and clears private content', async () => {
  fetchMock.mockResolvedValue(reply(200, { user: student }));
  const { client } = setup(<AccountHome role="STUDENT" />);
  expect(await screen.findByText('Your account is ready')).toBeVisible();
  act(() => client.setQueryData(['auth', 'session'], null));
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/sign-in?reason=session-expired'));
  expect(screen.queryByText('Your account is ready')).not.toBeInTheDocument();
});

it('explains expiry on the sign-in page', () => {
  parameters = new URLSearchParams('reason=session-expired');
  setup(<AuthForm mode="login" />);
  expect(screen.getByText('Your session has ended. Sign in again to continue.')).toBeVisible();
});

it('revokes the session before clearing identity and private cached data', async () => {
  fetchMock.mockImplementation((_url: string, options?: RequestInit) =>
    Promise.resolve(options?.method === 'POST' ? reply(204) : reply(200, { user: student }))
  );
  const { user, client } = setup(<AccountHome role="STUDENT" />);
  await screen.findByText('Your account is ready');
  client.setQueryData(['lessons', 'previous-user'], ['private record']);
  await user.click(screen.getByRole('button', { name: 'Sign out' }));
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/sign-in?reason=signed-out'));
  expect(client.getQueryData(['lessons', 'previous-user'])).toBeUndefined();
  expect(client.getQueryData(['auth', 'session'])).toBeNull();
});

it('keeps identity and explains retry when logout fails', async () => {
  fetchMock.mockImplementation((_url: string, options?: RequestInit) =>
    Promise.resolve(options?.method === 'POST' ? reply(503) : reply(200, { user: student }))
  );
  const { user, client } = setup(<AccountHome role="STUDENT" />);
  await screen.findByText('Your account is ready');
  await user.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(await screen.findByText('Could not sign out')).toBeVisible();
  expect(client.getQueryData(['auth', 'session'])).toEqual(student);
  expect(replace).not.toHaveBeenCalled();
});

it('places server registration errors under their corresponding controls', async () => {
  fetchMock.mockImplementation((_url: string, options?: RequestInit) =>
    Promise.resolve(
      options?.method === 'POST'
        ? reply(400, {
            message: [
              'email must be an email',
              'lastname must be shorter than or equal to 100 characters',
            ],
          })
        : reply(401)
    )
  );
  const { user } = setup(<AuthForm mode="register" />);
  await fillLogin(user);
  await user.type(screen.getByLabelText('Confirm password'), 'a long test password');
  await user.click(screen.getByRole('button', { name: 'Create account' }));
  const email = screen.getByLabelText('Email');
  await waitFor(() => expect(email).toHaveAttribute('aria-invalid', 'true'));
  expect(email.parentElement).toContainElement(screen.getByText('Enter a valid email address.'));
  expect(screen.getByLabelText('Last name').parentElement).toContainElement(
    screen.getByText('Use 1-100 characters: letters, spaces, hyphens or apostrophes.')
  );
  expect(screen.queryByText('Could not create account')).not.toBeInTheDocument();
});
