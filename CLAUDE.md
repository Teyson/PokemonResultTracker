# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Branching

All work happens on a branch — never commit directly to `main`.

- **`chore/<short-description>`** — surrounding/non-application files: `CLAUDE.md`,
  `.gitignore`, `README.md`, CI config, editor config, dependency bumps with no code
  changes, etc.
- **`feature/<short-description>`** — new code or behavior changes: frontend
  (`index.html`, `admin.html`), API functions (`api/src/**`), schema changes
  (`sql/schema.sql`), config that affects app behavior (`staticwebapp.config.json`).

Branch names use kebab-case after the prefix, e.g. `feature/per-match-logging`,
`chore/update-readme-deploy-steps`.

Open a PR into `main` for review rather than merging locally, unless the user
explicitly says to merge directly.

## Project overview

Pokémon Result Tracker — a private, cross-device Pokémon TCG results tracker.
Static frontend (`index.html`, `admin.html`, no build step) + Azure Functions API
(`api/`) + Azure SQL (`sql/schema.sql`), deployed as an Azure Static Web App.
See [README.md](README.md) for architecture and deployment details.

## Working conventions

- Plain HTML/JS on the frontend — no build step, no framework. Keep it that way
  unless the user asks to introduce one.
- API routes live in `api/src/functions/`; the Azure Functions v4 model
  auto-registers each file, so no manual route wiring is needed.
- Keep naming consistent with the repo name (`PokemonResultTracker` /
  `pokemonresulttracker` for the DB) — don't reintroduce references to the old
  `tuesday-league` prototype this project was migrated from.
