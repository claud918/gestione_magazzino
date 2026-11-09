import { defineConfig } from 'drizzle-kit';

// Genera le migration SQL in ./migrations; vengono applicate con
// `wrangler d1 migrations apply` (vedi script db:migrate:* in package.json).
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './migrations',
});

