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
    <div className="status [border-left:1px_solid_#dfe6dc] pl-8 [&_p]:text-[14px] max-[700.01px]:[border-left:0] max-[700.01px]:[border-top:1px_solid_#dfe6dc] max-[700.01px]:[padding:20px_0_0]" role="status" aria-live="polite">
      <div className="status-label flex items-center gap-2.5 font-bold">
        <span className="status-dot w-2.25 h-2.25 rounded-[50%] bg-[#9ba89e] shrink-0 [&[data-connected=true]]:bg-[#24825c]" data-connected={connected} />
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
