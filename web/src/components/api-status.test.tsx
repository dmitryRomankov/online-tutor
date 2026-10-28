import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { ApiStatus } from './api-status';

describe('API connection status', () => {
  afterEach(() => jest.restoreAllMocks());

  function renderStatus() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}><ApiStatus /></QueryClientProvider>);
  }

  it('shows a successful response from the API', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'ok', service: 'api' }) });
    renderStatus();
    expect(await screen.findByText('Backend connected')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:3001/api/health', expect.objectContaining({ credentials: 'include' }));
  });

  it('shows an unavailable backend when the request fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });
    renderStatus();
    expect(await screen.findByText('Backend unavailable')).toBeInTheDocument();
  });
});
