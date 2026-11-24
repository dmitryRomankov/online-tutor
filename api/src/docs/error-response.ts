import { ApiResponse } from '@nestjs/swagger';

type ErrorExample =
  | { code: string; message: string }
  | { error?: string; message: string | string[] };

export const invalidSession = {
  code: 'invalid_credentials',
  message: 'Authentication required or credentials are invalid.',
};
export const rejectedOrigin = { error: 'Forbidden', message: 'Request origin is not allowed.' };
export const storageUnavailable = { message: 'Service Unavailable' };

export function apiError(status: number, description: string, ...examples: ErrorExample[]) {
  const shapes = examples.map((example) => ({
    type: 'object',
    required: ['statusCode', ...Object.keys(example)],
    properties: {
      statusCode: { type: 'integer', enum: [status] },
      message: Array.isArray(example.message)
        ? { type: 'array', items: { type: 'string' } }
        : { type: 'string' },
      ...('code' in example ? { code: { type: 'string', enum: [example.code] } } : {}),
      ...('error' in example ? { error: { type: 'string' } } : {}),
    },
  }));
  return ApiResponse({
    status,
    description,
    content: {
      'application/json': {
        schema: shapes.length === 1 ? shapes[0] : { anyOf: shapes },
        examples: Object.fromEntries(
          examples.map((value, index) => [
            'code' in value ? value.code : `http_${index + 1}`,
            { value: { statusCode: status, ...value } },
          ])
        ),
      },
    },
  });
}
