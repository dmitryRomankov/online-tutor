import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/features/auth/auth-provider';
import { AuthForm } from '@/features/auth/auth-form';
import { InvitationScreen } from './invitation-screen';

const token = 'a'.repeat(64);
const replace = jest.fn();
let parameters = new URLSearchParams({ token });
const router = { replace };
jest.mock('next/navigation', () => ({
  useRouter: () => router,
  useSearchParams: () => parameters,
}));
const student = {
  id: 'student',
  name: 'Alex',
  lastname: 'Rivera',
  email: 'alex@example.test',
  role: 'STUDENT',
};
const reply = (status: number, body: unknown = {}) =>
  ({ status, ok: status >= 200 && status < 300, json: async () => body }) as Response;

it('clears expired central identity so sign-in cannot bounce back before authentication', async () => {
  replace.mockClear();
  parameters = new URLSearchParams({ token });
  const fetchMock = jest.fn(async (url: RequestInfo | URL) =>
    String(url).endsWith('/auth/me') ? reply(200, { user: student }) : reply(401)
  );
  global.fetch = fetchMock;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (child: React.ReactNode) => (
    <QueryClientProvider client={client}>
      <AuthProvider>{child}</AuthProvider>
    </QueryClientProvider>
  );
  const view = render(tree(<InvitationScreen />));
  expect(await screen.findByRole('link', { name: 'Sign in' })).toBeVisible();
  await waitFor(() => expect(client.getQueryData(['auth', 'session'])).toBeNull());
  parameters = new URLSearchParams({ invitation: token });
  view.rerender(tree(<AuthForm mode="login" />));
  expect(replace).not.toHaveBeenCalled();
  fetchMock.mockResolvedValue(reply(200, { user: student }));
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email'), student.email);
  await user.type(screen.getByLabelText('Password', { exact: true }), 'abcde');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  await waitFor(() => expect(replace).toHaveBeenCalledWith(`/invite?token=${token}`));
});
