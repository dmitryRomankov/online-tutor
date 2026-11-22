import { z } from 'zod';

const environmentSchema = z.looseObject({
  PORT: z.preprocess(
    (value) => value === '' || value == null ? 3001 : value,
    z.coerce.number().int().min(1).max(65535)
  ),
  CLIENT_ORIGIN: z.preprocess(
    (value) => value === '' || value == null ? 'http://localhost:3000' : value,
    z.string().refine((value) => {
      try {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
      } catch {
        return false;
      }
    }, 'must be an HTTP(S) origin without a path or trailing slash')
  ),
  AUTH_SESSION_TTL_SECONDS: z.preprocess(
    (value) => value === '' || value == null ? 28800 : value,
    z.coerce.number().int().min(1).max(604800)
  ),
  SESSION_SECRET: z.union([z.literal(''), z.string().min(32)]).optional(),
});

export function validateEnvironment(values: Record<string, unknown>) {
  const result = environmentSchema.safeParse(values);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(`Invalid environment configuration: ${fields.join(', ')}.`);
  }
  return result.data;
}
