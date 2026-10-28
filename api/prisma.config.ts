import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Generation/validation do not need a running database. Migration commands require DATABASE_URL.
  datasource: { url: process.env.DATABASE_URL ?? 'postgresql://diploma:diploma@localhost:5432/diploma?schema=public' },
});
