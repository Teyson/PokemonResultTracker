# E2E smoke suite

A small [Playwright](https://playwright.dev) suite covering the app's golden
paths end to end (real browser, real SWA CLI emulator, real local SQL Server)
— see idea #67 in [docs/FEATURE-IDEAS.md](../docs/FEATURE-IDEAS.md) for why
this exists. It is a **smoke suite, not full coverage**: five or six stable
scenarios, not exhaustive testing.

## What it does

`npm run test:e2e` (from the repo root):

1. Creates/migrates/wipes a dedicated local database, `pokemonresulttracker_e2e`,
   on the same Docker SQL Server container `npm run db:up` already starts —
   never the database your regular `npm run serve` points at.
2. Builds the frontend and API.
3. Starts its own `swa start` instance on ports `4288`/`7078` — never `4280`/
   `7071`, so it never touches (or conflicts with) a `npm run serve` you
   already have running with real seeded data.
4. Drives that instance with a real Chromium browser: signs in through the
   emulated GitHub login with real keystrokes (the emulator only persists
   form fields on a genuine `keyup` event — see the root `CLAUDE.md`), adds a
   member, logs a quick night and a detailed per-match night, checks the
   leaderboard, removes the member.

Nothing here reads or writes `api/local.settings.json` — verified
empirically that both `func start` and `swa start` skip a setting from that
file when the same-named environment variable is already present in the
process, which is how `playwright.config.ts`'s `webServer.env` isolates the
run without ever touching your real local dev config.

## Running it

```powershell
npm run db:up        # if the local SQL Server container isn't already running
npm run test:e2e
```

First run downloads a Chromium binary via `npx playwright install chromium`
if you haven't already (`npm install` alone does not fetch browsers).

## Turning it off

This suite is deliberately self-contained and **not wired into `npm run
check`, `npm run build`, pre-commit hooks, or CI** — it only ever runs when
someone explicitly types `npm run test:e2e`. To stop using it, do nothing:
just don't run that command.

To remove it entirely:

- Delete this `e2e/` directory.
- Delete `playwright.config.ts` (repo root).
- Delete `api/scripts/e2e-reset-db.mjs`.
- Remove the `"test:e2e"` script from the root `package.json`.
- Remove the `"e2e:reset-db"` script from `api/package.json`.
- Remove `@playwright/test` from the root `package.json` devDependencies
  (`npm uninstall @playwright/test`).
- Remove the `/test-results/` and `/playwright-report/` lines from
  `.gitignore`.
- Optionally drop the `pokemonresulttracker_e2e` database from your local
  Docker SQL Server — it's isolated and touches nothing else, so leaving it
  is also harmless.

No other file in the app depends on anything here.
