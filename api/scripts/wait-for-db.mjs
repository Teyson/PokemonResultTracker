import mssql from 'mssql';

/**
 * Blocks until the Azure SQL server answers a trivial query, retrying with a
 * generous per-attempt timeout. Exists because `drizzle-kit migrate`'s own
 * connection attempt has a fixed ~15s timeout that a paused serverless Azure
 * SQL database can't always wake up within — same cold-start this app's own
 * client.ts already accounts for with a 30s timeout on real requests. Run
 * this right before `db:migrate` in CI so the migrate step's own connection
 * lands on an already-awake database instead of racing the wake-up.
 */
const MAX_ATTEMPTS = 4;
const ATTEMPT_TIMEOUT_MS = 30000;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function boolEnv(name, fallback) {
  const value = process.env[name];
  return value === undefined ? fallback : value === 'true';
}

async function tryConnect(attempt) {
  const pool = new mssql.ConnectionPool({
    server: requireEnv('SQL_SERVER'),
    database: requireEnv('SQL_DATABASE'),
    user: requireEnv('SQL_USER'),
    password: requireEnv('SQL_PASSWORD'),
    options: {
      encrypt: boolEnv('SQL_ENCRYPT', true),
      trustServerCertificate: boolEnv('SQL_TRUST_SERVER_CERTIFICATE', false)
    },
    connectionTimeout: ATTEMPT_TIMEOUT_MS,
    requestTimeout: ATTEMPT_TIMEOUT_MS
  });
  try {
    await pool.connect();
    await pool.request().query('SELECT 1');
    return true;
  } catch (err) {
    console.log(`Attempt ${attempt}/${MAX_ATTEMPTS} failed: ${err.message}`);
    return false;
  } finally {
    try {
      await pool.close();
    } catch {
      // already closed/never opened — nothing to clean up
    }
  }
}

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  console.log(`Waking database (attempt ${attempt}/${MAX_ATTEMPTS}, up to ${ATTEMPT_TIMEOUT_MS / 1000}s)...`);
  if (await tryConnect(attempt)) {
    console.log('Database is awake.');
    process.exit(0);
  }
}

console.error(`Database did not respond after ${MAX_ATTEMPTS} attempts.`);
process.exit(1);
