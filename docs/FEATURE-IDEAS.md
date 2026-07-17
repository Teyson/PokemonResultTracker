# Feature ideas backlog

Thirty-five well-scoped feature ideas for the Pokémon Result Tracker. This file is written
for an implementing agent (or human) picking up **one** idea and building it end-to-end.
Each idea explains what it is, why it's worth doing, how it maps onto this codebase,
an effort estimate, and the pitfalls specific to this repo's architecture.

## How to use this document

1. Pick **one** idea. Don't bundle several into one branch/PR.
2. Read the "Read this first" section below — it lists constraints that are easy to
   violate and hard to debug.
3. Follow [CLAUDE.md](../CLAUDE.md): work on a `feature/<kebab-case>` branch (or
   `fix/`/`chore/` as appropriate), open a PR into `main`, never commit to `main`.
4. Verification bar before opening a PR: `npm run check` (root), `npm run build`
   (root), `npm run build` (in `api/`), and exercise the affected flow manually or
   via browser preview. There is no automated test suite.
5. When an idea is implemented, update its entry here with a line like
   `> **Status: implemented in PR #NN**` in the same PR.

## Read this first — repo constraints every idea inherits

These are the facts about this codebase that most often invalidate a naive
implementation plan. All 35 ideas below assume them.

- **Frontend is prerendered static** (`adapter-static`, `prerender = true` in
  `src/routes/+layout.ts`). There is **no SSR at request time**. Consequences:
  - All data loading happens client-side after hydration (see how
    `src/routes/+page.svelte` calls `/api/nights` in `onMount`-ish flows).
  - **Dynamic route params (`src/routes/deck/[id]/`) do not work** — the build
    can't know which ids to prerender. For detail pages, use a single prerendered
    route that reads a **query string** (e.g. `/deck?name=Gardevoir`) via
    `page.url.searchParams`, client-side.
  - A new top-level route needs a rewrite rule in `staticwebapp.config.json` for
    hard navigations (see the existing `/admin` → `/admin.html` rewrite), because
    the static host otherwise 404s on a deep link. Client-side navigation works
    without it.
- **API is Azure Static Web Apps *managed* Functions** — **HTTP triggers only**.
  No timer triggers, no queue triggers, no SignalR. Any "scheduled" or "push"
  behavior must be redesigned as compute-on-request (compute the digest when a
  page asks for it) or moved to GitHub Actions cron hitting an HTTP endpoint.
- **Free tier auth model**: platform only enforces `authenticated` on `/api/*`
  routes; real member/admin gating happens **inside each function** via
  `resolveRole()` in `api/src/auth.ts`. Every new API function must call it and
  return 401/403 the same way `api/src/functions/nights.ts` does. Never trust
  `userRoles` from the client principal beyond `authenticated`.
- **Database changes go through Drizzle migrations**: edit `api/src/db/schema.ts`,
  run `npm run db:generate` in `api/`, review the SQL under `api/drizzle/`, apply
  with `npm run db:migrate`. **Never `db:push`**, never hand-edit generated SQL.
  Drizzle's MSSQL support is pinned to an `rc` dist-tag — if you hit a missing
  query-builder feature, drop to `sql` template literals rather than upgrading
  packages.
- **Azure SQL serverless auto-pauses.** First query after idle takes seconds.
  Don't interpret a slow first request as a bug; don't add retry loops that mask
  real errors.
- **Request validation is Zod**, colocated in each function file (see
  `nightInputSchema` in `api/src/functions/nights.ts`). Follow that pattern.
- **Scoring model** (do not re-derive it inline): win = 3, tie = 1, loss = 0;
  PPG = points/games, max 3.00. Helpers live in `src/lib/pokemon.ts` (`pts`,
  `games`, `ppg`). New stats should reuse these.
- **Aggregation is currently client-side** over the full `/api/nights` payload.
  At this league's scale (one night/week, a handful of players) that is fine —
  don't prematurely move aggregation server-side unless the idea says to.
- **Svelte 5 runes** (`$state`, `$derived`, `$props`), not legacy stores, for new
  components. Match the style of `src/lib/components/Scoreboard.svelte`.
- **Keep it free**: no new paid Azure resources. Ideas below that touch external
  services use free, keyless (or free-key) APIs only.

**Effort scale** used below:
- **S** — no schema change, one or two files, ≤ a few hours.
- **M** — a schema migration and/or a new API surface, one focused PR.
- **L** — multiple tables or cross-cutting changes; still one PR, but plan carefully.

---

## A. Match-level & competitive depth

The single biggest structural upgrade available. Today a `nights` row stores
aggregate W/T/L; ideas 1–6 progressively unlock per-match data. **Idea 1 is the
foundation** — 2–6 depend on it.

### 1. Per-match logging

> **Status: implemented in PR #11**

**What.** Record each match of a night individually instead of only aggregate
W/T/L. A night becomes a container of matches; W/T/L is derived.

**Why.** Everything interesting about competitive play (matchups, streaks within
a night, opponent tracking) needs per-match granularity. The README's "Extending
it later" section already anticipates this.

**How.**
- Schema: new `matches` table in `api/src/db/schema.ts`:
  `id` (identity PK), `nightId` (FK → `nights.id`), `roundNo int not null`,
  `result nvarchar(1) not null` (`'W' | 'T' | 'L'`), `createdAt`. Generate a
  migration. **Keep the existing `wins/ties/losses` columns on `nights`** and
  keep them authoritative for old rows; for nights that have matches, derive
  W/T/L from matches and write the derived totals back into the same columns on
  every match mutation (inside the same handler). That keeps every existing
  read path (Scoreboard, DeckTable, TrendChart) working untouched.
- API: extend `api/src/functions/nights.ts` — accept an optional
  `matches: [{ result: 'W'|'T'|'L' }]` array in the Zod schema on POST/PUT.
  When present, replace the night's matches (delete + insert inside one
  transaction via `db.transaction`) and recompute `wins/ties/losses`. GET gains
  `matches` on each night in the response (join or second query).
- Frontend: in `src/lib/components/NightForm.svelte`, add a toggle between the
  existing W/T/L steppers ("quick mode") and a per-match list ("detailed mode"):
  a row of W/T/L segmented buttons per match, an "add match" button. In
  `NightsList.svelte`, render a compact match strip (e.g. `W W L T W`) under the
  record when matches exist.
- Update `src/lib/types.ts` (`Night`, `NightInput`).

**Effort:** L. **Pairs with:** 2–6 all build on this.
**Pitfalls.** Don't make matches mandatory — old nights and lazy quick-logging
must keep working. Keep the derived-totals write in the same transaction as the
match writes so the two can't drift. `date`-mode vs `string`-mode column quirks:
follow the existing `nights` column definitions exactly.

### 2. Opponent deck tracking

> **Status: implemented in PR #15**

**What.** On each match (from idea 1), optionally record what the opponent was
playing — a deck name + energy type, reusing the `decks` registry.

**Why.** "How does my Gardevoir do into Charizard?" is the core question of TCG
grinding. This is the data that makes idea 3 possible.

**How.**
- Schema: add nullable `opponentDeckId int` (FK → `decks.id`) to `matches`.
- API: extend the match Zod object with optional `opponentDeck` +
  `opponentType` strings; upsert into `decks` with the same case-insensitive
  name-match logic `nights.ts` already uses for the player's own deck (extract
  that upsert into a shared helper in `api/src/db/` rather than duplicating it).
- Frontend: in the detailed-mode match row (idea 1), add an opponent deck picker
  — reuse the deck-chip + "new deck" pattern from `NightForm.svelte`, ideally
  extracting it into a `DeckPicker.svelte` component used by both.

**Effort:** M (given idea 1). **Depends on:** 1.
**Pitfalls.** Opponent decks pollute the "By deck" table if it naively lists all
decks — `DeckTable.svelte` aggregates from nights, not from the decks table, so
it's naturally unaffected; just verify. Keep opponent entirely optional.

### 3. Matchup win-rate matrix

> **Status: implemented in PR #17**

**What.** A grid: your decks as rows, opponent decks as columns, each cell
showing record and win% for that pairing, color-scaled from red to green.

**Why.** The payoff view for ideas 1–2; instantly answers "what is this deck's
worst matchup".

**How.**
- No schema change. Frontend-only aggregation over nights-with-matches: build a
  `Map<yourDeck, Map<oppDeck, {w,t,l}>>` from the GET payload.
- New component `src/lib/components/MatchupMatrix.svelte`, rendered on the main
  page below `DeckTable` when at least one match has an opponent recorded.
  Horizontal-scroll container (the TrendChart already does this pattern).
  Cells with < 3 games get a muted "low data" style instead of a confident color.
- Color scale: interpolate between two theme colors by win% — don't introduce a
  charting library.

**Effort:** S–M. **Depends on:** 1, 2.
**Pitfalls.** Case-insensitive deck-name matching — reuse the normalization used
by `DeckTable.svelte` so "gardevoir" and "Gardevoir" don't become two rows.

### 4. Turn-order (first/second) stats

> **Status: implemented in PR #19**

**What.** Record whether you went first or second in each match; show win% going
first vs second, overall and per deck.

**Why.** Turn order is one of the strongest variables in the Pokémon TCG; players
genuinely tune deck choices around it. Trivial to capture at log time, impossible
to reconstruct later.

**How.**
- Schema: nullable `wentFirst bit` on `matches` (Drizzle MSSQL: `bit` maps via
  the `bit()` column type; if the rc build lacks it, use `int` with 0/1 and a
  comment).
- API: optional `wentFirst: z.boolean().optional()` in the match schema.
- Frontend: a two-state "1st/2nd" toggle chip in the match row; a small "going
  first vs second" stat pair (record + PPG each) on the Scoreboard and on the
  deck detail page (idea 7) if it exists.

**Effort:** S (given idea 1). **Depends on:** 1.

### 5. Best-of-three game detail

**What.** For each match, optionally record the individual game results
(`WW`, `WLW`, `LL` …) rather than just the match outcome.

**Why.** League nights sometimes play Bo3; game-level data reveals decks that
win long series vs decks that steal game ones. Lower priority than 1–4 — do this
only after those have proven out.

**How.**
- Schema: `games nvarchar(10)` nullable on `matches`, storing a compact string of
  `W`/`L`/`T` chars (max Bo3 + ties; a string beats a third table at this scale).
  Zod: `z.string().regex(/^[WLT]{1,3}$/).optional()`. Keep `result` authoritative
  and validate consistency (a `games` of `WW` with `result: 'L'` → 400).
- Frontend: tap the match result chip to expand per-game toggles.

**Effort:** S–M. **Depends on:** 1.
**Pitfalls.** Don't derive `result` from `games` silently — validate agreement
instead, so quick-logged matches (no games) stay first-class.

### 6. Deck Elo rating

> **Status: implemented in PR #38, but with an open deck-identity conflict —
> not clean-closed.** Ratings are keyed by deck name only (trimmed,
> case-insensitive), same as this idea's own scoping and the same convention
> the pre-existing matchup/opponent-type breakdowns (ideas 2–3) already use.
> Left as-is for now — this is a small casual league, and it hasn't caused
> confusion in practice — but it's a real conflict with how the rest of the
> app models a deck: `decks.ownerId` + the `decks_owner_id_name_unique`
> constraint (scoped *per owner*, not globally) deliberately treat a deck as
> one player's own build, specifically so two players can each have their own
> "Charizard ex" without colliding. Elo (and matchups) instead treat opponent
> decks as one flat, ownerless, name-matched pool. Two players naming the same
> archetype differently ("Gardevoir" vs "Gard/Kirlia") won't unify under
> either scheme today. Cross-owner merging is **not** a fix — `upsertOwnedDeck`
> (`api/src/db/decks.ts`) only ever matches within the calling player's own
> `ownerId`, so the very next night either player logs under that name
> recreates a fresh separate deck and quietly un-merges it. If this starts to
> matter in practice, the properly-scoped fix is a separate archetype identity
> (e.g. a canonical card chosen via a card-search API, per idea 25) layered on
> top of per-player decks — not forcing decks to be shared/multi-owned, and
> not something to build preemptively.

**What.** An Elo-style rating per deck, updated match-by-match when an opponent
deck is recorded, shown as a column in `DeckTable` and a line on the deck detail
page.

**Why.** PPG treats a win over the best deck and the worst deck identically; Elo
adds opponent strength. It's also just fun — leagues love a rating number.

**How.**
- No schema change: compute client-side by replaying all matches in
  chronological order (`played_on`, then night id, then `roundNo`) starting
  everyone at 1000, K=32, ties = 0.5. Put the algorithm in a new pure module
  `src/lib/elo.ts` so it's testable by inspection and reusable.
- Only matches with an opponent recorded move ratings; others are skipped.
- Render current rating in `DeckTable.svelte` and rating-over-time on idea 7's
  page if present.

**Effort:** M. **Depends on:** 1, 2.
**Pitfalls.** Replay order must be deterministic — define and document the tie-
break ordering. Client-side replay is fine at hundreds of matches; note in code
that this moves server-side only if it ever becomes slow.

---

## B. Stats, insights & views

### 7. Deck detail page

> **Status: implemented differently than scoped, in PR #37.** Rather than a
> separate `/deck` route, the trend chart and full night history were added as
> two more collapsible subsections inside `DeckTable.svelte`'s existing
> per-deck foldout (which already covered turn order and matchup breakdowns).
> This matches how the app had already been evolving deck-level detail — no
> new route, no prerender rewrite, no duplicated Scoreboard/nights-fetch
> plumbing. The subsections default collapsed so the foldout doesn't bloat.
> Pick the original query-string-route framing back up only if a shareable
> deep link to a single deck is later wanted for its own sake.

**What.** Click a deck anywhere (DeckTable row, night card chip) → a dedicated
view for that deck: record, PPG, trend chart filtered to that deck, its nights,
and (if ideas 2–3 exist) its matchup breakdown.

**Why.** The main page is a firehose; "how is *this* deck doing" is the most
natural drill-down and currently requires mental filtering.

**How.**
- New prerendered route `src/routes/deck/+page.svelte` reading `?name=<deck>`
  from `page.url.searchParams` (see "Read this first" — **not** `[id]` params).
  Add a `staticwebapp.config.json` rewrite: `/deck` → `/deck.html`, mirroring
  the `/admin` → `/admin.html` rule — the static build emits flat files
  (`build/admin.html`, so a new route emits `build/deck.html`). Verify against
  the actual `build/` output after building. (Note: the comment in
  `src/routes/+layout.ts` claiming the output is `admin/index.html` is stale.)
- Reuse existing components with a filtered nights array: `Scoreboard`,
  `TrendChart`, `NightsList` all already take data as props or can be made to.
  Prefer adding props over forking components.
- Auth/data: same client-side flow as the main page — consume the `auth` context
  from `+layout.svelte`, fetch `/api/nights`, filter by deck name client-side.
  No API change.

**Effort:** M. **Pairs with:** 3, 4, 6 all want a home on this page.
**Pitfalls.** The deep-link/hard-refresh case is the whole reason for the config
rewrite — test by pasting the URL into a fresh tab, not just clicking through.

### 8. Player leaderboard

> **Status: implemented in PR #45**, alongside a shared nav menu.

**What.** A standings view across members: each player's games, record, points,
PPG for the season, ranked. Lives on the main page (admin already fetches
`?scope=all`) or a new `/standings` route visible to all members.

**Why.** It's a league. The shared-log data model already exists; members just
can't see each other yet. This is the highest social-value idea in the list.

**How.**
- API: this is the one deliberate policy change — decide how members see others'
  results. Recommended: add `?scope=all` support **for members** in
  `api/src/functions/nights.ts` GET only (write paths stay owner-only). That's a
  one-line condition change (currently gated on `isAdmin`), plus updating the
  comment/docs. Alternatively add a leaner `GET /api/standings` returning
  server-aggregated per-player totals if you want to keep raw nights private.
- Frontend: `Standings.svelte` — aggregate nights by `createdBy` (the response
  already carries it), reuse `pts`/`ppg` from `src/lib/pokemon.ts`, render a
  ranked table with avatars. Note: `avatarUrl` in `src/lib/auth.ts` takes a
  `ClientPrincipal`, not a handle — for handle-based avatars use
  `https://github.com/${login}.png?size=60` as `src/routes/admin/+page.svelte`
  does (consider extracting that into a shared helper).

**Effort:** M.
**Pitfalls.** Be explicit in the PR that this widens data visibility
member-to-member — it's the intended point of the feature, but say it out loud.
Rank ties by points, then games ascending (reward efficiency); document it.

### 9. Seasons

**What.** Partition play into named seasons (e.g. "Spring 2026"). Scoreboard,
DeckTable, and standings default to the current season; a switcher reveals past
seasons; an all-time view remains.

**Why.** After a year of Tuesdays, all-time averages go stale and newcomers can
never catch up. Seasons reset the race and create natural "champion" moments.

**How.**
- Schema: `seasons` table (`id`, `name nvarchar(100) not null`,
  `startsOn date not null`, `endsOn date` nullable = open). **No FK on
  `nights`** — assign nights to seasons by date range at read time. This means
  zero backfill and no changes to night logging.
- API: new `api/src/functions/seasons.ts` — GET (member) lists seasons;
  POST/PUT/DELETE (admin) manage them. Zod-validate no overlapping ranges.
- Frontend: a season pill-switcher above `Scoreboard`; all client-side
  aggregation (Scoreboard, DeckTable, TrendChart, standings) filters the nights
  array by the selected season's range. A `selectedSeason` piece of state in
  `+page.svelte` passed down, or a tiny runes store in `src/lib/`.
- Admin: manage seasons from `/admin` (a second card under the member list).

**Effort:** M–L. **Pairs with:** 8, 10, 26.
**Pitfalls.** Date-range assignment means an unassigned gap between seasons is
possible — decide that gap nights show only in "All time" and say so in the UI.
Compare `played_on` strings lexicographically (they're ISO `YYYY-MM-DD`) rather
than constructing timezone-sensitive `Date` objects.

### 10. Streaks, records & milestones

> **Status: implemented in PR #32**

**What.** A "Records" panel: current/longest night win-streak (nights with
positive record), longest match win-streak (with idea 1), best night ever,
personal-best PPG season, 100th game played, etc.

**Why.** Cheap delight. Turns existing data into bragging rights; zero schema.

**How.**
- Frontend-only: new pure module `src/lib/records.ts` computing records from the
  nights array (chronological walk), and `Records.svelte` rendering 3–6 stat
  cards. Show on the main page under the Scoreboard, collapsed behind a
  "Records" toggle to avoid clutter.
- Define "winning night" as points > games (PPG > 1 means above .500 in this
  scoring — actually define it as `w > l` for intuitiveness and document it).

**Effort:** S.
**Pitfalls.** Off-by-one hell in streak logic — write the walk as a small pure
function with explicit cases; be careful that ties break match win-streaks but
maybe not "unbeaten" streaks (track both, label precisely).

### 11. Energy-type performance breakdown

> **Status: superseded.** Built as a standalone panel in PR #34, then
> deliberately removed in favor of the opponent-type breakdown inside each
> deck's foldout (same PR) — that answers a more useful question ("how does
> *this* deck do into Fire decks") than the original scope ("how do my
> Psychic decks do overall"). The original standalone panel is not on `main`;
> pick this idea back up if the original framing is still wanted.

**What.** Aggregate results by the deck's energy type: a per-type record/PPG bar
list or small multiples, colored with the existing type palette.

**Why.** The type colors are already everywhere (chips, TrendChart bars) but
carry no analytical weight. This answers "do my Psychic decks outperform my
Lightning decks" for free.

**How.**
- Frontend-only. Aggregate nights by the `type` field already present in
  `NightResponse`. New `TypeBreakdown.svelte`: one row per type — `TypeIcon`,
  type name, record, PPG, and a horizontal bar sized by PPG (0–3 scale) filled
  with `colorOf(type)` from `src/lib/pokemon.ts`.
- Show when ≥ 2 distinct types exist (mirror `DeckTable`'s ≥ 2 decks rule).

**Effort:** S.

### 12. Attendance calendar heatmap

> **Status: implemented in PR #40**

**What.** A GitHub-style year grid of Tuesdays, each cell colored by that
night's PPG (or grey for skipped weeks), with hover/tap showing the date and
record.

**Why.** Shows consistency at a glance — both attendance ("we skipped three
Tuesdays in March") and form over the year. Very high charm-to-effort ratio.

**How.**
- Frontend-only. New `CalendarHeatmap.svelte`: compute all Tuesdays of the
  selected year (reuse/generalize `recentTuesday` in `src/lib/pokemon.ts`),
  map nights by `played_on`, render an SVG or CSS-grid of squares. Non-Tuesday
  nights (they can exist — the date picker is free) get their own cells appended
  or are folded into the nearest week; pick one and comment it.
- Color: 4-step scale from the theme's muted color to the success color by PPG.

**Effort:** S–M.
**Pitfalls.** Do all date math on ISO strings / UTC — local-timezone `Date`
arithmetic around midnight will shift days for users in other timezones.

### 13. Rolling form indicators

> **Status: implemented in PR #35**

**What.** "Form" chips: last-5-nights PPG next to the season PPG on the
Scoreboard (with an up/down arrow vs season average), and a tiny sparkline per
deck row in `DeckTable`.

**Why.** Season averages hide momentum. "Am I improving lately?" is currently
answered by squinting at TrendChart.

**How.**
- Frontend-only. `rollingPpg(nights, n)` helper in `src/lib/pokemon.ts`.
  Scoreboard: add a "Last 5" stat with ▲/▼ vs season PPG. DeckTable: a 40×14
  inline SVG polyline of that deck's last-8-nights PPG per row (new tiny
  `Sparkline.svelte`).

**Effort:** S.

### 14. Head-to-head player comparison

**What.** Pick two members, see their stats side by side: record, PPG, favorite
decks, trend lines overlaid in one chart.

**Why.** Friendly rivalry is the fuel of a weekly league. Builds directly on the
visibility decision made in idea 8.

**How.**
- Depends on members seeing each other's nights (idea 8's API change).
- New route `src/routes/compare/+page.svelte` (query-string players:
  `?a=Teyson&b=friend`; add the static-host rewrite rule). Two player pickers,
  then two `Scoreboard`-style columns plus one `TrendChart` variant accepting
  two series (extend `TrendChart.svelte` with an optional second dataset drawn
  as an outlined series rather than forking it).

**Effort:** M. **Depends on:** 8.
**Seasons (#9) note.** Filter both players' nights with `nightInSeason`
(`src/lib/pokemon.ts`) behind the same switcher as the main page, defaulting to
the current season — reuse the `SeasonSwitcher` extraction proposed in idea 32
rather than forking the pill + overflow-dropdown UI.

### 15. Night report — the Tuesday recap

**What.** A per-date league view: pick a date (default: most recent played
night), see everyone's results that night, the night's best performance, and
deck diversity (types played).

**Why.** "How did Tuesday go?" as one screen — the league's shared story,
whereas idea 8 is the season-long race.

**How.**
- Depends on idea 8's visibility change (needs everyone's nights).
- Frontend-only after that: group nights by `played_on`, list of dates with
  night cards grouped per player, a "star of the night" line (highest PPG, min
  3 games, tie-break by games). Either a section on the main page or a
  `/nights` route (query-string date, rewrite rule as usual).

**Effort:** S–M. **Depends on:** 8.
**Seasons (#9) note.** Group the browsable date list by season (gap dates under
an "off-season" heading) so a year of Tuesdays stays navigable.

---

## C. Data entry, management & robustness

### 16. Deck management page

> **Status: implemented in PR #28**

**What.** A `/decks` admin view listing every deck in the registry with rename,
change-energy-type, **merge into another deck** (repoints nights, deletes the
duplicate), and delete-if-unused.

**Why.** The deck registry only ever grows and only via upsert-by-name. One typo
("Gardvoir") creates a permanent phantom deck that splits stats. Merge is the
real killer feature here.

**How.**
- API: new `api/src/functions/decks.ts` — `GET /api/decks` (member; include a
  per-deck nights count via a grouped join), `PUT /api/decks/{id}` (admin;
  rename/retype; Zod; 409 on name collision with a *different* id),
  `POST /api/decks/{id}/merge` (admin; body `{ targetId }`: transactionally
  `UPDATE nights SET deck_id = target WHERE deck_id = id`, also
  `matches.opponent_deck_id` if idea 2 exists, then delete the source deck),
  `DELETE /api/decks/{id}` (admin; 409 if any nights reference it).
- Frontend: `/decks` route (rewrite rule), or a card on `/admin`. Rows with
  usage counts; merge opens a target-deck picker with a `confirm()` (matching
  the delete-confirm pattern in `admin/+page.svelte`).

**Effort:** M–L.
**Pitfalls.** Merge must be a single transaction. Case-insensitive collision
check on rename (the registry is matched case-insensitively elsewhere). Decide
member vs admin for rename — recommended: admin-only for all mutations, GET for
members (the form's deck chips could use it later).

### 17. Quick-log: repeat last night

**What.** A one-tap "Same as last time" button on `NightForm` that pre-fills the
most recent night's deck (and opens W/T/L at 0-0-0 with today's/next Tuesday's
date), turning the common case into two taps.

**Why.** Most players run the same deck for weeks. The form already defaults the
date; deck choice is the remaining friction on a phone at a noisy game night.

**How.**
- Frontend-only. `NightForm.svelte` already receives (or can receive) the nights
  array — take the newest night's deck/type and render a prominent shortcut chip
  above the deck picker: "▶ Log another night with *Gardevoir*". Selecting it
  just pre-selects that deck chip.

**Effort:** S.

### 18. Nights list filtering & search

**What.** Filter controls above `NightsList`: by deck (dropdown of decks seen),
by energy type, by date range (this season/last 30 days/all), plus free-text
search across deck names and notes.

**Why.** The list is chronological-only; after months of Tuesdays, finding "that
night I noted the mulligan rule" means endless scrolling.

**How.**
- Frontend-only: filter the already-fetched array in `+page.svelte` (a
  `$derived` filtered view), controls in a new `NightsFilter.svelte`. Debounce
  is unnecessary — it's in-memory.
- Keep filter state in the URL query string (via `replaceState`) so a filtered
  view is shareable/bookmarkable and survives refresh.

**Effort:** S.
**Pitfalls.** When idea 19 (pagination) lands, in-memory filtering breaks —
if both are planned, land 19 first or note the interaction in the PR.
**Seasons (#9) note.** The "this season" date-range option should come from
`/api/seasons` rather than a hardcoded range — and since the main page now has
a season switcher (shipped with #9), this filter should compose with the active
season selection (filter within the already-season-filtered nights) instead of
adding a second, competing date filter.

### 19. API pagination for nights

**What.** `GET /api/nights?limit=50&offset=0` (or cursor `?before=<id>`), with
the frontend loading the first page and a "Load more" button.

**Why.** Pure future-proofing: a full-table fetch per page-load is fine today
but degrades linearly forever. Cheap to do now, annoying to retrofit after five
more features assume the full array.

**How.**
- API: extend `nights.ts` GET with Zod-validated `limit` (default 100, max 200)
  and `offset` query params; keep the existing ordering as the stable sort.
  Return `{ nights, total }` — **but** this changes the response shape, so
  either (a) keep returning a bare array when no params are passed (backward
  compatible), or (b) update every caller in the same PR. Prefer (a).
- Frontend: "Load more" under `NightsList`. **Important:** Scoreboard/DeckTable/
  TrendChart aggregate over the fetched array — with pagination they'd silently
  aggregate a partial season. Either keep fetching all for aggregates and
  paginate only the *list rendering* (simplest, recommended at this scale), or
  add a server-side aggregate endpoint. State the choice in the PR.

**Effort:** M.
**Pitfalls.** The partial-aggregation trap above is the whole difficulty of this
idea — call it out explicitly.
**Seasons (#9) note.** The season switcher filters client-side over the full
nights array, so it's one more aggregate-style consumer: either keep fetching
everything for the switcher and aggregates and paginate only the list rendering
(the recommended option above), or move season filtering server-side with
date-range params.

### 20. Soft delete with undo

> **Status: implemented in PR #25**

**What.** Deleting a night flags it instead of removing it; the toast becomes
"Night deleted — Undo" for ~6 s; an admin can see/restore recently deleted
nights.

**Why.** Delete is currently permanent behind a native `confirm()`. Fat fingers
on phones at game night are the norm, and there's no backup story.

**How.**
- Schema: nullable `deletedAt datetime2` on `nights`.
- API: DELETE sets `deletedAt` instead of deleting; all GET queries add
  `WHERE deleted_at IS NULL`; new `POST /api/nights/{id}/restore` (owner or
  admin) nulls it. Optionally purge rows older than 30 days opportunistically
  inside the DELETE handler (no timers exist — see constraints).
- Frontend: extend `Toast.svelte`/`toast.svelte.ts` with an optional action
  button (`toast(msg, { action: { label, onClick } })`); wire undo to restore.
  Remove the `confirm()` on night delete once undo exists — undo is strictly
  better UX.

**Effort:** M.
**Pitfalls.** Grep for every query that reads `nights` (including seed/stats
paths and any features landed from this list) and add the filter — one missed
path resurrects ghosts.

### 21. Optimistic UI updates

**What.** Create/edit/delete of nights update the list immediately, with
rollback + error toast if the API call fails.

**Why.** Azure SQL serverless auto-pauses; the first write of an evening can
take seconds. The form currently feels frozen exactly when the league is trying
to log results.

**How.**
- Frontend-only, all in `src/routes/+page.svelte` handlers: on save, insert a
  temp night (`id: -Date.now()`, correct sort position) and clear the form
  immediately; replace with the server row on success, remove + re-populate the
  form + error toast on failure. Delete: remove immediately, restore on failure.
  Give the temp row a subtle pending style in `NightsList.svelte`.

**Effort:** S–M.
**Pitfalls.** Edits during a pending create (temp id) — simplest correct rule:
disable edit/delete buttons on pending rows. Combine carefully with idea 20's
undo (undo should only appear after the server confirms).

### 22. CSV / JSON export & import

**What.** "Export" button downloading all your nights (admin: everyone's) as CSV
and JSON; an admin-only import that ingests the same format.

**Why.** It's the league's history in a free-tier database with no backup story.
Export is data insurance; import enables migration and disaster recovery.

**How.**
- Export can be frontend-only: serialize the already-fetched nights array
  (columns: date, deck, type, w, t, l, notes, createdBy; matches too if idea 1
  exists — as a nested JSON field, and a `matches` summary string in CSV),
  trigger download via a `Blob` + object URL. Quote/escape CSV fields properly
  (notes contain commas/quotes/newlines) — write a tiny `toCsv` helper in
  `src/lib/`, no dependency.
- Import: new admin-only `POST /api/import` accepting the JSON form only
  (CSV parsing server-side isn't worth it), Zod-validating an array of night
  inputs, reusing the existing deck-upsert + insert logic from `nights.ts`
  (extract shared helpers). Dry-run mode (`?dryRun=1`) returning what *would*
  be created, then a confirm step in the UI.
- UI: export button near the Nights header; import card on `/admin`.

**Effort:** M (export alone: S).
**Seasons (#9) note.** Include a derived `season` name column in exports —
resolve each night's season by date range at export time (there's no FK, so the
export is the only place it materializes). Import needs no change; season
membership re-derives automatically from the dates.
**Pitfalls.** Import assigns ownership — imported nights should belong to the
importing admin unless the JSON carries a `createdBy` that matches an existing
user's `github_login`; define and Zod-enforce the rule. Never allow import to
delete anything.

---

## D. Look & feel, platform & fun

### 23. Dark mode

> **Status: implemented in PR #33**

**What.** Honor `prefers-color-scheme: dark` with a manual three-way override
(auto/light/dark) persisted in `localStorage`, toggled from the top bar.

**Why.** Game nights are literally at night; a white screen at the table is a
flashlight.

**How.**
- Audit the styles (global CSS in `src/routes/+layout.svelte` / `app.html` and
  per-component `<style>` blocks): lift the palette into CSS custom properties
  on `:root` if not already, add a `[data-theme="dark"]` override set, and a
  `@media (prefers-color-scheme: dark)` block for auto mode.
- Set `data-theme` on `<html>` from a tiny inline script in `src/app.html`
  (reads `localStorage` **before** first paint to avoid the light-flash), plus
  a toggle component that updates both.
- The energy-type hex colors in `src/lib/pokemon.ts` are used inside SVGs —
  check contrast of type-colored bars/labels against the dark background;
  adjust with a per-theme lightness tweak only if actually unreadable.

**Effort:** M (the work is the audit, not the mechanism).
**Pitfalls.** Prerendered pages mean the inline pre-paint script is mandatory —
doing it in `onMount` guarantees a flash. Keep the `TypeIcon` PNGs as-is.

### 24. PWA: installable + offline read

**What.** A web-app manifest + service worker so the tracker installs to a phone
home screen and, when offline, still shows the last-fetched nights (with an
"offline — showing cached data" banner). Writes stay online-only.

**Why.** Game stores have bad Wi-Fi. Read-your-stats offline plus a proper home
screen icon makes it feel like the app it already almost is.

**How.**
- Add `static/manifest.webmanifest` (name, icons — generate from the PokeBall
  SVG, theme color) linked from `src/app.html`.
- Service worker via SvelteKit's built-in convention (`src/service-worker.ts`):
  precache the build assets (`build` + `files` from `$service-worker`), and use
  a network-first-falling-back-to-cache strategy for `GET /api/nights` and
  `/api/me` **only** (never cache mutations, never cache `/.auth/*`).
- Frontend: detect a cache-served response (add a header check or a flag via
  the SW) and show the offline banner.

**Effort:** M.
**Pitfalls.** Service-worker staleness is the classic footgun — version the
cache with the `version` export from `$service-worker` and delete old caches on
`activate`, or users get stuck on old builds. `staticwebapp.config.json` sets
global `cache-control: no-store`; the SW's own cache is unaffected, but confirm
the SW file itself is served fetchable (it is, as a build asset).

### 25. Card-art deck covers (Pokémon TCG API)

**What.** Let a deck have a cover card: when creating/editing a deck, search the
free [pokemontcg.io](https://pokemontcg.io) API by Pokémon name, pick a card,
and its image becomes the deck's avatar in chips, tables, and the deck page.

**Why.** Pure charm — the app is functional but text-heavy; card art makes each
deck instantly recognizable and personal.

**How.**
- Schema: nullable `coverImageUrl nvarchar(300)` on `decks`.
- The card search should be a thin API proxy (`GET /api/cards?q=name`) rather
  than a direct browser call, so the API key (free tier: 20k req/day; works
  keyless at lower limits) stays server-side in app settings. Cache nothing;
  usage is tiny.
- API: extend deck mutation paths (idea 16's `decks.ts` if present, else the
  upsert path) to accept `coverImageUrl` (Zod: must start with
  `https://images.pokemontcg.io/`) — validate the prefix server-side so the
  column can't become a link dump.
- Frontend: in the new-deck flow in `NightForm.svelte` (or the deck manager,
  idea 16), a "choose cover" step showing a grid of card thumbnails from the
  search. Render covers as small rounded thumbnails in `DeckTable` rows and
  night cards; fall back to `TypeIcon` when absent.

**Effort:** M–L. **Pairs with:** 16 (natural home for the picker).
**Pitfalls.** Hot-linking images from `images.pokemontcg.io` is how that API is
designed to be used, but images are external — add `loading="lazy"` and a
graceful broken-image fallback to the TypeIcon.

### 26. Achievements & badges

> **Status: implemented in PR #39**

**What.** Automatically-earned badges rendered on the main page and next to
player names: "First Blood" (first win), "Perfect Night" (3+ wins, 0 losses),
"Loyalist" (10 nights on one deck), "Scientist" (5 different decks), "Iron
Tuesday" (8 consecutive weeks attended), etc.

**Why.** Weekly-league retention magic. Also entirely derivable — no schema.

**How.**
- Frontend-only: `src/lib/achievements.ts` exporting a list of
  `{ id, name, emoji, description, test(nights) }` definitions and an evaluator
  returning earned badges (+ the night on which each was earned, found by
  walking chronologically). New `Badges.svelte` showing earned badges (earned in
  color, unearned greyed with progress where cheap, e.g. "7/10 nights").
- Keep every rule a pure function over the nights array so adding a badge is a
  one-object diff. Start with ~8 badges; more are trivial follow-ups.
- With idea 8's visibility, standings rows can show badge counts.

**Effort:** S–M. **Pairs with:** 8, 9, 10.
**Pitfalls.** "Consecutive weeks" needs the same Tuesday/ISO-date care as
idea 12 — share a date helper, don't duplicate.

### 27. Public read-only share link

**What.** An opt-in public snapshot of the scoreboard: an unauthenticated page
(e.g. `/share?key=<token>`) showing season standings and the trend chart, no
names beyond GitHub handles, no editing. Admin can enable/disable/rotate the
token.

**Why.** The league will want to show off; today nothing is visible without
being whitelisted. A tokened read-only view shares the fun without opening the
data.

**How.**
- Schema: a `settings` key/value table (`key nvarchar(50) pk`,
  `value nvarchar(500)`) holding `shareToken` (null/absent = disabled). A
  settings table is also reusable by future ideas (28).
- API: `GET /api/share?key=<token>` — **anonymous route** (add
  `/api/share` with `"allowedRoles": ["anonymous"]` in
  `staticwebapp.config.json` — note other `/api/*` rules require
  `authenticated`; this one must be listed explicitly). Handler compares the
  token (constant-time compare via `crypto.timingSafeEqual`), returns a
  **curated aggregate payload** (standings numbers, per-night PPG series), never
  raw nights/notes. Admin endpoints to generate/rotate/disable the token
  (random 32-hex via `crypto.randomBytes`).
- Frontend: `/share` prerendered route (rewrite rule) that fetches with the key
  from the query string; admin card on `/admin` with the share URL +
  copy/rotate/disable.

**Effort:** M–L.
**Pitfalls.** This is the only idea that adds an anonymous endpoint — keep the
payload aggregate-only and notes-free, and don't leak member GitHub handles if
the league prefers not to (make handle display a choice in the PR). Get the
`staticwebapp.config.json` route ordering right and test unauthenticated in a
private browser window.
**Seasons (#9) note.** "Season standings" can now mean a real season: default
the shared payload to the current season (fall back to all-time when no season
contains today) and include the season name in the payload so the public page
can label what it's showing.

### 28. Personal season goals

**What.** Each member sets simple goals for the season ("PPG ≥ 1.8", "play 20
nights", "try 5 decks"), with progress bars on their main page.

**Why.** Self-directed motivation that doesn't require comparing yourself to
others — the introvert's counterpart to idea 8.

**How.**
- Schema: `goals` table (`id`, `ownerId` FK → `users.id`, `metric nvarchar(20)`
  — enum-in-Zod of `ppg | nights | wins | decks`, `target int not null`,
  `seasonId` nullable FK if idea 9 exists, else `year int`, `createdAt`).
- API: new `goals.ts` function — GET/POST/DELETE, owner-scoped exactly like
  nights (copy that function's auth/ownership skeleton).
- Frontend: `Goals.svelte` — progress computed client-side from the nights
  array against each goal; a small "add goal" form (metric select + number).

**Effort:** M. **Pairs with:** 9.
**Seasons (#9) note.** Idea 9 has shipped, so take the `seasonId` branch of the
schema above: nullable `seasonId int` referencing `seasons.id` — either a plain
column with no DB-level FK (matching how `nights` relate to seasons) or an FK
with `ON DELETE SET NULL`, so deleting a season neither fails on referencing
goals nor deletes them. Compute progress by filtering the nights array with `nightInSeason`
(`src/lib/pokemon.ts`).

### 29. Deck randomizer — "what should I play tonight?"

**What.** A playful picker: a button that spins through your known decks (or all
league decks) with a slot-machine animation and lands on tonight's deck.
Optional weighting: "least played recently" or "worst matchup coverage" modes.

**Why.** Zero-stakes fun that solves a real Tuesday argument. Features like this
are why hobby apps get opened.

**How.**
- Frontend-only. `Randomizer.svelte` on the main page (collapsed behind a 🎲
  button in the Nights header): builds the candidate list from the decks seen in
  the nights array (or `/api/decks` if idea 16 landed), animates via a timed
  `$state` index shuffle (ease-out interval growth), announces the result, and
  offers "Log a night with this deck" which pre-selects it in `NightForm` (the
  wiring idea 17 also needs — share it).
- Weighted mode: probability ∝ days since the deck was last played.

**Effort:** S.
**Pitfalls.** `prefers-reduced-motion` — skip the animation and just show the
result when set.

### 30. Admin audit log

> **Status: implemented.** Scoped to the What section's exact list: member
> add/remove, an admin editing/deleting a night they don't own, and deck
> rename/merge. Deck delete and idea 22's import (not yet built) aren't
> logged — pick those up if/when they land.

**What.** Record every admin/mutating action (member added/removed, night
edited/deleted by an admin who isn't the owner, deck merge/rename, import) into
an `audit_log` table, viewable on `/admin`.

**Why.** Multiple admins and destructive operations (merge, import, delete) with
no history is how "who deleted my night" becomes unanswerable. Also the safety
net that makes ideas 16 and 22 comfortable to ship.

**How.**
- Schema: `audit_log` table (`id`, `actorUserId nvarchar(200) not null` (SWA
  userId), `actorLogin nvarchar(100)`, `action nvarchar(50)` — e.g.
  `user.add`, `night.delete.admin`, `deck.merge`, `detail nvarchar(500)` —
  human-readable summary string (keep it a string, not JSON — this is a log,
  not a data source), `createdAt`).
- API: small `logAudit(db, actor, action, detail)` helper in `api/src/db/`,
  called from `users.ts` (add/remove), `nights.ts` (admin-on-other's-night
  edit/delete only — don't log members' own edits), and any landed 16/22
  endpoints. A logging failure should **not** fail the action: wrap the call in
  try/catch and log via `context.error` — mirror how `resolveRole` in
  `api/src/auth.ts` isolates its `ensureUser` directory-write call so a
  failure there never denies access.
- New `GET /api/audit?limit=50` (admin) and a chronological list card on
  `/admin`.

**Effort:** M.
**Pitfalls.** Decide retention (keep forever is fine at this scale; note it).
Never log note contents or anything a member might consider private — log *that*
a night was deleted and whose/when, not its body.

---

## E. Season follow-ups

Idea 9 is implemented (PR #48): admin-managed seasons on a dedicated `/seasons`
page, a `seasons` table with **no FK from `nights`** (membership derived by date
range at read time), pure helpers `nightInSeason`/`currentSeasonId` in
`src/lib/pokemon.ts`, and a season switcher on the main page (recent-season
pills plus a "More" overflow dropdown) filtering Scoreboard, DeckTable, and the
nights list. Three boundaries were left in place deliberately, and ideas 31–35
build on or revisit them: Records (#10), Badges (#26), and the calendar heatmap
(#12) still receive the full unfiltered nights array (they're lifetime and
attendance views by nature), and the Leaderboard (#8) stays all-time because it
aggregates server-side for privacy.

### 31. Season awards & champion recap

**What.** Automatically-computed per-season awards, distinct from #26's lifetime
badges: Season Champion (best PPG among members, minimum games), most nights
attended, best deck of the season, biggest single night — shown when an ended
season is selected in the switcher, with the current season's marked
provisional.

**Why.** #26's badges are one-shot lifetime milestones — once earned, done
forever. Seasons create a repeatable award cycle, and that cycle is the real
retention loop: every season, everyone starts from zero again.

**How.**
- Frontend-only for the personal awards: follow the `src/lib/achievements.ts`
  evaluator pattern — a new `seasonAwards.ts` + panel fed season-filtered
  nights via `nightInSeason`. Do **not** repoint the existing `Badges.svelte`
  at filtered nights; the main page passes it the full array deliberately.
- The champion/cross-player awards need other members' season numbers — that's
  idea 32's endpoint. Ship the personal awards first if 32 isn't in yet.

**Effort:** S–M. **Depends on:** 9; the champion award depends on 32.
**Pitfalls.** An open-ended season (null `endsOn`) isn't decided — only render
"champion" for ended seasons and label the running season's awards provisional.

### 32. Season-scoped leaderboard

**What.** The same season switcher the main page has, on `/leaderboard`:
defaults to the current season, past seasons selectable, "All time" still
available.

**Why.** Idea 9 deliberately left the leaderboard all-time-only because it
aggregates server-side (keeping raw nights private between members). But the
season is where the race actually is — an all-time-only leaderboard goes stale
for exactly the reason seasons exist.

**How.**
- API: extend the leaderboard GET with an optional Zod-validated `?seasonId=`;
  the handler looks up that season's range and filters `played_on` in SQL
  (`>= startsOn`, and `<= endsOn` when set) **before** aggregating, so the
  privacy boundary stays server-side. No param = all-time, keeping the
  response backward compatible.
- Frontend: first extract the pill + "More" overflow switcher out of
  `src/routes/+page.svelte` into `src/lib/components/SeasonSwitcher.svelte`,
  then use it on both pages — don't fork the overflow-dropdown logic. Keep the
  default-to-current-season decision in each page, not in the component.

**Effort:** M. **Depends on:** 8, 9. **Pairs with:** 31, 33.
**Pitfalls.** An unknown `seasonId` should 404, not silently return all-time.
When extracting the switcher, keep the main page pixel-identical — it's now the
most-seen control in the app.

### 33. Season recap & hall of fame

**What.** For each ended season, a recap view: final top-3 standings, best deck
(minimum games), biggest night, and totals (nights/games played) — plus a "hall
of fame" strip listing every past season's champion.

**Why.** Idea 9's own pitch was that seasons "create natural champion moments" —
this is that moment's payoff screen. Without it, a season just ends silently.

**How.**
- Derive everything at read time from the season-scoped leaderboard (32) plus
  the member's own nights — no snapshot table, consistent with the no-FK
  design. The hall of fame maps ended seasons → champion via the same endpoint.
- Home: `/leaderboard` — a recap card when an ended season is selected, and the
  hall-of-fame strip above the standings. (`/seasons` is admin-only, so the
  recap can't live there.)

**Effort:** M. **Depends on:** 32.
**Pitfalls.** Deriving means a past champion can retroactively change if an old
night is edited or deleted — at this scale that's self-correcting, not a bug,
but don't cache or snapshot recap results anywhere.

### 34. Season progress header

**What.** A one-line context strip next to the season switcher: "Spring 2026 ·
week 6 of 13 · ends Jun 30", shifting to a countdown tone in the final weeks,
and an "off-season" hint when today falls in a gap between seasons. Optionally
mark season boundaries on the calendar heatmap (#12) with subtle separators.

**Why.** Seasons only change behavior if people can feel where they are in one —
"3 weeks left" is what makes a late-season push happen.

**How.**
- Frontend-only. Helpers live next to `nightInSeason`/`currentSeasonId` in
  `src/lib/pokemon.ts`; week math is counting Tuesdays between ISO dates, with
  the same UTC-safe date handling as #12 (share the helper, don't duplicate).
- Open-ended seasons (null `endsOn`) render "week 6" with no total and no
  countdown.

**Effort:** S. **Depends on:** 9.
**Pitfalls.** The usual ISO/UTC discipline — no local-timezone `Date`
arithmetic. Keep it one line; it's context, not a widget.

### 35. Season-over-season trends

**What.** A compact per-season breakdown of your own play: one row per season
(name, nights, record, PPG, ▲/▼ vs the previous season), plus per-season bests
in the Records panel — #10's scope already lists "personal-best PPG season",
which can now mean a real season instead of a proxy.

**Why.** #13's form chips answer "lately" and #10's records answer "ever";
seasons add the natural middle timescale — "am I actually improving season over
season?"

**How.**
- Frontend-only: group the nights array by season via `nightInSeason`, reuse
  `pts`/`games`/`ppg` from `src/lib/pokemon.ts`. Render as a collapsible near
  the Records panel, or as new record cards inside it ("Best season: Spring
  2026 · 2.10 PPG").
- Gap nights belong to no season: exclude them from season rows (consistent
  with the switcher) and don't present the rows as summing to the all-time
  totals.

**Effort:** S. **Depends on:** 9. **Pairs with:** 10, 13.
**Pitfalls.** Put a minimum-games floor under "best season" records (and say so
in the label), or one lucky three-game season tops the list forever.

---

## Suggested first picks

If you're an agent choosing without further user input, the best
value-to-risk picks are, in order:

1. **#8 Player leaderboard** — the league's most-wanted view; small API change.
2. **#1 Per-match logging** — unlocks the entire A section; do it early, before
   more features assume aggregate-only nights.
3. **#23 Dark mode** — universally appreciated, no data risk.
4. **#16 Deck management** — fixes real data-quality pain (typo decks).
5. **#10 / #11 / #13** — pure-frontend stats with zero migration risk, good
   warm-up tasks.

Ideas requiring an explicit product decision from the user before implementing:
**#8/#14/#15** (member-to-member visibility) and **#27** (public exposure).

> **Update (July 2026):** all five original picks above have shipped, and #8's
> visibility decision has been made (members see the leaderboard). Best current
> picks among what's left: **#32** (season-scoped leaderboard — unlocks 31 and
> 33), **#22** export (data insurance, S on its own), **#17** quick-log,
> **#18** nights filtering, and **#14/#15** now that #8 has settled the
> visibility question. **#27** still needs its own product decision.
