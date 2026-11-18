import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Reviewed DDL uses a separate migration login; generation/validation need no database.
  datasource: {
    url:
      process.env.MIGRATION_DATABASE_URL ??
      'postgresql://tutor_migrator@localhost:5432/online_tutor_demo?schema=public',
  },
});
