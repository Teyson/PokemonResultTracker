import mssql from 'mssql';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Prepares the isolated e2e database: creates it if missing (on the same
 * local Docker SQL Server the rest of local dev uses — see
 * docker-compose.yml), runs pending migrations against it, then wipes every
 * app table so each smoke-suite run starts from a clean slate. Never touches
 * SQL_DATABASE from local.settings.json / api/.env — the caller (Playwright's
 * global setup) passes SQL_SERVER/SQL_DATABASE/SQL_USER/SQL_PASSWORD
 * explicitly, pointed at the dedicated e2e database.
 */
function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

const server = requireEnv('SQL_SERVER');
const database = requireEnv('SQL_DATABASE');
const user = requireEnv('SQL_USER');
const password = requireEnv('SQL_PASSWORD');

async function ensureDatabaseExists() {
  const pool = new mssql.ConnectionPool({
    server,
    database: 'master',
    user,
    password,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 30000,
    requestTimeout: 30000
  });
  await pool.connect();
  try {
    // Database names can't be parameterized; `database` is a fixed constant
    // from e2e/env.ts, never user input.
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = '${database}')
      CREATE DATABASE [${database}]
    `);
  } finally {
    await pool.close();
  }
}

function runMigrations() {
  const apiDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  // drizzle.config.ts loads api/.env via dotenv, but dotenv never overrides
  // vars already set in the environment — the SQL_* vars above (pointed at
  // the e2e database) win over api/.env's local/prod values.
  const result = spawnSync('npx', ['drizzle-kit', 'migrate'], {
    cwd: apiDir,
    env: process.env,
    stdio: 'inherit',
    shell: true
  });
  if (result.status !== 0) {
    throw new Error(`drizzle-kit migrate failed against ${database} (exit ${result.status})`);
  }
}

async function wipeTables() {
  const pool = new mssql.ConnectionPool({
    server,
    database,
    user,
    password,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 30000,
    requestTimeout: 30000
  });
  await pool.connect();
  try {
    // Children before parents, matching the FK graph in api/src/db/schema.ts.
    for (const table of ['matches', 'nights', 'decks', 'seasons', 'audit_log', 'allowed_users', 'users']) {
      await pool.request().query(`DELETE FROM [${table}]`);
    }
  } finally {
    await pool.close();
  }
}

await ensureDatabaseExists();
runMigrations();
await wipeTables();
console.log(`e2e database "${database}" reset.`);
