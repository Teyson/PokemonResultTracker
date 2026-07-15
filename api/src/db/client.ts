import { drizzle } from 'drizzle-orm/node-mssql';
import mssql from 'mssql';
import * as schema from './schema';

/**
 * Shared SQL Server connection pool wrapped in a Drizzle client. Same env vars
 * and timeouts as before (SQL_SERVER/SQL_DATABASE/SQL_USER/SQL_PASSWORD, 30s
 * connect/request timeouts) so a paused serverless Azure SQL database still
 * gets time to wake up on the first request after a quiet spell.
 *
 * encrypt/trustServerCertificate default to Azure's required values (encrypt
 * on, real cert required). The local Docker SQL Server container has no valid
 * cert, so local dev sets SQL_ENCRYPT=false in local.settings.json to skip TLS
 * entirely rather than trusting a self-signed cert in transit.
 */
let dbPromise: ReturnType<typeof createDb> | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required app setting: ${name}`);
  return value;
}

function boolEnv(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  return value === undefined ? defaultValue : value === 'true';
}

async function createDb() {
  const pool = await mssql.connect({
    server: requireEnv('SQL_SERVER'),
    database: requireEnv('SQL_DATABASE'),
    user: requireEnv('SQL_USER'),
    password: requireEnv('SQL_PASSWORD'),
    options: {
      encrypt: boolEnv('SQL_ENCRYPT', true),
      trustServerCertificate: boolEnv('SQL_TRUST_SERVER_CERTIFICATE', false)
    },
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
