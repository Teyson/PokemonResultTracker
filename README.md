# Pokémon Result Tracker

A private, cross-device Pokémon TCG results tracker for our Tuesday nights at Spilforsyningen.
Built to run **free** on Azure: Static Web Apps (frontend + API) + Azure SQL (database).

- **Frontend** — `index.html` (tracker) and `admin.html` (member whitelist). Plain HTML/JS, no build step.
- **API** — Azure Functions (Node 20) in `api/`, talking to Azure SQL via `mssql`.
- **Auth** — Static Web Apps built-in GitHub login. Only whitelisted users can read/write; the admin manages the whitelist from `/admin.html`.

```
Phone / Laptop ──▶ Static Web App (free)
                    ├─ /            index.html  (tracker)
                    ├─ /admin.html  member whitelist (admin only)
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
5. Create it. When it's ready, open the database → **Query editor** → sign in with the SQL admin login → paste the contents of [`sql/schema.sql`](sql/schema.sql) → **Run**.
6. On the **SQL server** resource → **Networking** → enable **"Allow Azure services and resources to access this server"** → Save. (This lets the Functions reach the DB.)

### 3. Create the Static Web App (Free) and connect the repo

1. Portal → **Create a resource** → **Static Web App** → *Create*.
2. Plan type: **Free**.
3. Deployment: **GitHub** → authorize → pick your `PokemonResultTracker` repo and the `main` branch.
4. Build details:
   - **App location:** `/`
   - **Api location:** `api`
   - **Output location:** *(leave blank)*
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

## Local development (optional)

```powershell
npm install -g @azure/static-web-apps-cli azure-functions-core-tools@4
cd api
npm install
copy local.settings.json.example local.settings.json   # then fill in your SQL_* values
cd ..
swa start . --api-location api
```

Note: local GitHub login is emulated by the SWA CLI (you can type any username and
roles), so you can test the admin/member gates without real auth.

---

## Extending it later

The schema is deliberately relational so it can grow:

- **Per-match logging:** add a `matches` table (`id, night_id FK, round_no, opponent_deck, result`)
  and derive W/T/L from it instead of storing aggregates.
- **Opponent / meta tracking:** reuse `decks` for opponent decks; add a `players` table.
- **Per-user records:** `nights` already has room for a `user_id` column if you want each
  member's own standings rather than a shared log.

Add a new API route by dropping another file in `api/src/functions/` — the v4
programming model registers it automatically.
