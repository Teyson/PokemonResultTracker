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
  to produce a migration under `api/drizzle/`, then `npm run db:migrate` to
  apply it. Don't hand-edit generated migration SQL.
- Request bodies are validated with Zod schemas colocated in each function file,
  not hand-rolled regex/parsing.
- `sql/schema.sql` is kept only as a fresh-install fallback reference; it is not
  the source of truth for schema changes anymore.
- Keep naming consistent with the repo name (`PokemonResultTracker` /
  `pokemonresulttracker` for the DB) — don't reintroduce references to the old
  `tuesday-league` prototype this project was migrated from.

## Local environment quirks

- `docker` is not on `PATH` in Claude Code's shell tools (Bash/PowerShell), even
  though Docker Desktop is installed and usually already running with the local
  SQL Server container up. Don't conclude Docker is unavailable — locate the
  `docker.exe` under the Docker Desktop install directory (typically under
  `Program Files\Docker\Docker\resources\bin`) and invoke it by full path. The
  `docker compose` subcommand works the same way via that binary.
