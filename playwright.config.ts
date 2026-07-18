import { defineConfig } from '@playwright/test';
import { APP_PORT, API_PORT, BASE_URL, SERVER_ENV } from './e2e/env';

/**
 * A minimal smoke suite, not a full end-to-end test framework — see
 * e2e/README.md for what this covers, how to run it, and how to disable or
 * remove it entirely without touching the app. `npm run test:e2e` is the only
 * thing that invokes this config; nothing in `npm run check`/`build`/CI wires
 * it in automatically.
 */
export default defineConfig({
  testDir: './e2e/tests',
  globalSetup: './e2e/global-setup.ts',
  // Tests share one isolated database and run in a deliberate order (see
  // e2e/tests/smoke.spec.ts) — this is a stable smoke suite, not a speed run.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure'
  },
  webServer: {
    command: `npm run serve -- --port ${APP_PORT} --api-port ${API_PORT}`,
    url: BASE_URL,
    // Always spin up a fresh instance on its own ports — never reuse or
    // collide with the developer's own `npm run serve` on 4280/7071.
    reuseExistingServer: false,
    timeout: 90000,
    env: SERVER_ENV
  }
});
