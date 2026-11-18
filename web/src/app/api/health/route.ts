export async function GET() {
  const apiBase = process.env.INTERNAL_API_URL;
  if (!apiBase) {
    return Response.json({ status: 'unavailable' }, { status: 503 });
  }

  try {
    const url = new URL('/api/health', apiBase);
    const response = await fetch(url, {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const { status, service } = await response.json();
      if (status === 'ok' && service === 'api') {
        return Response.json({ status, service });
      }
    }
  } catch {
    // Report liveness failure without exposing the internal URL or upstream errors.
  }
  return Response.json({ status: 'unavailable' }, { status: 503 });
}
