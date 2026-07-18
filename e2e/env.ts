/**
 * Shared config for the e2e smoke suite. Every value here is isolated to
 * this suite: its own ports (never the 4280/7071 pair `npm run serve` uses
 * for real local dev with real seeded data) and its own database on the
 * same local Docker SQL Server instance. Confirmed empirically that both
 * `func start` and `swa start` skip a value from `local.settings.json` when
 * it's already present in the process environment, so passing these via
 * `webServer.env` in playwright.config.ts never touches the developer's own
 * `api/local.settings.json`.
 */
export const APP_PORT = 4288;
export const API_PORT = 7078;
export const BASE_URL = `http://localhost:${APP_PORT}`;

export const SQL_SERVER = 'localhost';
export const SQL_DATABASE = 'pokemonresulttracker_e2e';
export const SQL_USER = 'sa';
// Matches docker-compose.yml's default local-only password; override via
// MSSQL_SA_PASSWORD if the developer's compose setup overrides it too.
export const SQL_PASSWORD = process.env.MSSQL_SA_PASSWORD ?? 'P@ssw0rd_Local_Dev';

export const ADMIN_USER_ID = 'e2e-admin-id';
export const ADMIN_GITHUB_LOGIN = 'e2e-admin';
export const MEMBER_USER_ID = 'e2e-member-id';
export const MEMBER_GITHUB_LOGIN = 'e2e-member';

/** Env vars passed to the `swa start` child process — see the note above. */
export const SERVER_ENV: Record<string, string> = {
  FUNCTIONS_WORKER_RUNTIME: 'node',
  AzureWebJobsStorage: '',
  SQL_SERVER,
  SQL_DATABASE,
  SQL_USER,
  SQL_PASSWORD,
  SQL_ENCRYPT: 'false',
  ADMIN_USER_ID,
  ADMIN_GITHUB_LOGIN
};
