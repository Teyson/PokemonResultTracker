import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SERVER_ENV } from './env';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const apiDir = path.join(rootDir, 'api');

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} (in ${cwd}) failed with exit code ${result.status}`);
  }
}

/**
 * Runs once before the whole suite: resets the isolated e2e database (create
 * if missing, migrate, wipe — see api/scripts/e2e-reset-db.mjs) and builds
 * both the frontend and API so `npm run serve` in playwright.config.ts's
 * webServer has fresh output to serve. Never touches the developer's own
 * `npm run serve` instance or database — see e2e/env.ts and e2e/README.md.
 */
export default async function globalSetup() {
  console.log('[e2e] Resetting isolated e2e database...');
  run('node', ['scripts/e2e-reset-db.mjs'], apiDir, { ...process.env, ...SERVER_ENV });

  console.log('[e2e] Building frontend...');
  run('npm', ['run', 'build'], rootDir);

  console.log('[e2e] Building API...');
  run('npm', ['run', 'build'], apiDir);
}
