import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

/**
 * Run via `npm run db:generate` / `db:migrate` in api/. Reads SQL_* from a
 * local .env file (gitignored) — separate from local.settings.json, which is
 * what the Functions runtime itself reads at request time. See README for
 * the one-time steps to point this at a fresh vs. already-provisioned DB.
 */
export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'mssql',
  dbCredentials: {
    server: process.env.SQL_SERVER!,
    port: 1433,
    database: process.env.SQL_DATABASE!,
    user: process.env.SQL_USER!,
    password: process.env.SQL_PASSWORD!,
    options: {
      encrypt: process.env.SQL_ENCRYPT !== 'false',
      trustServerCertificate: process.env.SQL_TRUST_SERVER_CERTIFICATE === 'true'
    }
  }
});
