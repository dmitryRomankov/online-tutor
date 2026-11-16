'use client';

import { useQuery } from '@tanstack/react-query';
import { apiUrl, getApiHealth } from '@/lib/api';

export function ApiStatus() {
  const health = useQuery({
    queryKey: ['api-health'],
    queryFn: ({ signal }) => getApiHealth(signal),
    refetchInterval: 30_000,
  });
  const connected = health.data?.status === 'ok' && !health.isError;
  const label = connected
    ? 'Backend connected'
    : health.isPending
      ? 'Checking connection…'
      : 'Backend unavailable';

  return (
    <div className="status" role="status" aria-live="polite">
      <div className="status-label">
        <span className="status-dot" data-connected={connected} />
        {label}
      </div>
      <p>
        {connected ? 'The lesson API is responding.' : 'Start both applications with npm run dev.'}
      </p>
      <a href={`${apiUrl}/docs`} target="_blank" rel="noreferrer">
        Open API documentation ↗
      </a>
    </div>
  );
}
