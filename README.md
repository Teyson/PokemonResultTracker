# Pokémon Result Tracker

A private, cross-device Pokémon TCG results tracker for our Tuesday nights at Spilforsyningen.
Built to run **free** on Azure: Static Web Apps (frontend + API) + Azure SQL (database).

- **Frontend** — SvelteKit (`src/`), prerendered to a static multi-page site (`/`, `/admin`)
  via `adapter-static`. TypeScript, Vite build step.
- **API** — Azure Functions (Node 20, TypeScript) in `api/`, talking to Azure SQL through
  Drizzle ORM.
- **Auth** — Static Web Apps built-in GitHub login. Only whitelisted users can read/write; the
  admin manages the whitelist from `/admin`. Role enforcement (member/admin) happens inside the
  API itself rather than via Static Web Apps' `rolesSource` (a Standard-SKU-only feature) — see
  **Auth design** below.

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

Static Web App resource → **Settings → Environment variables** (a.k.a. Configuration) → add these, then **Save**:

| Name | Value |
|------|-------|
| `SQL_SERVER` | `pokemonresulttracker.database.windows.net` (your server's full name) |
| `SQL_DATABASE` | `pokemonresulttracker` |
| `SQL_USER` | `sqladmin` (your SQL admin login) |
| `SQL_PASSWORD` | your SQL admin password |
| `ADMIN_USER_ID` | your immutable Static Web Apps user id — the admin account (see below) |
| `ADMIN_GITHUB_LOGIN` | your **GitHub username** — transitional bootstrap only (see below) |

> **Who is admin.** Admin identity is keyed on your immutable Static Web Apps
> **user id** (`ADMIN_USER_ID`), not your GitHub username, so you can rename your
> GitHub account without losing admin. But you can't know that id until you've
> signed in once — so it's a two-step bootstrap:
>
> 1. On first deploy, set **`ADMIN_GITHUB_LOGIN`** to your exact GitHub handle
>    (e.g. `Teyson`) and leave `ADMIN_USER_ID` empty. This lets you in as admin
>    by login as a one-time bootstrap.
> 2. Signed in, open **`https://<your-app>/.auth/me`** and copy `clientPrincipal.userId`.
>    Put that value in **`ADMIN_USER_ID`** and **Save**. From now on you're admin
>    by immutable id, and `ADMIN_GITHUB_LOGIN` is just a fallback you can delete.
>
> You never need to whitelist yourself. Members are invited by GitHub username
> under **Manage users**; each member's row is automatically bound to their
> immutable id the first time they sign in, so member renames don't break either.
>
> **Renames just work.** Nights are owned by a foreign key into a `users` table
> keyed on the immutable user id; the GitHub login is stored only as a display
> name and refreshed on every login. So renaming a GitHub account keeps ownership
> and access intact and updates the displayed name everywhere automatically — no
> manual fix-ups.

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

## Auth design

Static Web Apps has two ways to grant custom roles (`member`/`admin`) on top of the built-in GitHub
login:

1. **`rolesSource`** — a Function that Azure calls on every login to compute roles dynamically.
   **Standard SKU only** (~$9/mo).
2. **Invitation links** — the admin generates a role-tagged link per person from the Azure portal;
   **Free tier**, but no self-service whitelist UI, and it's a manual per-person Azure step.

This app avoids both: routes only require the built-in `authenticated` role at the platform level
(any signed-in GitHub user reaches the API), and each API function (`api/src/functions/nights.ts`,
`users.ts`, `me.ts`) resolves the real role itself via `resolveRole()` in
[`api/src/auth.ts`](api/src/auth.ts), checking the `allowed_users` whitelist table directly. This
keeps the self-service "Manage users" admin page and costs $0.

The frontend calls `GET /api/me` (instead of trusting `x-ms-client-principal.userRoles`, which on
Free tier never holds anything beyond `authenticated`) to find out if the signed-in user is a
member, an admin, or pending (signed in but not yet whitelisted).

### Switching to Standard SKU later

If the app outgrows the Free tier and you want Azure to enforce roles at the platform level again:

1. Upgrade the Static Web App to the Standard plan in the portal.
2. Restore the `rolesSource` function: `git show <commit-before-this-change>:api/src/functions/getRoles.ts`
   (its logic now also lives in `resolveRole()`, so this is just re-adding the Function wrapper Azure
   calls on login).
3. Add back to `staticwebapp.config.json`: `"auth": { "rolesSource": "/api/GetRoles" }`, and change
   `/api/nights*`/`/api/users*` back to `allowedRoles: ["member"]`/`["admin"]`.
4. Redeploy. No schema or admin-UI changes needed either direction.

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

Runs the whole app — frontend, API, and a real SQL Server database — entirely
on your machine, served at a `localhost` URL, with **no Azure resources
involved**. Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/)
and Node 18+.

### 1. One-time setup

```powershell
npm install -g @azure/static-web-apps-cli azure-functions-core-tools@4

# Root
npm install

# API
cd api
npm install
copy local.settings.docker.json.example local.settings.json
copy .env.example .env
# then edit api/.env, uncomment the "Local Docker SQL Server" block (and
# comment out the Azure SQL_* lines above it)
cd ..
```

### 2. Start the local database and apply the schema

```powershell
npm run db:up              # starts the SQL Server container (docker-compose.yml)

cd api
npm run db:migrate         # creates the decks/users/nights/allowed_users tables
npm run seed                # optional — one sample night, same as sql/schema.sql's seed
cd ..
```

`npm run db:up` starts a plain `mcr.microsoft.com/mssql/server` container on
port 1433 with a throwaway local password (see `docker-compose.yml`) — this is
never the real Azure SQL database. `npm run db:down` (root) stops it; the data
persists in a Docker volume between runs, so you don't need to re-migrate each
session unless you reset the container.

### 3. Build and serve

```powershell
cd api && npm run build && cd ..
npm run build
npm run serve               # swa start build --api-location api
```

The SWA CLI prints the local URL (default `http://localhost:4280`). The
anonymous **login gate** and the not-yet-whitelisted **pending gate** both work
correctly through the CLI's emulated GitHub login at `/.auth/login/github`.

> **Known SWA CLI limitation (tested with `@azure/static-web-apps-cli@2.0.9`):**
> the CLI's config schema validator incorrectly requires `auth.identityProviders`
> even for the built-in GitHub login this app uses (Microsoft's own docs confirm
> the built-in provider needs no extra registration — this is a CLI bug, not a
> problem with `staticwebapp.config.json`). One effect, **local only, does not
> affect the real Azure deployment**:
> - `allowedRoles` on `/api/*` isn't enforced locally — `/api/nights`/`/api/users`
>   are reachable without auth. The `/admin` → `/admin.html` rewrite also isn't
>   applied, but only matters for a *hard* navigation or refresh at `/admin`
>   (typed URL, bookmark) — clicking the in-app "Manage users" link works fine,
>   since SvelteKit's client-side router handles it without a server round trip.
>
> **The emulated login form at `/.auth/login/github` works correctly for real
> typing** — type any User ID and Username and click Login; that identity
> carries through to `/.auth/me` and every `/api/*` call, so signing in as
> `ADMIN_GITHUB_LOGIN` (see app settings above) gets you real admin access
> against the local database. The form's fields only save on a genuine
> `keyup` DOM event, though — browser automation/scripting that sets input
> values programmatically (no real keystrokes) silently falls back to a
> cached-or-random ID with no username at all, which looks like "the CLI
> can't carry the username through" but isn't a real bug for interactive use.
>
> To exercise `nights`/`users`/`me` business logic locally, call the raw
> Functions host directly (bypasses the CLI's auth proxy, same code that runs
> in production) — `swa start` prints its port, typically `:7071`. The
> functions read the caller from the base64-encoded `x-ms-client-principal`
> header, so pass one to simulate a signed-in user:
> ```powershell
> $principal = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('{"userId":"abc123","userDetails":"Teyson","userRoles":["authenticated"]}'))
> curl http://localhost:7071/api/me -H "x-ms-client-principal: $principal"
> ```

For frontend-only iteration without the API or database, `npm run dev` runs
the Vite dev server directly (`/api/*` calls will 404 unless `swa start` or a
running Functions host is also available).

### Testing the member/admin views: local dev login

Logging in for real via `/.auth/login/github` (above) is the most accurate way
to test — it exercises the real API and database. For quicker, lower-fidelity
iteration on the frontend's own view states (e.g. what the anonymous or
pending screens look like) without touching the login form or the database,
there's also a small local-only login bar that lets you pick a role directly:

```powershell
copy .env.local.example .env.local
# .env.local is gitignored — never committed, never present in a real deploy
```

Rebuild (`npm run build`) and reload `npm run serve`. A bar appears at the top
of every page with **Anonymous** / **Pending** / **Member** / **Admin**
buttons and a username field — click one and the app immediately renders that
view, no login flow needed. This is safe to use however you like locally:

- It only fabricates the *frontend's* view of who's signed in. Every
  `/api/*` call still goes through the real Azure Functions code — nothing
  about server-side auth changes, so this can't become a real bypass.
- It's gated by `VITE_LOCAL_DEV_LOGIN`, which only exists in your gitignored
  `.env.local` — a fresh clone (including the real Azure build) never has it.
- As a second, independent guard, the bar also refuses to activate anywhere
  except `localhost`/`127.0.0.1`.

To go back to testing the real CLI login flow only, delete `.env.local` and
rebuild.

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
