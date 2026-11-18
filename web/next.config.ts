import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(import.meta.dirname, '..'),
  poweredByHeader: false,
  // On Vercel, web and api share one domain and the api service is routed at /api.
  ...(process.env.VERCEL && {
    env: {
      NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? '/api',
      NEXT_PUBLIC_SOCKET_URL: process.env.NEXT_PUBLIC_SOCKET_URL ?? '',
    },
  }),
};

export default nextConfig;
