export function validateEnvironment(values: Record<string, unknown>) {
  const port = Number(values.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  const clientOrigin = String(values.CLIENT_ORIGIN ?? 'http://localhost:3000');
  const url = new URL(clientOrigin);
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== clientOrigin) {
    throw new Error('CLIENT_ORIGIN must be an HTTP(S) origin without a path or trailing slash.');
  }

  return { ...values, PORT: port, CLIENT_ORIGIN: clientOrigin };
}
