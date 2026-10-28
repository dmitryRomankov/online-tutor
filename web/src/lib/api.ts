export const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api').replace(/\/$/, '');

export async function getApiHealth(signal?: AbortSignal): Promise<{ status: string; service: string }> {
  const response = await fetch(`${apiUrl}/health`, { credentials: 'include', signal });
  if (!response.ok) throw new Error(`API request failed (${response.status})`);
  return response.json();
}
