import { drizzle } from 'drizzle-orm/node-mssql';
import mssql from 'mssql';
import * as schema from './schema';

/**
 * Shared Azure SQL connection pool wrapped in a Drizzle client. Same env vars
 * and timeouts as before (SQL_SERVER/SQL_DATABASE/SQL_USER/SQL_PASSWORD, 30s
 * connect/request timeouts) so a paused serverless database still gets time
 * to wake up on the first request after a quiet spell.
 */
let dbPromise: ReturnType<typeof createDb> | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required app setting: ${name}`);
  return value;
}

async function createDb() {
  const pool = await mssql.connect({
    server: requireEnv('SQL_SERVER'),
    database: requireEnv('SQL_DATABASE'),
    user: requireEnv('SQL_USER'),
    password: requireEnv('SQL_PASSWORD'),
    options: { encrypt: true, trustServerCertificate: false },
    pool: { max: 4, min: 0, idleTimeoutMillis: 30000 },
    connectionTimeout: 30000,
    requestTimeout: 30000
  });
  return drizzle({ client: pool, schema });
}

export function getDb(): ReturnType<typeof createDb> {
  if (!dbPromise) {
    dbPromise = createDb().catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}
