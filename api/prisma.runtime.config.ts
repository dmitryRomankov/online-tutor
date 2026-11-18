import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Studio uses the restricted runtime login, never migration ownership.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL ?? 'postgresql://tutor_app@localhost:5432/online_tutor_demo',
  },
});
