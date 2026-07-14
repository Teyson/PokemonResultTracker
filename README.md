# Pokémon Result Tracker

A private, cross-device Pokémon TCG results tracker for our Tuesday nights at Spilforsyningen.
Built to run **free** on Azure: Static Web Apps (frontend + API) + Azure SQL (database).

- **Frontend** — SvelteKit (`src/`), prerendered to a static multi-page site (`/`, `/admin`)
  via `adapter-static`. TypeScript, Vite build step.
- **API** — Azure Functions (Node 20, TypeScript) in `api/`, talking to Azure SQL through
  Drizzle ORM.
- **Auth** — Static Web Apps built-in GitHub login. Only whitelisted users can read/write; the
  admin manages the whitelist from `/admin`.

```
Phone / Laptop ──▶ Static Web App (free)
                    ├─ /            tracker (SvelteKit, prerendered)
                    ├─ /admin       member whitelist (admin only)
                    └─ /api/*        Azure Functions ──▶ Azure SQL (free serverless)
```

---

## What you get for $0

| Piece | Free allowance (2026) |
|-------|-----------------------|
| Static Web Apps (Free plan) | Hosting, SSL, GitHub login, custom roles, 100 GB bandwidth/mo |
| Azure SQL (free offer) | 100,000 vCore-seconds/mo + 32 GB, renews monthly, never expires |

The serverless database **auto-pauses when idle**, so the first request after a quiet
spell takes a few seconds to wake — normal and expected for a weekly tracker.

---

## Deploy — one-time setup

You'll do the Azure clicks (they need your login); everything in this repo is ready to go.

### 1. Put this folder in a GitHub repo

```powershell
cd C:\Users\teis\Documents\PokemonResultTracker
git init
git add -A
git commit -m "Initial Pokémon Result Tracker app"
# create an empty repo on github.com first, then:
git remote add origin https://github.com/<you>/PokemonResultTracker.git
git branch -M main
git push -u origin main
```

### 2. Create the database (Azure SQL free offer)

1. [Azure portal](https://portal.azure.com) → **Create a resource** → **Azure SQL** → **SQL databases** → *Create*.
2. Create a new **SQL server** when prompted:
   - Authentication: **Use SQL authentication**. Set an admin login (e.g. `sqladmin`) and a strong password — you'll need these later.
3. Database name: e.g. `pokemonresulttracker`.
4. **Compute + storage** → *Configure* → pick **General Purpose → Serverless**, then near the top choose the **"Apply free offer"** option (up to 10 free databases per subscription).
5. Create it.
6. On the **SQL server** resource → **Networking** → enable **"Allow Azure services and resources to access this server"** → Save. (This lets the Functions reach the DB.)
7. Apply the schema — see **Database migrations** below. (If you're setting this up
   fresh, running `npm run db:migrate` from `api/` after step 3 of local setup is
   the simplest path; `sql/schema.sql` is kept only as a manual fallback.)

### 3. Create the Static Web App (Free) and connect the repo

1. Portal → **Create a resource** → **Static Web App** → *Create*.
2. Plan type: **Free**.
3. Deployment: **GitHub** → authorize → pick your `PokemonResultTracker` repo and the `main` branch.
4. Build details:
   - **Build preset:** SvelteKit (if offered) — otherwise **Custom**.
   - **App location:** `/`
   - **Api location:** `api`
   - **Output location:** `build`
   - If the preset doesn't set them for you, the app build command is
     `npm run build` and the API build command is also `npm run build`
     (it runs `tsc`, compiling `api/src` to `api/dist`).
5. Create. Azure commits a GitHub Actions workflow to your repo and runs the first deploy (watch it under the repo's **Actions** tab).

### 4. Add the app settings

Static Web App resource → **Settings → Environment variables** (a.k.a. Configuration) → add these four, then **Save**:

| Name | Value |
|------|-------|
| `SQL_SERVER` | `pokemonresulttracker.database.windows.net` (your server's full name) |
| `SQL_DATABASE` | `pokemonresulttracker` |
| `SQL_USER` | `sqladmin` (your SQL admin login) |
| `SQL_PASSWORD` | your SQL admin password |
| `ADMIN_GITHUB_LOGIN` | your **GitHub username** — this is the admin account |

> `ADMIN_GITHUB_LOGIN` is how you become admin. Set it to your exact GitHub handle
> (e.g. `Teyson`). You never need to whitelist yourself.

### 5. Use it

1. Open the app's URL (shown on the Static Web App overview, like `https://<name>.azurestaticapps.net`).
2. **Sign in with GitHub.** As the admin you go straight in and see **Manage users**.
3. Have friends open the URL and sign in once — they'll land on an "almost there" screen showing their GitHub username. Add that username under **Manage users** → they get in on their next load.

---

## Everyday use

- **Log a night:** pick the date, tap your deck (or **+ New deck** and choose a type), set W/T/L with the steppers, **Log night**.
- **Edit / delete:** the ✎ and ✕ buttons on any night.
- **Manage members:** the **Manage users** link (admin only) → add/remove GitHub usernames.

All data lives in the shared Azure SQL database, so it's identical on every device.

---

## Database migrations

Schema is defined in code at [`api/src/db/schema.ts`](api/src/db/schema.ts) using
[Drizzle ORM](https://orm.drizzle.team/), with migrations generated by
`drizzle-kit` into `api/drizzle/`. `sql/schema.sql` is kept only as a manual
fallback reference — it is **not** the source of truth anymore.

> **Known caveat:** Drizzle's MSSQL/Azure SQL support is new enough that
> `drizzle-orm`/`drizzle-kit` are pinned to the `rc` dist-tag in
> `api/package.json`. Once MSSQL support graduates to a stable release, bump
> these to an exact pinned version.

### One-time local setup for the CLI

`drizzle-kit` reads credentials from a plain `.env` file (gitignored), separate
from `api/local.settings.json` (which the Functions runtime itself reads):

```
# api/.env
SQL_SERVER=pokemonresulttracker.database.windows.net
SQL_DATABASE=pokemonresulttracker
SQL_USER=sqladmin
SQL_PASSWORD=your-password
```

### Fresh database (nothing deployed yet)

```powershell
cd api
npm install
npm run db:generate   # produces the baseline migration from schema.ts
npm run db:migrate    # applies it
npm run seed          # optional — recreates the one seed night from the old tracker
```

### Already-provisioned database (you ran `sql/schema.sql` before this rewrite)

Your tables already match `schema.ts` column-for-column, so do **not** run the
generated baseline migration against it — that would try to `CREATE TABLE`
objects that already exist. Instead, mark it as already applied:

1. Run `npm run db:generate` once — it produces a timestamped folder under
   `api/drizzle/` (e.g. `api/drizzle/<timestamp>_<name>/migration.sql`) plus a
   snapshot file.
2. Follow [drizzle-kit's docs on baselining an existing database](https://orm.drizzle.team/docs/kit-overview)
   to mark that migration as already applied without executing its SQL (since
   the tables it would create already exist).
3. From then on, `npm run db:generate` + `npm run db:migrate` works normally for
   every future schema change.

### Making a schema change later

1. Edit `api/src/db/schema.ts`.
2. `npm run db:generate` in `api/` — review the generated SQL under `api/drizzle/`.
3. `npm run db:migrate` to apply it.

---

## Local development

```powershell
# Requires Node 18+ (SvelteKit/Vite requirement)
npm install -g @azure/static-web-apps-cli azure-functions-core-tools@4

# API
cd api
npm install
copy local.settings.json.example local.settings.json   # then fill in your SQL_* values
npm run build

# Frontend (from repo root)
cd ..
npm install
npm run build

# Full local emulation (frontend + API + emulated GitHub auth/roles)
swa start build --api-location api
```

Note: local GitHub login is emulated by the SWA CLI (you can type any username and
roles), so you can test the admin/member gates without real auth.

For frontend-only iteration without the API, `npm run dev` runs the Vite dev
server directly (any `/api/*` calls will 404 unless you also run `swa start`
or point `vite.config.ts` at a running Functions host).

---

## Extending it later

The schema is deliberately relational so it can grow:

- **Per-match logging:** add a `matches` table (`id, night_id FK, round_no, opponent_deck, result`)
  and derive W/T/L from it instead of storing aggregates.
- **Opponent / meta tracking:** reuse `decks` for opponent decks; add a `players` table.
- **Per-user records:** `nights` already has room for a `user_id` column if you want each
  member's own standings rather than a shared log.

Add a new API route by dropping another file in `api/src/functions/` — the v4
programming model registers it automatically. Add a new page by dropping a
`+page.svelte` under `src/routes/`.
