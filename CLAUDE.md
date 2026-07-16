# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Branching

All work happens on a branch — never commit directly to `main`.

- **`chore/<short-description>`** — surrounding/non-application files: `CLAUDE.md`,
  `.gitignore`, `README.md`, CI config, editor config, dependency bumps with no code
  changes, etc.
- **`feature/<short-description>`** — new code or behavior changes: frontend
  (`src/routes/**`, `src/lib/**`), API functions (`api/src/**`), schema/migration
  changes (`api/src/db/schema.ts`, `api/drizzle/**`), config that affects app
  behavior (`staticwebapp.config.json`).
- **`fix/<short-description>`** — bug fixes to existing behavior (same file scope
  as `feature/`).

Branch names use kebab-case after the prefix, e.g. `feature/per-match-logging`,
`chore/update-readme-deploy-steps`.

Open a PR into `main` for review rather than merging locally, unless the user
explicitly says to merge directly.

## Project overview

Pokémon Result Tracker — a private, cross-device Pokémon TCG results tracker.
SvelteKit frontend (prerendered static output via `adapter-static`) + TypeScript
Azure Functions API (`api/`) + Azure SQL via Drizzle ORM (`api/src/db/schema.ts`,
migrations in `api/drizzle/`), deployed as an Azure Static Web App. See
[README.md](README.md) for architecture and deployment details.

## Working conventions

- Frontend is SvelteKit (Svelte 5 runes) with TypeScript, built via Vite and
  deployed as a prerendered static multi-page site (`adapter-static`, no SSR at
  request time — same "static hosting" model as before, just with a build step
  now). Shared UI lives in `src/lib/components/`, shared logic in `src/lib/`.
- API routes live in `api/src/functions/`; the Azure Functions v4 model
  auto-registers each file, so no manual route wiring is needed. Written in
  TypeScript, compiled via `tsc` to `api/dist` before `func start`/deployment.
- Database access goes through Drizzle ORM (`api/src/db/client.ts` for the
  connection, `api/src/db/schema.ts` for table definitions). Schema changes go
  through `drizzle-kit`: edit `schema.ts`, run `npm run db:generate` in `api/`
  to produce a migration under `api/drizzle/`, commit it, and apply it locally
  with `npm run db:migrate` against the Docker DB to verify it before opening a
  PR. Don't hand-edit generated migration SQL, and never use `npm run db:push`
  — it applies schema changes directly and bypasses the migration history.
  **Production migrations are automatic**: the `migrate_database` job in
  `.github/workflows/azure-static-web-apps-*.yml` runs `npm run db:migrate`
  against the production Azure SQL database on every push to `main`, before
  the API is deployed. GitHub-hosted runners have no stable egress IP (it can
  even change mid-job) and GitHub's published Actions IP ranges are far too
  numerous (5000+ CIDR blocks) for per-block firewall rules, so per-IP
  allow-listing isn't viable. Instead the job logs into Azure via OIDC (no
  stored client secret — a federated credential scoped to `main`) and opens
  the SQL server firewall to all IPs for just the run's duration, then closes
  it again afterward — the exposure window is bounded by time, not by IP.
  `drizzle-kit migrate` tracks already-applied migrations itself, so this is a
  no-op when a merge has no new migration files — don't run `db:migrate`
  against production manually.
- Request bodies are validated with Zod schemas colocated in each function file,
  not hand-rolled regex/parsing.
- `sql/schema.sql` is kept only as a fresh-install fallback reference; it is not
  the source of truth for schema changes anymore.
- Keep naming consistent with the repo name (`PokemonResultTracker` /
  `pokemonresulttracker` for the DB) — don't reintroduce references to the old
  `tuesday-league` prototype this project was migrated from.

## Build & verification

- Frontend type-check: `npm run check` (svelte-check) at the repo root.
- Frontend build: `npm run build` at the root. API build/type-check:
  `npm run build` in `api/` (plain `tsc` compiling to `api/dist`).
- There is **no automated test suite**. The verification bar before opening a
  PR is: both builds pass, `npm run check` passes, and the affected flow has
  been exercised manually (or via browser preview) where practical.
- Full local run: build both, then `npm run serve` at the root (SWA CLI,
  default `http://localhost:4280`). Frontend-only iteration: `npm run dev`
  (Vite dev server; `/api/*` calls 404 without a Functions host).
  `.claude/launch.json` defines both as the `dev` and `serve` preview servers.

## Local environment quirks

- `docker` is not on `PATH` in Claude Code's shell tools (Bash/PowerShell), even
  though Docker Desktop is installed and usually already running with the local
  SQL Server container up. Don't conclude Docker is unavailable — locate the
  `docker.exe` under the Docker Desktop install directory (typically under
  `Program Files\Docker\Docker\resources\bin`) and invoke it by full path. The
  `docker compose` subcommand works the same way via that binary.
- The SWA CLI's emulated login form at `/.auth/login/github` only persists its
  fields on a genuine `keyup` DOM event. Browser automation that sets input
  values programmatically silently falls back to a cached-or-random user id
  with no username — it looks like a broken login flow but isn't. When testing
  role-dependent views locally, prefer the `.env.local` dev-login bar (see
  README, "Testing the member/admin views") over automating that form.
- The user almost always has a `npm run serve` (SWA CLI, `http://localhost:4280`)
  already running locally with real seeded data — check there before starting a
  new one. If it's already up, just use it (e.g. navigate the browser preview to
  `http://localhost:4280` directly rather than via `preview_start`, which will
  fail with a port conflict). Since it serves the prebuilt `build/` output rather
  than live source, run `npm run build` first to pick up pending changes before
  verifying against it. Don't shut it down when done — leave it running for next
  time. Only start a fresh one (`preview_start` with `serve`) if nothing answers
  on port 4280.
- That reuse advice assumes your Browser-pane tools can actually reach the
  other session's server. They sometimes can't: if `preview_start` reports the
  port is held by "another chat's dev server" and the tool warns your Browser
  tools won't reach it, that's a hard session-isolation boundary in the
  harness, not something `navigate` can route around — don't bother trying
  `http://localhost:4280` directly first, it will fail the same way. In that
  case start your own instance on a different port: temporarily edit
  `.claude/launch.json`'s `serve` entry to pass explicit `--port`/`--api-port`
  flags (the SWA CLI ignores a `PORT` env var and otherwise prompts
  interactively when 4280 is taken, which hangs a backgrounded process), run
  `preview_start`, and **revert `launch.json` back to the default 4280/7071
  once done** — it's a per-session workaround, not a repo change, and leaving
  it edited would confuse the next session (or the human) expecting the
  documented default port.
