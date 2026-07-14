const sql = require('mssql');

/**
 * Shared Azure SQL connection pool.
 * Connection settings come from app settings (Configuration in the Static Web App):
 *   SQL_SERVER    e.g. pokemonresulttracker.database.windows.net
 *   SQL_DATABASE  e.g. pokemonresulttracker
 *   SQL_USER      SQL admin login
 *   SQL_PASSWORD  SQL admin password
 * Serverless Azure SQL auto-pauses when idle, so the first query after a quiet
 * spell can take a few seconds to wake the database — that is expected.
 */
let poolPromise = null;

function getPool() {
  if (!poolPromise) {
    const config = {
      server: process.env.SQL_SERVER,
      database: process.env.SQL_DATABASE,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      options: { encrypt: true, trustServerCertificate: false },
      pool: { max: 4, min: 0, idleTimeoutMillis: 30000 },
      // Give a paused serverless DB time to wake instead of failing fast.
      connectionTimeout: 30000,
      requestTimeout: 30000
    };
    poolPromise = sql.connect(config).catch(err => {
      // Reset so the next request retries a fresh connection.
      poolPromise = null;
      throw err;
    });
  }
  return poolPromise;
}

/** Decode the Static Web Apps client principal from the request headers. */
function getUser(request) {
  const header = request.headers.get('x-ms-client-principal');
  if (!header) return null;
  try {
    return JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
  } catch (e) {
    return null;
  }
}

module.exports = { sql, getPool, getUser };
