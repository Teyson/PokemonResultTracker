# Feature ideas backlog

Eighty well-scoped feature ideas for the Pokémon Result Tracker. This file is written
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
implementation plan. All 70 ideas below assume them.

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

> **Status: implemented in PR #48.** Season creation/editing/deletion is
> admin-only, from a dedicated `/seasons` page (not a card under `/admin`)
> linked from the nav menu, per the user's refinement of this idea's original
> scoping. The Leaderboard page (idea #8) was deliberately left out of the
> season-filtering — it aggregates server-side for privacy, and scoping it by
> season is a separate change to that boundary.

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

> **Status: implemented differently than scoped.** The user's own read on this
> idea, after hearing the original "Same as last time" button framing: the
> shortcut button/pre-fill wiring wasn't needed — what actually mattered was
> not having to hunt for the right deck chip. So the fix is narrower than
> scoped: `NightForm.svelte`'s own-deck chip list (`deckRegistry()`) is now
> sorted by most-recently-played-first, explicitly by each deck's latest
> `date` across the player's nights, rather than left in whatever order the
> chips happened to be built in. No new button, no pre-fill, no date/W-T-L
> defaulting beyond what already existed. The common case (same deck as last
> week) is now "it's already the first chip" rather than "tap a shortcut" —
> fewer moving parts for the same practical win. No schema or API change.
> Follow-up, same idea: `DeckPicker.svelte`'s plain (non-searchable) chip row
> — used only for this own-deck field — now caps itself at the 3 most recent
> chips plus a "More ▾" pill that opens a dropdown of the rest, still in
> recency order. Same interaction pattern as `SeasonSwitcher.svelte`'s
> pill-row-plus-overflow-dropdown (outside-click/Escape-to-close, the trigger
> relabels itself to the selected item's name when the selection is in the
> overflow). Keeps the row from growing unbounded as a player's deck history
> accumulates, without hiding anything — everything is still one click away.

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

> **Status: implemented**, bundled in the same PR as #33 per the user's request.
> A `src/lib/seasonAwards.ts` (`personalSeasonAwards`) and a new
> `SeasonAwards.svelte` panel live on `/leaderboard`, shown only when a
> selected season has **ended** — the user's own call, overriding this idea's
> original "show a provisional version of the running season too" framing;
> the running season shows only the live standings table, no awards panel.
> The panel is collapsible (matches the `Records.svelte`/`Badges.svelte`
> toggle convention), defaulting open. It shows: the champion (from the
> already-fetched season-scoped leaderboard entries, with a "That's
> you!"/"You're #N" line); **"most nights attended"** and **"best deck"**
> as genuine league-wide superlatives per the user's follow-up
> clarification (not personal numbers as first shipped) — most-attended is
> derived client-side from the `nights` count already on each leaderboard
> entry, while best-deck (deck name, owner login, record, PPG, minimum
> **3 nights** logged) required a small `/api/leaderboard` addition: the
> handler now also aggregates `nights` grouped by deck id (joined to
> `decks`/`users` for name + owner), scoped by the same league-night/season
> filter as the standings query, and returns `{ entries, bestDeck }` instead
> of a bare array (every caller on `/leaderboard` updated in the same PR).
> Alongside those, three purely personal stats remain (matching the
> leaderboard's own league-nights-only scoping): your nights played, your
> best deck (min 3 games — mirrors `records.ts`'s `BEST_NIGHT_MIN_GAMES`
> floor), and your biggest single night (same floor) — kept distinct from
> the league-wide best-deck card since "yours" and "the league's best" answer
> different questions. A `rankLeaderboard` helper was extracted into
> `src/lib/pokemon.ts` so the leaderboard page, this panel, and #33's hall of
> fame all rank by the exact same tie-break rule instead of re-deriving it
> three times.

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

> **Status: implemented**, bundled in the same PR as #34 per the user's request.
> The season pill + overflow-dropdown switcher was extracted from the main page
> into `src/lib/components/SeasonSwitcher.svelte` and reused on both pages,
> exactly as scoped. `GET /api/leaderboard` takes an optional `?seasonId=`,
> looks up that season's date range, and filters `nights.played_on` in SQL
> before aggregating — an unknown id 404s. No `seasonId` keeps the prior
> all-time behavior, so the endpoint is backward compatible.

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

> **Status: implemented**, bundled in the same PR as #31 per the user's request.
> `SeasonRecap.svelte` renders on `/leaderboard` only when the selected season
> has ended (final top-3 standings plus league-wide totals — nights logged,
> games played — both derived at read time from the season-scoped leaderboard
> entries already fetched for the page, no snapshot). It's collapsible, same
> convention as #31's panel. `HallOfFame.svelte` renders as a horizontal-scroll
> strip above the standings only on the "All time" view — the user's own
> call, so the strip doesn't compete with a single season's own recap/awards
> — one card per ended season, each fetched via its own
> `/api/leaderboard?seasonId=` call resolved once seasons load. Per-season
> "biggest night" stayed a personal number in #31's panel (reusing the
> viewing member's own nights, no new exposure). "Best deck" was revisited
> after initially shipping the same way: a follow-up request wanted it as a
> genuine league-wide superlative with the owner's name, which needed a small
> `/api/leaderboard` addition (see #31's note) rather than staying purely
> derived from data already on the page — a deliberate, small widening of
> what's shared (deck name + owner + aggregate record for the current
> best-performing deck), still no raw per-night data.

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

> **Status: implemented**, bundled in the same PR as #32 per the user's request.
> A `seasonProgress()` helper in `src/lib/pokemon.ts` counts Tuesday-aligned
> weeks (sharing `nearestTuesday` with #12) and a new
> `src/lib/components/SeasonProgress.svelte` renders the one-line strip below
> the switcher on both the main page and `/leaderboard`, reflecting whichever
> season is selected (not only the current one). Shows a "final week"/"N weeks
> left" countdown in a bounded season's last two weeks instead of "ends
> <date>", and an "off-season" hint when "All time" is selected but no season
> covers today. The calendar-heatmap boundary markers mentioned as optional in
> the original scoping were left out.

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

## F. The league-administrator role

A third privilege tier between member and admin, for the person actually
running Tuesday nights. The intended split:

| Capability | Member | League admin | Admin |
| --- | --- | --- | --- |
| Log/edit own nights, see leaderboard | ✔ | ✔ | ✔ |
| Add members to the whitelist | – | ✔ | ✔ |
| Run league events (section G) | – | ✔ | ✔ |
| Remove members | – | – | ✔ |
| Promote/demote league admins | – | – | ✔ |
| Deck registry mutations, seasons, audit log, deleted-nights restore | – | – | ✔ |

The role system is unusually cheap to extend here: `allowed_users.role` is
already a free-form `nvarchar(20)` defaulting to `'member'` (`api/src/db/
schema.ts`), and every handler resolves privileges through one function,
`resolveRole()` in `api/src/auth.ts`. Ideas 36–38 are deliberately small and
sequential — 36 is the plumbing, 37 and 38 are the two policy surfaces.

### 36. The `leagueadmin` role tier

**What.** A new `'leagueadmin'` value in `allowed_users.role`, resolved by
`resolveRole()` into a third flag, visible to the frontend via `/api/me`.
Pure plumbing — this idea grants no new powers by itself.

**Why.** Foundation for 37, 38, and all of section G. Doing the plumbing as
its own PR keeps the policy changes (who may do what) reviewable in isolation.

**How.**
- **No migration needed** — `role` is `nvarchar(20)`; `'leagueadmin'` fits.
  Update the schema doc comment on `allowedUsers` in the same PR.
- `api/src/auth.ts`: extend `Role` to `{ isAdmin, isLeagueAdmin, isMember }`.
  Mapping: `'admin'` → all three true; `'leagueadmin'` → `isLeagueAdmin` +
  `isMember`; `'member'` → `isMember` only. **The env-var admin branch
  (ADMIN_USER_ID / ADMIN_GITHUB_LOGIN) must also set `isLeagueAdmin: true`** —
  admin outranks league admin everywhere, so handlers gate "league admin or
  better" on `role.isLeagueAdmin` alone, mirroring how `isMember` already
  includes admins.
- `api/src/functions/me.ts`: add `isLeagueAdmin` to the response.
  `src/routes/+layout.svelte`'s `auth` context and `src/lib/auth.ts` mirror it.
- Types: widen the `'member' | 'admin'` role unions in `api/src/types.ts` and
  `src/lib/types.ts` (and the cast at `api/src/functions/users.ts:56`).
- UI: render a "league admin" pill in the `/admin` member list and the
  `Masthead.svelte` role badge, styled between the existing member/admin looks.

**Effort:** S–M.
**Pitfalls.** Keep role-string interpretation in exactly one place —
`resolveRole()` translates strings to flags; handlers only ever read flags.
Grep for every `isAdmin` check and consciously decide each one: most stay
admin-only (seasons, decks mutations, audit, `scope=all`/`scope=deleted`);
nothing should silently widen in this PR.

### 37. Promote & demote league admins (admin-only)

**What.** The admin can promote a member to league admin and demote back,
from the `/admin` member list. The `'admin'` role itself is never assignable
via the API — the sole admin stays defined by environment variables.

**Why.** The user-visible half of the role: "Admin should be able to promote
people to league admin." Explicitly *not* a general role editor — two
transitions only.

**How.**
- API: add `PUT /api/users/{id}` to `api/src/functions/users.ts` with body
  `{ role: z.enum(['member', 'leagueadmin']) }`, gated on `isAdmin`. Refuse
  to touch rows whose current role is `'admin'` — reuse the exact
  `role <> 'admin'` guard the DELETE branch already has (`users.ts:108`).
- Audit: `logAudit(db, caller, 'user.role', 'Promoted <login> to league
  admin' | 'Demoted <login> to member', context)` — same pattern as
  `user.add`/`user.remove`.
- Frontend: in `src/routes/admin/+page.svelte`, a promote/demote action per
  row (visible only when `auth.isAdmin`), with the same `confirm()` style the
  remove button uses.

**Effort:** S. **Depends on:** 36.
**Pitfalls.** Demotion is effective on the target's next API call —
`resolveRole()` runs per-request with no session cache, so there's nothing to
invalidate; say so in the PR rather than building invalidation. Return the
updated row so the UI can update in place.

### 38. League admins add members; role-aware `/admin` page

**What.** League admins can open `/admin`, see the member list, and add
members — but see no remove buttons, no promote/demote, no deleted-nights
restore, and no audit log. Server-side, `POST /api/users` opens to league
admins while everything destructive stays admin-only.

**Why.** The core league-admin privilege: greeting a new player Tuesday night
and getting them onto the whitelist without pinging the admin — while keeping
removal and privilege changes centralized.

**How.**
- API (`users.ts`): replace the single top-of-handler admin gate
  (`users.ts:41-42`) with per-method gates — GET and POST require
  `isLeagueAdmin`; DELETE (and 37's PUT) require `isAdmin`. POST keeps
  hard-coding `role: 'member'` on insert and accepts no role field from the
  client, so a league admin can never mint privileges; `addedBy` (already
  recorded) attributes the invite, and the existing `user.add` audit entry
  covers traceability.
- `api/src/functions/audit.ts` and `?scope=deleted` in `nights.ts` stay
  admin-only — league admins don't get the forensic views.
- Frontend (`admin/+page.svelte`): page gate becomes `isLeagueAdmin ||
  isAdmin`; the remove/promote controls and the deleted-nights and audit-log
  cards render only for `isAdmin`. Retitle the page contextually ("League
  admin" vs "Admin") so league admins don't file bugs about missing cards.
- `NavMenu.svelte`: show the admin link to league admins too.

**Effort:** M. **Depends on:** 36; **pairs with:** 37.
**Pitfalls.** Hidden buttons are cosmetics — the 403s are the boundary; test
by signing into the SWA CLI emulator as a league-admin user (mind the
real-keystroke login quirk in CLAUDE.md) and hitting DELETE/PUT directly.
Decide explicitly whether league admins may add someone who was previously
removed (recommended: yes, it's just an add — the audit log tells the story).

---

## G. Running a league night

Today the app records league nights *after the fact*: each member logs their
own `nights` row (aggregate W/T/L or per-match). Section G makes the night
itself a first-class shared thing: a league admin opens an **event**, players
check in, the app generates Swiss pairings, both players report results **game
by game as they play**, standings update live, and when the event finishes it
writes everyone's ordinary personal `nights` rows — so every existing view
(Scoreboard, DeckTable, matchup matrix, Elo, badges, leaderboard) keeps
working untouched. Events are a better *entry method*, not a parallel stats
world.

Two naming/architecture decisions all these ideas share:

- **`nights` stays the personal log; the shared entity is `events`.** Don't
  overload `nights.isLeagueNight` — that flag keeps meaning "counts for the
  league" on a personal row. The bridge is idea 50.
- **No timers, no push** (managed Functions are HTTP-only — see "Read this
  first"): every "live" behavior is polling (`$effect` + interval refetch
  while an event is live) and every notification is sent synchronously from
  the HTTP handler that caused it (54, 65).

**How sanctioned tools do pairings (researched July 2026).** Play! Pokémon
*mandates* **TOM (Tournament Operations Manager)** — a locally-installed
Windows app — for sanctioned League Challenges and League Cups; third-party
software and hand-pairing are explicitly not permitted for those ([support
article](https://support.pokemon.com/hc/en-us/articles/40087181036948)). (A
web replacement, PEM, shipped ~2022 and was scrapped; TOM was restored.) TOM
computes Swiss pairings locally and saves the whole tournament as a **`.tdf`
file, which is plain XML** — players, pods, rounds, `<match>` elements with
pairings, outcomes, and table numbers — that organizers upload to the Play!
Tools web portal to report results. The format is undocumented but has been
reverse-engineered by community tools (details and sources in idea 51).
During an event TOM also regenerates `roster.html` / `pairings.html` /
`standings.html` report files on disk every round for wall displays. Pairing
rules per the Play! Pokémon tournament handbooks: round 1 fully random;
later rounds random *within match-point score groups*, avoiding rematches
where possible, with an odd player paired into the adjacent group; an odd
attendance gives one player a bye, which counts as a win but is excluded from
tiebreakers; match points are W/T/L = 3/1/0; tiebreakers are opponents' win %
then opponents' opponents' win %; League Challenges are best-of-1 (~30-min
rounds), 3–5 Swiss rounds, no top cut, while Cups add a best-of-3 top cut
(~50-min). Crucially, **an unsanctioned private league — this app's case —
is not required to use any of this**: that's why 43 builds pairing into the
app itself, and 51 covers importing a `.tdf` for the nights someone *does*
run under TOM.

Dependency spine: **39 → 40 → 43 → 45 → 50** is the minimum path to "run a
whole night in the app"; everything else in the section hangs off it.

### 39. League events — the shared night entity

**What.** An `events` table and CRUD: a league admin creates "Tuesday
19 Aug", configures best-of-1 or best-of-3 and round length, and moves it
through `setup → live → done`. Members see a new `/events` page listing
upcoming and past events.

**Why.** Foundation of the whole section — pairings, check-in, and live
reporting all need one shared row to hang off.

**How.**
- Schema: `events` (`id` identity PK, `name nvarchar(100)` nullable — UI
  derives "League night 2026-08-19" when absent, `playedOn date not null`,
  `bestOf int not null default 1`, `roundLengthMin int not null default 30`,
  `status nvarchar(10) not null default 'setup'` — `'setup' | 'live' |
  'done'`, `createdBy int` FK → `users.id`, `createdAt`). Generate a
  migration per CLAUDE.md.
- API: new `api/src/functions/events.ts` — GET list (member; lean rows) and
  GET detail `?id=` (member; event + roster + rounds/matches once 40/43
  exist); POST/PUT/DELETE gated on `isLeagueAdmin`. Status transitions
  validated in Zod/handler: only `setup→live→done`, and DELETE only while
  `setup` (after that it has history — see 50).
- Frontend: `/events` prerendered route + `staticwebapp.config.json` rewrite
  (the `/admin` → `/admin.html` pattern); event detail on the same route via
  `?id=` query string — **not** a `[id]` param (prerender constraint).
- Audit: log `event.create` / `event.finish` via `logAudit` — these are
  league-admin actions worth a trail.

**Effort:** M–L. **Depends on:** 36 (the role that operates it). Everything
40–56 depends on this.
**Pitfalls.** Don't FK events to seasons — derive season membership from
`playedOn` at read time, exactly like nights (idea 9's no-FK design). Keep the
GET-detail payload one request (roster + matches included) so the polling
views (44, 47) are a single fetch.

### 40. Event roster & check-in

**What.** Who's playing tonight. League admins add attendees; members can
also check themselves in while the event is in `setup`. The roster view shows
avatars and a live headcount.

**Why.** Pairings need a closed list of tonight's players; check-in is also
the moment deck registration (42) happens.

**How.**
- Schema: `event_players` (`id` PK, `eventId int not null` FK → `events.id`,
  `userId int` nullable FK → `users.id`, `guestName nvarchar(100)` nullable —
  see 41, `deckId int` nullable FK → `decks.id` — see 42,
  `droppedAtRound int` nullable — see 48, `createdAt`). Exactly one of
  `userId`/`guestName` must be set — enforce in the handler/Zod (a DB CHECK
  constraint is nice-to-have; don't fight the Drizzle rc for it). Unique
  `(eventId, userId)` so nobody is enrolled twice.
- API: sub-routes in `events.ts` (`route: 'events/{id}/players/{playerId?}'`
  or a second function file): POST add (league admin: anyone; member: only
  themselves — "self check-in"), DELETE un-enroll (league admin, or self
  while no rounds exist yet).
- Frontend: roster card on the event detail — avatar (the
  `github.com/<login>.png` helper `admin/+page.svelte` uses), deck chip once
  42 lands, headcount, and for league admins an add box with a member picker
  + guest-name input.

**Effort:** M. **Depends on:** 39.
**Pitfalls.** Roster membership is visible to all members — same
visibility class as the leaderboard (#8 settled this; note it in the PR
anyway). Lock enrollment changes once round 1 exists, except through 48's
drop/late-entry paths.

### 41. Guest players

**What.** A league night regular who doesn't use the app — or a one-off
visitor — participates by name only: pairable, beatable, visible in event
standings, no account.

**Why.** Real league nights always have someone new. If guests can't be
paired, the whole event feature is unusable the first Tuesday a visitor shows
up. Precedent already in the codebase: ownerless "reference-only" decks exist
exactly so opponents outside the app can be modeled (`decks` doc comment).

**How.**
- Mostly covered by 40's `guestName` column. Guests are created by league
  admins at check-in (free-text name, dedupe case-insensitively within the
  event).
- Guests can't report results; their opponent (45) or the league admin enters
  them, and confirmation (46) auto-passes for guest matches.
- "Claim" path: when a guest later becomes a member, an admin can link past
  `event_players` rows (`UPDATE set userId, guestName = null`) from a small
  admin UI — history follows them into 57/58. Audit-log it.

**Effort:** S (on top of 40).
**Pitfalls.** In the bridge (50), guests produce no personal night — but
their *opponents'* nights still reference the guest's registered deck (42) as
the opponent deck; use the existing ownerless-deck upsert
(`upsertOpponentDeck`) so guest decks land in the reference pool, not anyone's
owned list.

### 42. Deck registration at check-in

**What.** Optionally record what each player is piloting tonight, at check-in
time — members pick from their own decks (or create one), guests get an
ownerless reference deck.

**Why.** The quiet payoff: once pairings know both players' decks, the bridge
(50) fills `opponentDeckId` on everyone's personal matches automatically —
the matchup matrix (#3) and opponent-type breakdowns stop depending on anyone
typing their opponent's deck at 22:30. Also what makes standings/pairings
screens fun to read.

**How.**
- Schema: 40's `event_players.deckId` (already scoped there).
- API: accept `deck` + `type` strings on the enroll/check-in call. Members:
  reuse the owner-scoped upsert (`upsertOwnedDeck`); guests: the ownerless
  opponent-deck upsert. League admins may set/change anyone's registration
  while the event is `setup` or `live`.
- Frontend: deck picker in the check-in flow — reuse `DeckPicker.svelte` /
  the `NightForm.svelte` chip pattern rather than a new widget.

**Effort:** S–M. **Depends on:** 40.
**Pitfalls.** Registration is optional at this league's formality level —
never block pairing on a missing deck. If someone switches decks mid-night
(it happens at casual league), the registration is "what they mostly played";
50 copies it as-is — good enough, don't build per-round deck tracking.

### 43. Swiss pairings generator

**What.** One tap on "Pair round N": the app groups tonight's roster by match
points, pairs randomly within groups avoiding rematches, floats the odd
player down a group, assigns the bye, numbers the tables, and creates the
round.

**Why.** The league admin's biggest manual job every single week, and the
reason leagues otherwise juggle TOM (see the research note above) or paper.
This is the heart of section G.

**How.**
- Schema: `event_matches` (`id` PK, `eventId int not null` FK,
  `roundNo int not null`, `tableNo int`, `playerAId int not null` FK →
  `event_players.id`, `playerBId int` nullable FK — **null = bye**,
  `result nvarchar(1)` nullable — `'A' | 'B' | 'T'` from A's perspective,
  `games nvarchar(10) not null default ''` — see 45,
  `reportedById int` / `confirmedById int` nullable FKs — see 46,
  `createdAt`). One migration together with 40's table if built in sequence.
- Pairing algorithm as a **pure module** `api/src/pairing.ts`:
  input = players with match points + set of already-played pairs; output =
  list of `[a, b]` plus optional bye. Group by points descending; shuffle
  within group; greedily pair avoiding rematches; on dead ends backtrack (at
  ≤ 16 players a simple recursive backtrack is instant); odd group → float
  the lowest player down; overall odd count → bye to the lowest-standing
  player who hasn't had one (Play! convention — see research note). Pure and
  deterministic given a seeded shuffle, so it's inspectable by hand.
- API: `POST /api/events/{id}/rounds` (league admin): rejects if the current
  round has unresolved matches (46), computes pairings, inserts the round's
  rows in one transaction, stamps the round-start time (49).
- Frontend: "Pair round N" button on the event detail (league admins,
  `status='live'`), showing the recommended Swiss round count for the
  attendance (research note) as guidance, never enforcement.

**Effort:** L — the algorithm is the work; keep it pure and comment the
rules. **Depends on:** 39, 40.
**Pitfalls.** Rematch-free perfection is impossible in a tiny league (6
players, 4 rounds) — when backtracking fails, allow the least-recent rematch
rather than erroring, and say so in the UI. Never repair a round that has
results (49/46 flows edit individual matches instead). Transaction around the
whole round insert.

### 44. Pairings board & "who am I playing"

**What.** The round view: "Table 1 — Alice (2-0) vs Bob (2-0)". Members see
their own pairing highlighted ("You play Bob — table 3"); guests find their
name on the board. Refreshes itself while the event is live.

**Why.** Replaces the moment everyone crowds around one phone/laptop. With
43 this is the visible payoff of the whole feature.

**How.**
- Frontend-only over 39's GET-detail payload: a `Rounds` section on the event
  page — round tabs, match rows with avatars, records, table numbers, result
  chips once reported. Highlight the row whose `userId` matches the signed-in
  member.
- Polling: an `$effect`-managed `setInterval` refetch (~15 s) while
  `status === 'live'` and the tab is visible (`document.visibilityState`) —
  the no-push constraint, stated in the section intro.

**Effort:** S–M. **Depends on:** 43.
**Pitfalls.** Clear the interval on unmount/status change (runes cleanup
callback), or backgrounded phones keep hammering the API all night. Keep the
poll payload the single GET-detail request from 39 — don't add per-widget
endpoints.

### 45. Game-by-game live score reporting

**What.** During a match, either player taps the result of each *game* as it
finishes — G1 win, G2 loss, G3 win — from their own phone. The match result
derives automatically (first to 2 in Bo3; G1 decides in Bo1; tie when time is
called on a split). No end-of-night data entry at all on event nights.

**Why.** The user's core ask: scores submitted game by game, not nightly.
Games are the moment-of-truth unit of a Bo3 league night, and capturing them
live is also the only way both players stay in sync about the score — the
classic "wait, was that game 2 or 3?" argument, solved.

**How.**
- Schema: 43's `event_matches.games` string — chars `'A' | 'B' | 'T'` in
  play order (same compact-string approach idea 5 scoped for personal
  matches; at Bo3 scale a string beats a games table).
- API: `POST /api/events/{eventId}/matches/{matchId}/games` with body
  `{ gameNo: number, winner: 'me' | 'opponent' | 'tie' }`. Authorization:
  the caller's `users.id` must be one of the match's two `event_players`
  (league admins may report any match, and must for guest-vs-guest). The
  handler translates `me`/`opponent` to `'A'`/`'B'`, and appends **inside a
  transaction that re-reads the row**: if `games` already has `gameNo`
  entries or more, return 409 — that makes the call idempotent when both
  players tap the same game at once (the second tap either agrees silently or
  surfaces a conflict for 46). Derive and set `result` when decided by
  `bestOf`; a league-admin-only PUT can overwrite `games`/`result` wholesale
  to fix mistakes.
- Frontend: on your highlighted pairing row (44), big thumb-friendly "I won
  game N" / "Opponent won game N" buttons showing the running score
  (`W–L`), optimistic update + the existing poll reconciling both phones
  within seconds.
- Also works without the generator: if the league admin skipped pairings
  (casual night), let league admins create an ad-hoc match row between two
  checked-in players — same reporting flow, no Swiss.

**Effort:** M–L. **Depends on:** 39, 40, 43 (or the ad-hoc path).
**Relation to idea 5:** the personal `matches.games` column idea 5 scopes is
the landing spot for this detail when 50 bridges events into nights —
implement idea 5's schema (validation rules and all) as a prerequisite or as
part of 50, so game detail survives into personal stats.
**Pitfalls.** Ties: when time is called mid-game, Play! rules resolve
unfinished games by their own procedure — don't model it; just allow `'tie'`
as an outcome and let the humans decide (research note). Never let `result`
and `games` disagree — result is always derived here (unlike idea 5's
personal quick-log, where `games` is optional decoration).

### 46. Both-players confirmation & disputes

**What.** A match reported by one player shows "awaiting confirmation" to the
other, who taps confirm (or corrects). Conflicting reports flag the match;
the league admin resolves it. Pairing the next round auto-confirms anything
still pending.

**Why.** Two-source truth without ceremony. The failure mode isn't cheating
at a friendly league — it's fat fingers, and the flag catches it the same
minute instead of at standings time.

**How.**
- 43's `reportedById` / `confirmedById` columns. The games POST (45) sets
  `reportedById` on first report; a `POST .../confirm` endpoint (opponent
  only) sets `confirmedById`; a mismatching game report from the opponent
  (the 409 path in 45) sets a `disputed` state — simplest encoding: a
  `disputedAt datetime2` nullable column, cleared by the league-admin PUT.
- 43's round generation refuses while disputes exist, and auto-confirms
  clean-but-unconfirmed matches as it runs (write `confirmedById = null`
  but treat pairing as implicit confirmation — or a sentinel; pick one and
  comment it).
- Guest matches (41): auto-confirmed on report.
- UI: pending/confirmed/disputed chips on the pairing row; a league-admin
  resolve card listing disputed matches.

**Effort:** S–M. **Depends on:** 43, 45.
**Pitfalls.** Don't block the *reporter's* own next-round pairing on their
opponent's confirmation laziness — auto-confirm at pairing time is the
pressure valve that keeps the night moving.

### 47. Live event standings with real tiebreakers

**What.** A standings tab on the event page, updating as results land: match
points, record, and proper Swiss tiebreakers (opponents' win percentage —
"resistance" — then opponents' opponents' win percentage), matching how
sanctioned events rank.

**Why.** "Who's actually winning tonight?" — and the numbers players already
understand from sanctioned tournaments (research note).

**How.**
- Pure module `src/lib/eventStandings.ts`, computed client-side from the
  event GET-detail payload (event data is member-visible anyway): match
  points (reuse the 3/1/0 scoring constants — export them from
  `src/lib/pokemon.ts` rather than re-deriving), then opponent win %, with
  the floor sanctioned rules apply to low win-rates (research note; verify
  the exact floor value), byes excluded from opponents' win % per convention.
- Dropped players (48) stay listed, marked, and still count toward their
  past opponents' resistance.
- Rendered in the standings tab; frozen naturally once `status='done'`
  (derived, never snapshotted — same philosophy as season recaps, #33).

**Effort:** M. **Depends on:** 43, 45.
**Pitfalls.** Tiebreaker math is fiddly and silently-wrong-prone: keep the
module pure with a worked example in a comment, and hand-check one night
against TOM's output (or the handbook's example) before trusting it.

### 48. Byes, drops & late entries

**What.** The messy reality of a league night: an odd player count (bye),
someone leaving after round 2 (drop), and someone arriving during round 1
(late entry).

**Why.** Without these, the first normal Tuesday breaks the pairing feature —
these aren't edge cases at a casual league, they're weekly.

**How.**
- Bye: 43 already models it (`playerBId` null); it auto-resolves as a win for
  A (`result='A'`, `games` per `bestOf` convention, e.g. `'AA'`), confirmed,
  at creation time. Never counts as a rematch; a player gets at most one
  (43's algorithm rule).
- Drop: `event_players.droppedAtRound` (40's column). League admin (or the
  player themselves) drops; pairing (43) excludes dropped players; standings
  (47) keep them, marked "dropped R2".
- Late entry: allowed while `status='live'` — enrolls normally with 0 points;
  pairing naturally seats them in the bottom group. Optionally record
  the missed rounds as nothing at all (simplest, recommended) rather than
  synthetic losses.
- All three are league-admin actions on existing endpoints (40/43) — no new
  function file.

**Effort:** S–M (mostly rules inside 43's module). **Depends on:** 43.
**Pitfalls.** In the bridge (50), byes should *not* become personal `matches`
rows (a bye is not a played match and would inflate matchup/Elo data) — but
the night's W/T/L totals then differ from event match points; pick "played
matches only" for personal stats and document it in the bridge.

### 49. Round timer

**What.** Pairing a round stamps its start time; every pairings board shows
the countdown ("18:24 left in round 2") from the event's configured round
length, flipping to "time!" at zero.

**Why.** The other half of what TOM projects on the wall (research note).
Zero marginal infrastructure once 43 stamps a timestamp.

**How.**
- Schema: simplest is `roundStartedAt datetime2` written on the round's
  matches at creation — or, cleaner, a tiny `event_rounds` table (`eventId`,
  `roundNo`, `startedAt`) if 43 didn't already create one; either works,
  pick during 43.
- Frontend-only otherwise: remaining = `roundLengthMin` − (now −
  `startedAt`), computed client-side each second; the existing poll (44)
  delivers the timestamp. League admin gets a "restart clock" action for
  false starts (PUT updating the timestamp).
- No sound by default; a subtle visual state change at zero
  (`prefers-reduced-motion`-safe).

**Effort:** S. **Depends on:** 43/44.
**Pitfalls.** Client clocks skew — compute against the server timestamp and
accept ±seconds; label the display approximate rather than chasing sync.

### 50. Event wrap-up — the bridge into personal nights

**What.** Finishing an event writes each member participant's ordinary
`nights` row for that date automatically: deck from their registration (42),
one personal `matches` row per played event match (result from their
perspective, `opponentDeckId` from the opponent's registered deck, game
string once idea 5's column exists), W/T/L totals recomputed the standard
way. Guests produce nothing; nobody logs anything by hand.

**Why.** **The keystone of section G.** Every existing feature — Scoreboard,
DeckTable, matchup matrix (#3), deck Elo (#6), records (#10), badges (#26),
the leaderboard (#8) — reads `nights`/`matches`. This one handler makes the
entire event suite feed all of them with zero changes to any of them. Without
it, events are a stats island.

**How.**
- Schema: nullable `eventId int` (FK → `events.id`) on `nights`, plus a
  unique index on `(eventId, ownerId)` where eventId is not null — that's
  both the provenance marker ("logged from league night") and the idempotency
  guard making "finish" safe to hit twice.
- API: inside the `status → 'done'` transition in `events.ts`: for each
  `event_players` row with a `userId`, build the night (skip byes — see 48 —
  and unresolved matches shouldn't exist past 46), derive W/T/L from the
  matches, insert night + matches in a transaction per participant. Reuse the
  shared deck/night helpers extracted for `nights.ts` rather than duplicating
  insert logic. `wentFirst` stays null (nobody tracked it live — 45 could add
  it later as a per-game extra).
- The created nights belong to the participants (`ownerId`), not the league
  admin — they can edit/annotate them afterward like any night. If they do,
  the event remains the source of truth for *event* standings; personal
  divergence is their business (document this stance).
- UI: after finishing, the event page links "your night was logged"; the
  night card in `NightsList.svelte` gets a small league-event badge when
  `eventId` is set.

**Effort:** M–L. **Depends on:** 39, 40, 42, 43, 45 (and idea 5's column for
game detail).
**Pitfalls.** Ownership: `nights.ts`'s POST path is caller-scoped — do these
inserts directly in the finish handler with explicit `ownerId`, not by
impersonating. Decide the un-finish story: simplest is "finishing is final;
fixes go through editing personal nights" — reopening would mean deleting
generated nights (soft-delete makes this survivable, but don't build it until
someone asks).

### 51. Import a sanctioned night from TOM (`.tdf` upload)

**What.** When a night is run as a sanctioned League Challenge/Cup, TOM — not
this app — must be the pairing engine (see the section intro). This idea
closes the gap: the league admin uploads the event's `.tdf` file, the app
maps TOM players to members (or guests), and creates the finished event —
roster, rounds, pairings, results — after which the normal wrap-up (50)
writes everyone's personal nights. Nobody double-enters a sanctioned night.

**Why.** The answer to "if pairings are made by a Pokémon-sanctioned tool,
does it output a file we can read?" is **yes**: the `.tdf` is plain XML
containing exactly the data this section models.

**How.**
- **Format facts** (verified against a real sample `.tdf` from a community
  repo, plus working parsers — see references): root
  `<tournament type stage version gametype mode>`; `<data>` holds the event
  name, sanction `<id>`, `<startdate>` (**US-format `MM/DD/YYYY`**) and
  `<roundtime>`; `<players>` holds `<player userid>` (the player's Play!
  POP ID) with `<firstname>`/`<lastname>`; `<pods>/<pod>/<rounds>/<round
  number>/<matches>/<match outcome>` holds the pairings — two-player matches
  carry `<player1 userid>`/`<player2 userid>` and `<tablenumber>`, byes a
  single `<player>`. A `<standings>` element appears once the tournament is
  finished (community-observed, not spec'd). **There is no official schema
  and the `outcome` codes are undocumented** — the sample suggests `2`/`3` =
  win for slot 1/2, `0` = tie, `5` = bye, but verify against a real file
  from this league's own TOM before trusting; treat unknown codes as
  unresolved and surface them in the import UI rather than guessing.
- API: `POST /api/events/import` (league admin), body = the raw XML
  (Zod-check size ≤ ~1 MB and root element). Parse server-side with a small
  XML dependency (e.g. `fast-xml-parser`) — don't regex XML. Two-phase like
  idea 22's import: a dry-run response lists parsed players with suggested
  member matches (TOM has real first/last names; members are GitHub logins —
  matching is fuzzy at best, so it's a *suggestion* UI, not automatic); the
  league admin maps each player to a member or "guest"; the commit call
  creates event (+`status='done'`), `event_players`, and `event_matches`
  in one transaction, then runs 50's bridge.
- Store each member's TOM `userid` (POP ID) on first mapping (nullable
  column on `users`) so re-imports auto-map — the mapping chore happens
  once per player, ever.
- Dedupe: store the sanction `<id>` as a unique nullable `sanctionId` on
  `events`; a re-upload of the same file is a 409, not a duplicate night.
- References for the implementer: `teragoatz/rk10` (Python
  `ElementTree`-based `.tdf` ingester — the closest prior art),
  `FomTarro/pkmn-tournament-overlay-tool` (consumes TOM's per-round HTML
  reports instead), `jlgrimes/swissiwashi` (a TOM-style Swiss/tiebreaker
  reimplementation for unsanctioned play). There is **no npm/PyPI `.tdf`
  parser** — this is hand-rolled territory everywhere.

**Effort:** L. **Depends on:** 39, 40, 41 (unmapped players become guests),
43's schema, 50.
**Pitfalls.** Sanctioned events are Bo1 with match-level outcomes only — the
`games` string stays empty on imported matches, and that's correct (don't
fabricate `'A'` game strings). Parse dates as `MM/DD/YYYY` explicitly. TOM
splits age divisions into separate pods — flatten all pods into one event but
keep `roundNo` within-pod, and note the simplification. The importer is the
one place this app touches an undocumented external format: wrap parsing in
"reject loudly with a helpful message" rather than best-effort ingestion.

### 52. Top-cut bracket

**What.** After Swiss, an optional single-elimination top cut (top 4/top 8)
seeded from standings — the League Cup structure — with a bracket view.

**Why.** For special nights (store championship, season finale, #31's
champion moment). Not weekly fare; deliberately after everything else in the
spine.

**How.**
- Schema: `phase nvarchar(10) default 'swiss'` on `event_matches`
  (`'swiss' | 'topcut'`); bracket position derivable from `roundNo` +
  `tableNo` ordering, so no new table.
- API: `POST /api/events/{id}/topcut` (league admin) — validates Swiss
  complete, seeds 1v4/2v3 (or 1v8… for 8) from 47's standings, creates the
  first bracket round; subsequent rounds pair winners. Top-cut matches are
  typically Bo3 even when Swiss was Bo1 — take `bestOf` per phase.
- Frontend: a bracket layout in the event view (CSS grid; no library).
- Bridge (50): top-cut matches join the personal night like any other played
  match.

**Effort:** M–L. **Depends on:** 43, 45, 47.
**Pitfalls.** Standings must be final before seeding — require all Swiss
matches confirmed (46). Keep tie handling out: single-elim can't tie; the
UI just doesn't offer the tie outcome for top-cut matches.

### 53. Scheduled events & RSVP

**What.** Events created with a future date act as a schedule; members RSVP
("in" / "out" / maybe) and the league admin sees the expected headcount days
in advance.

**Why.** "Are we enough people to fire a proper night?" is currently a chat
thread. Headcount also tells the league admin the round count in advance
(43's guidance).

**How.**
- Schema: either a `rsvp nvarchar(10)` column on `event_players` (an RSVP
  is just pre-check-in enrollment) or keep it lighter: reuse `event_players`
  with a `checkedInAt datetime2` nullable — RSVP'd = row exists, checked in =
  timestamp set; 43 pairs only checked-in players. The second reading unifies
  40 and this idea cleanly.
- API: members POST/PUT/DELETE their own RSVP while `status='setup'` — the
  self-service path 40 already opens.
- Frontend: RSVP buttons on upcoming events in `/events`; headcount chips
  ("6 in · 2 maybe").

**Effort:** S–M. **Depends on:** 39, 40.
**Pitfalls.** If 40 shipped without `checkedInAt`, add it here and migrate
meaning carefully — enrolled-but-not-arrived must not get paired (48's
late-entry path covers stragglers).

### 54. Discord webhook announcements

**What.** The league's Discord channel gets automatic posts: "Round 2
pairings are up", the standings after the last round, and the event-finished
recap — sent by the app at the moment the league admin performs the action.

**Why.** The league already lives in a chat app; this meets players where
they are without anyone screenshotting the pairings board. And it's the one
"push" mechanism that needs no timers and no push infrastructure — just an
outbound HTTP POST from the handler that changed the state.

**How.**
- Config: `discordWebhookUrl` in the `settings` key/value table (#27 scopes
  it; create it here if 27 hasn't landed) — admin-managed from `/admin`.
  Server-side only; never returned to any client, league admins included.
- API: a small `postToDiscord(embed)` helper in `api/src/`, called
  fire-and-forget (isolated `try/catch`, failure logged, never fails the
  action — the `logAudit` isolation pattern) from 43's round creation and
  39's finish transition. Compose embeds server-side: pairings table, top-3
  standings.
- No frontend beyond the admin settings card.

**Effort:** S–M. **Depends on:** 39, 43 (the moments worth announcing).
**Pitfalls.** The webhook URL is a write-capable secret — treat like a
credential (settings table, not client payloads, not logs). Discord rate
limits are irrelevant at one league's volume, but keep posts to real moments
(round up, event done), not every game report.

### 55. Season championship points race

**What.** Each finished event awards placement points (e.g. 1st = 10,
2nd = 8, 3rd–4th = 6, played = 2 — configurable), and `/leaderboard` gains a
season race table: points per player across the season's events, alongside
the existing PPG standings.

**Why.** Mirrors Play!'s Championship Points structure — a season-long race
where showing up matters, orthogonal to win-rate. Combines the event suite
with seasons (#9) into the league's meta-game. Strong retention loop, same
logic as #31.

**How.**
- No snapshot: derive at read time — events in the season's date range
  (`playedOn`, the #9 no-FK pattern), each event's placements from 47's
  standings module, points from a config map (a `settings` JSON value or a
  constant to start).
- Where: server-side in `leaderboard.ts` alongside the existing aggregate
  (it's cross-player but aggregate-only — consistent with that endpoint's
  privacy stance), or client-side if event detail is member-visible anyway;
  prefer extending `leaderboard.ts` with an `events` block per entry.
- Frontend: a second tab/section on `/leaderboard` — "Season race" vs
  "Standings", both behind the season switcher once #32 lands.

**Effort:** M. **Depends on:** 39, 47; **pairs with:** 9, 31, 32.
**Pitfalls.** Guests earn placements but have no leaderboard identity — show
them by guest name in per-event results but exclude from the season race (or
include by name); decide and label. Derivation means an edited old event
reshuffles the race — same self-correcting stance as #33.

### 56. Projector & kiosk mode

**What.** A full-screen display view for the shop TV/projector: rotates
between current pairings, standings, and the round timer in large type,
auto-refreshing all night.

**Why.** The wall display is half of what TOM provides at sanctioned events
(research note); a league admin's laptop + HDMI replaces it.

**How.**
- Frontend-only: `?kiosk=1` on the event detail route — hides nav/chrome,
  scales type up, cycles panels on a timer (10–15 s), keeps 44's poll
  running. It runs on a signed-in league admin's machine, so no auth changes.
- A "start kiosk" button on the event page opens it; `Escape` exits.
- Public/no-auth variant deliberately out of scope — that's #27's token
  pattern extended to events, a separate decision.

**Effort:** S–M. **Depends on:** 44, 47, 49.
**Pitfalls.** Screen-wakelock: request `navigator.wakeLock` (with graceful
fallback) or the projector sleeps mid-round. `prefers-reduced-motion` for
the panel transitions.

---

## H. More stats, platform & fun

Standalone ideas — some cash in on section G's shared match data (57–59), the
rest are independent of it.

### 57. True head-to-head records

**What.** Lifetime player-vs-player records ("you are 7–2 against Bob"),
derived from event matches where both sides are known members — shown on the
comparison page (#14) and in a "vs you" chip wherever an opponent's name
appears.

**Why.** Idea 14 compares two players' *stats side by side*; it can't say who
beats whom, because personal nights never record the opponent's identity.
Event matches (43/45) do — this is the first feature only the event world
makes possible.

**How.**
- No schema change: aggregate `event_matches` across all events where both
  `event_players` rows carry a `userId`. Needs an API surface — either
  include a member's event-match history in the events GET (it's
  member-visible event data already) or a lean `GET /api/h2h?a=&b=`
  aggregating server-side; prefer the former (client-side aggregation is the
  house style).
- Pure module `src/lib/h2h.ts`; render on `/compare` (#14) and the profile
  page (59).

**Effort:** S–M. **Depends on:** 39–45 accumulated data; **pairs with:** 14, 59.
**Pitfalls.** Small-sample bragging — show the record with games count, and
don't editorialize ("dominates") below ~5 matches.

### 58. Player Elo ratings

**What.** An Elo rating per *player* (distinct from #6's per-deck Elo),
replayed over all event matches chronologically, shown on the leaderboard and
profiles.

**Why.** The leaderboard ranks by volume-sensitive totals; Elo ranks by who
you actually beat. With shared event matches the opponent's identity and
strength are finally known — this is the rating #6 couldn't be.

**How.**
- Generalize `src/lib/elo.ts` (#6) — extract the replay core so deck-Elo and
  player-Elo share it; K=32, start 1000, ties 0.5, same deterministic
  ordering discipline (event `playedOn`, then event id, `roundNo`, match id).
  Byes and guest matches move no rating (guests have no stable identity —
  skip, or rate guests by name; skip is cleaner).
- Client-side over the same payload as 57; a column on `/leaderboard` and a
  sparkline on profiles (59).

**Effort:** S–M. **Depends on:** 57's data surface. **Pairs with:** 6, 55.
**Pitfalls.** Don't blend personal-night matches in (opponent identity is a
deck there, not a player) — player Elo is event-data-only, say so in the UI.

### 59. Player profile pages

> **Status: implemented differently than scoped**, at a member's own request
> for a self-service **alias** (a display name shown to other players instead
> of the GitHub login) rather than the original 55/57/58-dependent social hub
> — none of which exist yet. Landed as `/profile` (own account only, no
> `?login=` query string, no rewrite needed beyond the flat `/profile.html`
> the static build already emits): your real GitHub identity (read-only), an
> alias editor with a live "others will see you as…" preview, and your own
> Scoreboard/Records/DeckTable/Badges reusing existing components exactly as
> this idea's "How" scoped. Schema: nullable `users.alias`. `GET/PUT /api/me`
> now doubles as the alias read/write endpoint (member-only, self-only — no
> path exists to set anyone else's), case-insensitively unique against every
> other member's alias *and* GitHub login so an alias can never impersonate a
> real member. Every place another player's identity was already shown grew a
> parallel `*Display`/`displayName` field computed server-side
> (`api/src/db/displayName.ts`: alias-if-set-else-login) alongside the
> original login field, which stays untouched and keeps doing ownership/
> identity-matching duty (`nights.createdBy`, `LeaderboardEntry.login`,
> `DeckSummary.ownerLogin`) — only rendering switched to the new display
> field, in `DeckPicker`'s opponent chips, `DeckTable`/`NightsList`'s
> admin-scope owner labels, and the leaderboard/season-awards/recap/hall-of-
> fame views. Deliberately **not** changed: the admin whitelist (`/admin`
> member list, deleted-nights forensic view) and the `/decks` registry stay on
> real GitHub logins — those are access-control/accountability surfaces, not
> "shown to other players" in the sense this idea and the user's request
> meant. The original query-string-route framing, and everything 55/57/58
> would add, are still open — pick this back up once the event suite (section
> G) exists.

**What.** A page per member — `/player?login=<handle>` — with avatar, badges,
favorite/most-played decks, form trend, head-to-head vs the viewer (57), Elo
(58), and event placements (55).

**Why.** The social hub the pieces keep wanting: 14, 55, 57, 58 all need
somewhere to live. Also the natural click-through from every leaderboard row
and pairing card.

**How.**
- Prerendered route with a query string (`?login=`) + the
  `staticwebapp.config.json` rewrite — the #7 pattern, not `[id]` params.
- Respect the existing privacy boundary: profiles show what the viewer can
  already see — leaderboard aggregates, shared event data, badges — and the
  member's own raw nights only to themselves/admins (i.e. build on existing
  endpoints; don't widen `scope=all`).
- Reuse `Badges.svelte`, `Sparkline.svelte`, avatar helper.

**Effort:** M. **Depends on:** pieces above for content; renders gracefully
with whatever subset exists.
**Pitfalls.** An empty profile (new member, no events) must look fine —
design the zero state first.

### 60. Deck lists — PTCGL import/export

**What.** Attach a real 60-card list to a deck, pasted straight from Pokémon
TCG Live's "Export" (plain-text lines like `4 Charizard ex OBF 125`), rendered
grouped by Pokémon/Trainer/Energy with counts, and exportable back to
clipboard in the same format.

**Why.** "What was in that list when it was winning?" — the tracker knows
results but not builds. PTCGL's text format is the lingua franca players
already copy around Discord, so entry is one paste.

**How.**
- Schema: `deck_lists` table (`id`, `deckId` FK → `decks.id`, `content
  nvarchar(4000) not null`, `createdAt`) — versioned by insert (newest is
  current), enabling "list as of that night" later without redesign.
- Parse client-side (a pure `src/lib/decklist.ts`: `count name setCode
  number` per line, tolerant of the header lines PTCGL emits); store raw text
  verbatim, render from the parse. Zod on the API just bounds size.
- API: extend `decks.ts` — GET includes latest list; POST list (deck owner or
  admin). Frontend: a "List" foldout in the `DeckTable` per-deck detail (#7's
  home) with paste box + copy button.

**Effort:** M. **Pairs with:** 25 (card images per line via the same proxy),
61.
**Pitfalls.** Don't validate legality (60 cards, 4-of rule) as *errors* —
warn softly; house rules and partial lists exist. `nvarchar(4000)` fits any
real list; don't reach for `max` types on the rc Drizzle build.

### 61. Archetype identity via card search

**What.** A curated `archetypes` registry — canonical name + a defining card
(chosen via the pokemontcg.io search, #25's proxy) — that decks can be tagged
with. Matchup matrix (#3) and deck Elo (#6) aggregate by archetype when tags
exist, with name-matching as fallback.

**Why.** This is the properly-scoped fix that idea 6's status note explicitly
deferred: today "Gardevoir" and "Gard/Kirlia" never unify, and per-owner
decks vs the flat opponent pool is a real modeling conflict. An archetype
layer *on top of* per-player decks resolves it without forcing shared decks.

**How.**
- Schema: `archetypes` (`id`, `name nvarchar(100) unique`, `cardId
  nvarchar(50)`, `imageUrl nvarchar(300)`, `createdAt`); nullable
  `archetypeId` FK on `decks`.
- API: CRUD on archetypes (league admin or admin — curation is exactly the
  league-admin level of trust); deck endpoints accept `archetypeId`.
- Frontend: tag picker in deck management (#16) and the new-deck flow;
  aggregation modules (`matchup`, `elo`) key by archetype-else-name.

**Effort:** M–L. **Depends on:** 25's proxy for the card picker (or plain
text names to start). **Pairs with:** 3, 6, 16.
**Pitfalls.** Migration of history: retagging old decks re-buckets past
stats — that's the point, but note recaps/records can shift (same derived-
data stance as #33). Keep archetype optional forever.

### 62. Prize-count game closeness

**What.** Optionally record how close each game was — the opponent's
remaining prize cards when it ended (0 = they were about to win, 6 =
blowout) — surfacing "clutch factor" stats: average margin, blowout rate,
close-game record.

**Why.** W/L hides whether games were coin-flips or stomps; prizes-left is
the TCG's native closeness metric and takes one tap to capture at game end.

**How.**
- Schema: alongside idea 5's `games` string, a parallel optional
  `prizeMargins nvarchar(20)` on `matches` (comma-separated ints matching
  `games` positions), and the same on `event_matches` for live capture (45's
  game-report body gains an optional `opponentPrizesLeft: z.number().int().
  min(0).max(6)`).
- Frontend: an optional second row of chips (0–6) on the game-report buttons
  (45) and the detailed night form; stats in the deck foldout ("avg margin
  +2.1").

**Effort:** S–M. **Depends on:** 5/45.
**Pitfalls.** Keep it skippable-by-default — friction here poisons the core
loop. Validate positions align with `games` length (400 otherwise).

### 63. Shareable night recap

**What.** A "Share" button on any night (or finished event) composing an
emoji text recap — record, deck, standout stats, standings top-3 for events —
sent via the Web Share API (native share sheet on phones) with
copy-to-clipboard fallback.

**Why.** Tuesday's results get retyped into the group chat every week. One
tap replaces it — and unlike #27's public link, nothing is exposed; it's just
text the member chooses to paste.

**How.**
- Frontend-only: pure `src/lib/recap.ts` building the string (reuse `pts`/
  `ppg`, type emoji); `navigator.share({ text })` when available, else
  clipboard + toast (`Toast.svelte`).
- Entry points: night card overflow menu, event-done screen (50), season
  recap (#33).

**Effort:** S. **Pairs with:** 15, 33, 50.
**Pitfalls.** `navigator.share` requires a user gesture and https — both
already true; feature-detect, don't UA-sniff.

### 64. Calendar (iCal) feed of league nights

**What.** A subscribe-able calendar URL — scheduled events (53) as an iCal
feed phones/Google/Outlook refresh automatically, so "is league on this
week?" answers itself in everyone's own calendar.

**Why.** RSVP (53) needs people to *remember to open the app*; a calendar
subscription is passive and native.

**How.**
- API: `GET /api/calendar?key=<token>` returning `text/calendar` — an
  **anonymous route** (calendar apps can't do GitHub auth), token-gated
  exactly like #27: `settings`-table token, `timingSafeEqual`, admin
  rotate/disable. Emit VEVENTs (name, date, `roundLengthMin`-based estimate)
  by hand — iCal is simple enough to not need a dependency; mind CRLF line
  endings and escaping.
- Feed contains event names/dates/status **only** — no member names, no
  RSVPs (it's a bearer-token URL that will get forwarded around).
- Frontend: a "subscribe to calendar" card on `/events` showing the URL.

**Effort:** S–M. **Depends on:** 39/53; token plumbing shared with 27/66.
**Pitfalls.** Add the `staticwebapp.config.json` `allowedRoles:
["anonymous"]` route explicitly (same footgun as #27) and test logged-out.
Calendar apps poll — the payload must never require a warm database-heavy
path (it's one tiny table; fine).

### 65. Web Push: "pairings are up"

**What.** Opt-in browser push notifications — installed-PWA phones buzz when
a round is paired ("Round 2: table 5 vs Bob") or an event goes live, even
with the app closed.

**Why.** The one thing polling (44) can't do is reach a phone in a pocket.
Web Push needs no paid service — VAPID + the browsers' own push endpoints are
free, and every send moment is already an HTTP handler (43's round creation),
which sidesteps the no-timers constraint entirely.

**How.**
- Schema: `push_subscriptions` (`id`, `userId` FK, `endpoint nvarchar(500)`,
  `p256dh`/`auth` key columns, `createdAt`); unique on endpoint.
- API: subscribe/unsubscribe endpoints (member, own rows); the `web-push`
  npm package in `api/` with VAPID keys in app settings. 43/39 handlers send
  to affected members fire-and-forget (the 54 isolation pattern), pruning
  dead subscriptions on 404/410 responses.
- Frontend: needs the service worker from #24 (PWA) — a notifications toggle
  in the app requesting permission and posting the subscription.

**Effort:** M–L. **Depends on:** 24 (service worker), 43 (the moment worth
pushing). **Pairs with:** 54.
**Pitfalls.** iOS only delivers push to *installed* (home-screen) PWAs —
say so in the toggle UI. Never send result contents to guests'/others'
matches — notify a member only about their own pairing.

### 66. Automated off-site backups

**What.** A weekly GitHub Actions cron that pulls a full JSON export and
stores it outside Azure — the automated version of #22's "data insurance",
requiring no human to remember.

**Why.** #22 gives a button; buttons don't get pressed. The league's whole
history lives in one free-tier database — a scheduled copy in a second
location is the actual backup story.

**How.**
- Depends on #22's export shape. Auth for a headless caller: a
  `backupToken` in the `settings` table (the 27/64 token pattern),
  presented as a header to a dedicated `GET /api/export?format=json`
  anonymous route that returns the full dump *only* with a valid token
  (`timingSafeEqual`; 404 otherwise, and the route is useless without it).
- Workflow: `.github/workflows/backup.yml` on `schedule:` cron — curl with
  the token from an Actions secret, then commit the dated dump to a private
  backup repo (or upload as a long-retention artifact; the private-repo
  option survives artifact expiry). The repo already trusts Actions with
  production access (the OIDC migration job), so this is in-pattern.
- Admin card shows last-backup time (the workflow can POST a timestamp back,
  or just link to the backup repo).

**Effort:** M. **Depends on:** 22.
**Pitfalls.** The token is full-data-read — Actions secret only, rotate from
`/admin`, and log each export to the audit log. Don't schedule tighter than
the data changes (weekly is plenty; the DB also auto-pauses — one wake a week
is fine).

### 67. Playwright smoke suite

**What.** A minimal end-to-end test suite: boot the SWA CLI emulator against
the Docker SQL database, sign in as a member, log a night, see it on the
scoreboard; sign in as admin, add a member. Run locally via `npm run
test:e2e` and optionally in CI with an MSSQL service container.

**Why.** The verification bar is currently "exercise the flow manually" — 70
ideas in this file all inherit that cost. A 5-scenario smoke suite is the
highest-leverage infrastructure idea on the list, and the emulated-login
quirk (real keystrokes required — CLAUDE.md documents it) is exactly the kind
of thing tests encode once instead of every session rediscovering.

**How.**
- Playwright with `webServer` config launching `npm run serve` (built
  output); tests drive `/.auth/login/github` with real `type()` keystrokes
  per the CLAUDE.md quirk. Seed/reset the local DB via a small script using
  the existing Drizzle client before each run.
- Scenarios: member logs quick night; detailed night with matches; admin
  adds/removes member; leaderboard renders; (post-36) league admin can add
  but sees no remove.
- CI: a separate workflow job with `mcr.microsoft.com/mssql/server` as a
  service container, migrations applied, then the suite — optional first
  pass; local-only is already a win.

**Effort:** M–L (chore). **Pairs with:** everything.
**Pitfalls.** Don't chase full coverage — this is a smoke suite; five stable
scenarios beat thirty flaky ones. Keep it out of the deploy workflow until
it's proven non-flaky.

### 68. Deck retirement

**What.** Mark a deck retired: hidden from the deck picker and "what should I
play" (#29), still present in all historical stats, un-retireable any time.

**Why.** After a year the picker fills with rotated decks; today the only
cleanups are merge or delete (#16), both wrong for "I just don't play it
anymore".

**How.**
- Schema: nullable `retiredAt datetime2` on `decks`.
- API: set/clear via `decks.ts` PUT — deck owner (their own decks) or admin;
  GET gains the field.
- Frontend: "Retire" in the deck manager (#16) and the `DeckTable` foldout;
  pickers (`DeckPicker`, `NightForm` chips, #29) filter retired by default
  with a "show retired" reveal.

**Effort:** S.
**Pitfalls.** Retired ≠ hidden from stats — only *pickers* filter. Opponent-
deck matching should still find retired decks (the opponent didn't retire it).

### 69. Danish localization

**What.** A language toggle (English/Dansk) covering the app chrome — labels,
buttons, empty states, toasts — persisted like the theme toggle. Game terms
(deck names, energy types, W/T/L) stay English.

**Why.** It's a Danish league. Kids and less-English-comfortable players at a
league night are real users; the app is small enough that this is tractable
now and only gets more expensive every idea it waits.

**How.**
- No i18n library: a `src/lib/i18n.svelte.ts` module with a typed dictionary
  (`t('nights.add')`), an `en`/`da` map, and a `$state` locale persisted to
  `localStorage` (mirror `ThemeToggle`'s mechanism, including the pre-paint
  read if any translated text renders before hydration).
- The work is the audit: sweep every component for literals; dates via
  `Intl.DateTimeFormat(locale)` replacing hand-rolled `fmtDate` internals.
- Toggle lives next to `ThemeToggle` in the masthead.

**Effort:** M–L (the sweep, not the mechanism).
**Pitfalls.** Keep energy types/TYPES keys English internally (they're data,
matched against stored values) — translate display only. Don't translate
user content (notes, deck names). Danish strings from the user, not machine
translation, for the final pass.

### 70. "A year ago this week"

**What.** A small rotating panel: "This week last year: you went 4–0 with
Gardevoir" / "One year since your first night" — nostalgia pulled from the
member's own history.

**Why.** Cheap delight in the #10/#26 family, and uniquely a *long-term*
retention feature: it gets better every week the league keeps logging.

**How.**
- Frontend-only: pure `src/lib/history.ts` scanning the nights array for
  same-ISO-week-previous-years highlights (best night, first-ever night,
  anniversary of a deck's debut), returning at most one line; a dismissible
  card on the main page. ISO-week math with the same UTC discipline as #12
  (shared helper).
- Nothing to show → render nothing (most weeks, year one).

**Effort:** S. **Pairs with:** 10, 12, 26.
**Pitfalls.** Don't surface bad memories as celebration — pick positive or
neutral framings only ("first night with X", not "your 0–4").

---

## I. Inspired by other PTCG trackers (Training Court, Trainer Hill)

Ideas 71–78 come from surveying two established community tools:
[Training Court](https://trainingcourt.app) (a solo practice/tournament
tracker whose headline feature is parsing pasted PTCG Live battle logs) and
[Trainer Hill](https://www.trainerhill.com) (a tournament-data meta-analytics
site with practice tools). Features those tools have that this backlog
already covers are *not* repeated here — decklist import/export is #60, deck
art is #25/#61, text recaps and CSV export are #63/#22, and Trainer Hill's
matchup grid is essentially #3. What remains is what neither the app nor
ideas 1–70 have.

### 71. PTCG Live battle-log import

**What.** Paste a PTCG Live battle log into the detailed-night match row and
have the app fill the match in: W/T/L from the log's outcome line, `wentFirst`
from turn 1, and a *suggested* opponent deck from the Pokémon that appeared —
one paste instead of four taps. Training Court's headline feature, scoped down
to this app's match model.

**Why.** Detailed logging (opponent deck, turn order) is the app's richest
data and also its highest-friction entry path. Most league members practice on
PTCG Live between Tuesdays; the log is already on their clipboard culture-wise
(it's how games get shared on Discord). This makes the *casual-night* data as
rich as the league-night data with less effort, not more.

**How.**
- Phase 1 is frontend-only: a pure parser module `src/lib/battlelog.ts`. The
  log is plain text with a stable shape — player names appear in the setup
  lines, turns are delimited by `Turn # N - <name>'s turn`, and a
  `<name> wins` line ends it. Extract: both player names, who took turn 1,
  the winner, and the set of Pokémon each side put into play.
- The app doesn't know which player is "you": after the first paste, show a
  two-button "which one are you?" prompt and remember the chosen screen name
  in `localStorage` (a `users` column is overkill until someone asks for
  cross-device).
- Opponent deck suggestion: match the opponent's most-prominent Pokémon names
  against the existing decks registry (the case-insensitive matching
  `DeckPicker`/`DeckTable` already use); pre-select on a confident hit,
  otherwise leave the picker untouched. A suggestion, never an auto-commit.
- UI: a "paste log" affordance on the detailed-mode match row in
  `NightForm.svelte` that expands a textarea; parsing fills the existing
  controls, which stay editable.

**Effort:** M (the parser is the work; everything it writes to already
exists). **Depends on:** 1 (shipped). **Pairs with:** 72 (storage/replay), 61
(archetype-keyed suggestions once tags exist).
**Pitfalls.** The log format is unversioned and undocumented — PTCGL updates
can change wording. Parse defensively: any line that doesn't match is skipped,
any missing fact leaves its form control alone, and a failed parse must
degrade to "nothing happened" rather than a broken form. Don't guess the
result from mid-log state (concessions produce short logs); only trust the
explicit outcome line.

### 72. Stored battle logs & turn-by-turn viewer

**What.** Optionally keep the pasted log (71) attached to the match, and
render it as readable, styled turns — grouped per turn, your turns visually
distinct from the opponent's — instead of PTCGL's wall of text. Training
Court's second act: "visualizing the game like this helps with understanding
mistakes made in practice."

**Why.** "What did I misplay in round 3?" currently has no answer once the
game window closes. The league's culture of dissecting each other's games gets
a permanent, linkable home per match.

**How.**
- Schema: a separate `match_logs` table (`id`, `matchId` FK → `matches.id`
  unique, `content`, `createdAt`) rather than a column on `matches` — logs
  are huge and most matches won't have one, so keep the hot table lean.
- Rendering: reuse `src/lib/battlelog.ts` (71) to split into turns
  client-side; a foldout on the match row in `NightsList.svelte`'s detailed
  view. Render as text nodes only.
- API: accept an optional `rawLog` on the match objects in `nights.ts`
  POST/PUT (Zod: max length bound), write to `match_logs` in the same
  transaction as the match rows.

**Effort:** M. **Depends on:** 71.
**Pitfalls.** Size: real PTCGL logs run well past `nvarchar(4000)` — this
table genuinely needs `nvarchar(max)`; verify the rc Drizzle build supports
`length: 'max'` *before* starting, and if it doesn't, store a bounded prefix
and say so in the UI rather than upgrading packages (the #60 pitfall's rule).
Logs contain both players' screen names — that's the member's own pasted
content, same privacy class as notes, so keep logs out of every response
except the owner's/admin's own-night detail (mirror how notes behave).

### 73. External tournament log

**What.** Track tournaments a member attends *outside* the league — a League
Challenge at another store, a Regional — with the fields Training Court
attaches to a tournament: name, date, category (Challenge/Cup/Regional/other),
final placement, deck played, and per-round results with opponent decks.

**Why.** Section G covers nights this league runs itself, and #51 imports the
league's own sanctioned events — but nothing covers the tournaments members
travel to, which are exactly the results people most want to remember. Today
those either pollute a "casual night" or go unrecorded.

**How.**
- Make a tournament a *wrapper around an ordinary personal night* rather than
  a parallel stats world (the section-G lesson): a `tournaments` table (`id`,
  `ownerId` FK → `users.id`, `name nvarchar(100)`, `category nvarchar(20)` —
  Zod enum, `placement int` nullable, `playersCount int` nullable,
  `createdAt`) plus a nullable `tournamentId` FK on `nights`. The night
  carries the date, deck, and per-round `matches` rows with the existing
  machinery; the tournament row carries only what a night can't.
- Log with `isLeagueNight = 0` so tournament games never touch league
  scoring/leaderboard — but they *do* flow into the owner's own deck stats,
  matchup matrix, and turn-order breakdowns for free, because those read
  `nights`/`matches`.
- API: a small `tournaments.ts` function (owner-scoped CRUD, the `nights.ts`
  auth skeleton); `nights.ts` GET joins the tournament fields onto nights
  that have one.
- Frontend: create/edit from `NightForm.svelte` via an "this was a
  tournament" disclosure (name/category/placement fields); `NightsList.svelte`
  renders a placement badge ("🏆 3rd of 24") on tournament nights.

**Effort:** M. **Depends on:** 1 (shipped). **Pairs with:** 59 (placements on
profiles), 60 (the list you played).
**Pitfalls.** Resist a separate results pipeline — if tournament rounds
aren't ordinary `matches` rows, every stats view forks. Placement is
self-reported and optional; don't require `playersCount` to save. Decide
visibility explicitly: tournament nights are personal nights, so they inherit
the existing owner-only boundary — placements only become social if/when #59
grows a section for them.

### 74. Format & rotation awareness

**What.** A first-class notion of the Standard format a night was played in
(e.g. "G-on", "H-on"), derived from the date — with a format filter on the
deck foldout's matchup/opponent breakdowns and a soft warning when a stats
view aggregates across a rotation boundary.

**Why.** Standard rotates every April; matchup and win-rate data from before
a rotation quietly stops meaning anything ("my 60% into Lugia" was against a
deck that no longer exists). Trainer Hill filters everything by format for
exactly this reason. Without it, the app's stats get *worse* the longer the
league runs — the opposite of what a tracker is for.

**How.**
- Follow the seasons pattern exactly (#9's no-FK design): a `formats` table
  (`id`, `name nvarchar(20)`, `startsOn date not null`, `endsOn date`
  nullable = current), membership derived from `played_on` at read time via a
  `nightInFormat` helper next to `nightInSeason` in `src/lib/pokemon.ts`.
  Admin-managed from `/seasons` (retitle the page "Seasons & formats" —
  they're the same kind of admin-curated date partition; one rotation entry
  per year is the whole maintenance burden).
- Frontend: a format chip in the deck foldout's matchup/opponent sections
  (defaulting to the current format once more than one exists), and a muted
  "spans N formats" note on all-time aggregates.
- No API change beyond `formats` CRUD mirroring `seasons.ts`.

**Effort:** S–M. **Pairs with:** 9 (shared pattern), 61 (archetypes rotate
too).
**Pitfalls.** Don't tag decks with formats — a deck name persists across
rotations even when its list changes (#60's versioning covers that side).
Formats and seasons deliberately don't align (a league season can straddle
April); never merge the two tables, just render both context strips.

### 75. Match tags — one-tap "why it went that way"

**What.** A small fixed vocabulary of optional tags on each detailed match,
borrowed nearly verbatim from Trainer Hill's Battle Journal: *ahead early,
behind early, slow start, lucky, got donked, donked opp, dead drew, prizes
hurt, never punished, gg*. Toggle chips at log time; tag-aware stats later
("4 of 6 Gardevoir losses are tagged *dead drew*").

**Why.** W/L records why-less: a 2–3 night of coin-flip games and a 2–3 night
of unwinnable stomps read identically forever. Tags capture the *texture* of
games at the moment it's known, for one tap — and in a league of friends the
tags are half banter, which is exactly why they'll actually get used. The
closest existing idea, #62, captures closeness numerically; tags capture
cause, and the two compose.

**How.**
- Schema: follow idea 5's compact-string precedent — a nullable
  `tags nvarchar(200)` on `matches` holding comma-separated tag keys, with
  the vocabulary defined once as a Zod enum in `nights.ts` and mirrored in a
  `src/lib/tags.ts` (key → label/emoji map).
- Frontend: a wrapping row of small toggle chips under the match row's
  existing controls in `NightForm.svelte` (collapsed behind a "tags" reveal
  so quick loggers never see them). Display: tiny emoji chips on match strips
  in `NightsList.svelte` with the label on hover/tap.
- Stats: a per-deck tag-count breakdown as one more collapsible subsection in
  `DeckTable.svelte`'s foldout (the #7 pattern), splitting counts by
  win/loss so "lucky wins" and "dead-drew losses" fall out naturally.

**Effort:** S–M. **Depends on:** 1 (shipped). **Pairs with:** 62, 71 (a
parsed log could pre-suggest *got donked* from game length).
**Pitfalls.** Keep the vocabulary fixed and small — free-text tags fragment
into unaggregatable noise, and adding a tag key later is a one-line enum
diff. Tags are subjective self-reporting; keep them out of anything
competitive (no leaderboard column) so nobody sandbagging *lucky* on
opponents' wins becomes a league argument.

### 76. League meta share & trends

**What.** Trainer Hill's meta page, for our own tiny meta: what share of
league nights each deck was piloted, per season, with ▲/▼ movement against
the previous season — and optionally a stacked-area "our meta over time"
chart.

**Why.** #35 answers "am *I* improving season over season"; nothing answers
"what is our league's meta and how is it shifting". Deck diversity is a
league-health number (three decks at 80% share is a stale league), and
"Gardevoir is on the rise" is exactly the kind of shared narrative that keeps
a weekly league talking.

**How.**
- Cross-player deck data is already aggregate-shared (`/api/leaderboard`'s
  `bestDeck` set the precedent, #31/#33 widened it deliberately): extend the
  leaderboard handler with a `metaShare` block — per-deck night counts for
  the requested season, grouped in SQL by deck id, same
  league-night/season-range filters as the standings query. No raw nights
  cross the privacy boundary.
- Frontend: a "Meta" collapsible on `/leaderboard` behind the existing
  `SeasonSwitcher` — a bar list (deck, owner display name, share %, ▲/▼ vs
  the previous season, fetched the way `HallOfFame.svelte` already resolves
  per-season leaderboard calls). The stacked-area chart is a follow-up, not
  v1 — the bar list is the value.
- Movement needs two seasons of data minimum; render nothing rather than
  arrows against an empty previous season.

**Effort:** M. **Depends on:** 9, 32 (both shipped). **Pairs with:** 31, 61
(share by archetype once tags exist — two players' "Charizard" builds should
count as one meta entry).
**Pitfalls.** Share of *nights*, not games — a 12-game grinder night
shouldn't triple a deck's meta presence; say which denominator is used in the
UI. Small-league percentages swing wildly (one player switching decks moves
~15%) — show counts alongside percentages so nobody reads statistical noise
as a trend.

### 77. Community-standard win rates (ties as ⅓)

> **Status: implemented in PR #59.** `scorePct` in `src/lib/pokemon.ts` already
> computed exactly this formula (it's how `PPG / 3` was derived) — every
> percentage display (`DeckTable`'s matchup/opponent-type cells, the
> leaderboard) already routed through it, so the change was a doc/label pass:
> the docstring now states the community-convention equivalence explicitly,
> and a `title` tooltip ("ties count as ⅓ win…") was added to each "Score%"
> header rather than a per-cell label.

**What.** Wherever the app shows a win percentage, adopt the community
convention Trainer Hill defaults to: a tie counts as a third of a win,
`(W + T/3) / (W + L + T)`.

**Why.** Comparability — when a league member reads "Gardevoir is 55% into
Raging Bolt" on Trainer Hill and their own foldout says 48%, the numbers
should disagree about *their games*, not about arithmetic. The neat part:
this app's own scoring already agrees — PPG on the 3/1/0 scale divided by 3
*is* exactly this formula — so the convention makes win% consistent with PPG
too, not just with the outside world.

**How.**
- An audit, not a mechanism: add one `winRate(w, t, l)` helper to
  `src/lib/pokemon.ts` next to `pts`/`ppg`, then sweep every place a
  percentage is currently computed (`DeckTable.svelte`'s matchup/opponent
  cells, `MatchupMatrix`, records/awards modules if any show %) onto it.
  Delete the local computations.
- Label it once, in the matchup favorability legend/tooltip ("ties count as
  ⅓ win"), not on every cell.

**Effort:** S.
**Pitfalls.** This visibly shifts existing displayed numbers for anyone with
tie history — one line in the PR description ("win% now counts ties as ⅓,
matching PPG and community convention") turns a bug report into a release
note. Don't make it a settings toggle; two people quoting different numbers
from the same app is worse than either convention.

### 78. Decklist diff

**What.** Given #60's versioned decklists, a compare view: this list vs its
previous version (or any two lists) as a three-column change summary — cards
cut, counts changed, cards added — the table half of Trainer Hill's deck-diff
tools (the Venn diagram is the gimmick; the table is the utility).

**Why.** #60 stores versions but gives no way to see what changed between
them. "What did I cut for the third Iono, and did the deck get better?" is
the whole reason a player keeps versions — and next to each version's
date-range results, the diff quietly becomes A/B data for the deck's builds.

**How.**
- Pure frontend over #60's parse: `src/lib/decklistDiff.ts` takes two parsed
  lists, keys cards by `name + setCode + number`, returns
  `{ added, removed, changed }` with count deltas.
- UI: in the deck foldout's list section (#60's home), a version picker
  defaulting to "current vs previous", rendering the three groups with
  `+n/−n` count chips. Optionally show each version's W-T-L over the dates it
  was current (derivable from `deck_lists.createdAt` ranges against the
  deck's nights — same derive-at-read-time stance as everything else).
- No API or schema change beyond #60's.

**Effort:** S (given 60). **Depends on:** 60.
**Pitfalls.** Reprints: the same card under two set codes diffs as
cut-and-add — key by name alone for the *changed* bucket and mention the set
code only in the detail line, or every rotation reprint looks like a rebuild.
Keep the per-version results panel honest about tiny samples (the #57
small-sample rule: show game counts, no editorializing).

---

## J. Multiple leagues

Requested directly by the user (July 2026): the league is outgrowing the
single `isLeagueNight` boolean — a second competitive context (a big
tournament series, a second weekly league) currently has nowhere to live that
doesn't either pollute the Tuesday standings or vanish into the undifferentiated
"casual" bucket.

### 79. Leagues — named competitive contexts

> **Status: implemented in PR #59**, matching this idea's scoping as written:
> `leagues` table + nullable `nights.leagueId`, seeded with "Spilforsyningen
> Tirsdag" and backfilled from `is_league_night` via a two-migration pair
> (DDL then a hand-written `--custom` data migration), verified against a
> pre-migration Docker snapshot and confirmed idempotent on re-run.
> `api/src/functions/leagues.ts` mirrors `seasons.ts` (GET member;
> POST/PUT/archive/unarchive admin-only for now — `isLeagueAdmin` doesn't
> exist yet); the default league (lowest unarchived id) can't be archived.
> `api/src/db/leagues.ts` holds the single write-path mapping
> (`resolveNightLeagueId`) nights.ts uses on every POST/PUT so
> `isLeagueNight`/`leagueId` can't drift. `leaderboard.ts` takes `?leagueId=`
> (defaulting to the default league) but the frontend leaderboard page
> doesn't call it with one yet — awards/hall-of-fame/leaderboard stay
> Spilforsyningen-Tirsdag-only in this PR, deliberately, per #80. The nav
> selector (`NavMenu.svelte` + `src/lib/league.svelte.ts`, a shared
> `$state`/localStorage store like `theme.svelte.ts`) only renders once a
> second league exists. `NightForm`'s League/Casual toggle labels itself with
> the active league's name once >1 exists; edit mode binds to the night's own
> `leagueId` (not the nav's active one) unless the user explicitly clicks the
> toggle, verified by editing a Summer Cup night while Tuesday was active in
> the nav and confirming the PUT body kept `leagueId: "2"`. The main page
> filters Scoreboard/DeckTable/NightsList to casual + the active league,
> composing with the season filter; Records/Badges/CalendarHeatmap stay
> unfiltered (lifetime views). A "N nights in other leagues" hint with
> per-league switch links appears under NightsList when nights are hidden.

**What.** A `leagues` registry ("Tuesday League", "Summer Cup 2026", …) that a
night belongs to, replacing the binary league/casual split with
*casual | which league*. The leaderboard, season awards, and league-scoped
stats all become per-league; Tuesday standings never see the big tournament's
games and vice versa.

**Why.** `nights.isLeagueNight` encodes exactly one competitive context. The
moment a second one exists, every choice is wrong: log its games as league
nights and the Tuesday leaderboard/season awards absorb them; log them casual
and they're invisible in standings entirely. A league entity is the general
fix, and it's *not* redundant with the neighboring ideas: #73 covers a
tournament a member attends alone (owner-scoped, no shared standings), and a
section-G event is one shared night — an ongoing second competition with its
own standings across multiple nights is a league.

**How.**
- Schema: `leagues` (`id` identity PK, `name nvarchar(100) not null`,
  `archivedAt datetime2` nullable — hides it from pickers, keeps history,
  the #68 retirement pattern; `createdAt`), plus a nullable `leagueId int`
  FK on `nights`. **Semantics after backfill (user's decision):** `leagueId`
  null → casual night; `leagueId` set → that league's night. Every night
  logged before this feature is either casual or from the Tuesday league at
  Spilforsyningen, so the backfill is unambiguous.
- Backfill: two migrations. First the generated DDL migration
  (`npm run db:generate` as usual), then a **custom** data migration —
  `drizzle-kit generate --custom` produces an empty migration file meant for
  hand-written SQL, which is not the same as hand-editing *generated* SQL
  (CLAUDE.md's prohibition): insert the league named exactly
  **`Spilforsyningen Tirsdag`**, then
  `UPDATE nights SET league_id = <its id> WHERE is_league_night = 1 AND
  league_id IS NULL` (the `IS NULL` guard makes a re-run harmless). Verify
  both against the Docker DB before the PR — production runs them
  automatically on merge (the `migrate_database` job), so this is the repo's
  first data migration and it must be right the first time.
- `isLeagueNight` becomes fully derivable (`league_id IS NOT NULL`). Don't
  drop it in the same PR: keep writing both in sync (one shared mapping in
  `nights.ts`, never two code paths), migrate every reader to `leagueId`,
  and drop the column in a follow-up migration once nothing reads the bit.
- API: a small `leagues.ts` mirroring `seasons.ts` — GET (member);
  POST/PUT/archive gated on `isAdmin` today, relaxed to `isLeagueAdmin`
  when #36 lands (league curation is exactly the league-admin level of
  trust, same call #61 makes). `leaderboard.ts` gains a Zod-validated
  `?leagueId=` (the #32 `seasonId` template) filtering `league_id = @id` in
  SQL; no param defaults to the default league. `nights.ts` accepts an
  optional `leagueId` on POST/PUT (must exist and be unarchived), returns it
  on GET, and maps the legacy `isLeagueNight` boolean to
  default-league/null during the transition so no caller breaks mid-PR.
- Default-league resolution (for *defaults only* now, not data meaning —
  the data is always explicit after the backfill): the unarchived league
  with the lowest id, i.e. the seeded Spilforsyningen Tirsdag. One shared
  helper, used by the form preselection and the leaderboard/awards default.
- Frontend: a new **`/leagues` management page** on the `/seasons` template
  (prerendered route + `staticwebapp.config.json` rewrite, linked from
  `NavMenu` for admins — and for league admins once #38's role-aware nav
  exists): create, rename, archive. `NightForm.svelte`'s League/Casual
  toggle **stays a two-button toggle** (user's decision): "League" means
  *the active league from the nav selector* — a saved league night writes
  that league's `leagueId`, and the button labels itself with the league's
  name once more than one league exists ("Spilforsyningen Tirsdag" /
  "Casual"). Logging into a different league = switch the nav selector
  first; the form itself never grows a league picker. The `isTuesday(date)`
  auto-default keeps toggling league-on for Tuesdays.
- **Global league selector in the nav menu (user's decision):** a simple
  dropdown pill inside `NavMenu.svelte`'s panel — its own "League" divider
  section (the existing Admin/Theme section pattern) showing the active
  league as a pill that expands to the list of unarchived leagues. Rendered
  only when more than one league exists. The selection is app-wide state in
  a tiny runes store (`src/lib/league.svelte.ts`, persisted to
  `localStorage` exactly like `theme.svelte.ts`) defaulting to the default
  league; every league-scoped view reads it — `/leaderboard`'s fetch passes
  it as `?leagueId=`, and `NightForm`'s League button logs into it. One
  selector, one context, instead of per-page pickers.
- **The main page filters by the active league (user's decision):** the
  nights list shows casual nights plus the active league's league nights —
  other leagues' nights are *hidden*, not just badged. Apply the same
  client-side filter (a `$derived` view in `+page.svelte`, composing with
  the existing season filter) to everything that must agree with the
  visible list: `Scoreboard.svelte` (whose league/overall filter now means
  "the active league"), `DeckTable.svelte`, and `TrendChart`. The
  deliberately-lifetime panels keep the #9 boundary and stay unfiltered:
  Records, Badges, and the calendar heatmap read the full array.
  `NightsList.svelte`'s per-night chip still names the league (it's needed
  in admin scope and edit mode, and it's what tells you *why* a night is
  showing).
- Seasons stay global in this PR to keep it reviewable; #80 makes them
  per-league (user's decision) together with the award surfaces.
  `src/lib/seasonAwards.ts` and the recap/hall views scope to the default
  league until then.

**Effort:** M–L (the work is the backfill discipline plus auditing every
`isLeagueNight` read — `leaderboard.ts`, `seasonAwards.ts`,
`Scoreboard.svelte`, `NightsList.svelte`, `NightForm.svelte` — and deciding
each one's league scoping consciously). **Pairs with:** 9 (same
admin-managed-registry shape), 32 (the query-param template), 36/38 (the
role that will co-own the `/leagues` page), 39 (events would gain the same
nullable `leagueId` when section G lands), 55, 73.
**Pitfalls.** The two migrations must land in one PR and run in order —
the DDL migration first, the data migration second; test the pair against
the Docker DB from a pre-migration snapshot, not just an already-migrated
dev database. While both columns exist, drift between `isLeagueNight` and
`leagueId` is the failure mode — a single write-path mapping, never
parallel logic. Refuse archiving the default league (it anchors form
defaults and the awards scope). Don't force the choice on quick logging —
one league means the form looks exactly like today. Because the form binds
"League" to the *active* league, **editing** an existing night must bind to
the night's *own* `leagueId` instead — editing a Summer Cup night while
Tuesday is selected in the nav must not silently re-link it (label the
button with the night's league in edit mode, and only write a changed
`leagueId` if the user explicitly toggled Casual↔League). Filtering the
nights list by active league creates a "where did my night go?" moment the
first time someone logs into the wrong league — a muted one-line hint under
the list ("3 nights in other leagues") that switches the selector on tap is
cheap insurance; hidden must never mean undiscoverable. Hall of fame / season
awards claim "champion" titles — in this PR they stay
Spilforsyningen-Tirsdag-only; #80 makes them league-scoped deliberately
rather than by accident.

### 80. Per-league seasons, awards, recap & hall of fame

**What.** Seasons themselves become per-league, and every season-derived
surface — the switcher, progress strip (#34), season awards panel (#31),
recap (#33), and hall of fame (#33) — follows the nav-menu league selector
(#79). With "Summer Cup 2026" active, the season switcher lists *that*
league's seasons and `/leaderboard` shows *that* league's champions, best
deck, and hall-of-fame cards — each league runs its own calendar and crowns
its own honor roll instead of borrowing Tuesday's.

**Why.** #79 deliberately leaves both pinned to Spilforsyningen Tirsdag so
the leagues PR stays reviewable. But a competition without its own seasons
and champions is half a league: a tournament series has its own start and
end dates that make no sense as Tuesday-league seasons, and the awards cycle
is the retention loop (#31's own argument) — it should fire per competition,
not once globally.

**How.**
- Schema (user's decision — seasons are per-league): nullable `leagueId int`
  FK on `seasons`, backfilled to Spilforsyningen Tirsdag with the same
  custom-data-migration pattern #79 establishes — every existing season is
  Tuesday-league history. Zod requires `leagueId` on season POST from then
  on, so the column is effectively non-null after backfill.
- API: `seasons.ts` returns each season's `leagueId` and scopes its
  **no-overlap validation to within one league** — two leagues may
  legitimately run overlapping date ranges, so the current global overlap
  check would wrongly reject a valid second-league season.
  `leaderboard.ts` validates that a passed `?seasonId=` actually belongs to
  the requested league (mismatch → 404, the #32 unknown-id rule).
- Frontend: `SeasonSwitcher` lists only the active league's seasons (plus
  All time), and **resets its selection when the league selector changes**
  — carrying a stale `seasonId` across leagues is the obvious bug. Add a
  `seasonsForLeague` helper next to `nightInSeason` in `src/lib/pokemon.ts`
  rather than pushing league awareness into the date math (`nightInSeason`
  stays a pure date check). `/seasons` management gains a league picker on
  its create/edit form (defaulting to the active league); `SeasonProgress`
  (#34) reflects the active league's current season.
- Awards/recap/hall thread the active league from `src/lib/league.svelte.ts`
  through every leaderboard fetch on the page — including
  `HallOfFame.svelte`'s per-ended-season calls, which now iterate the
  active league's ended seasons only. `personalSeasonAwards`
  (`src/lib/seasonAwards.ts`) switches its `isLeagueNight` filter to
  "night is in the active league".
- Label the context: awards/recap/hall headers name the league
  ("Spilforsyningen Tirsdag · Spring 2026") so a screenshot is
  self-explanatory — cheap insurance against cross-league confusion in the
  group chat.

**Effort:** M (given 79 — a small migration plus threading one parameter
through season plumbing that's already reactive).
**Depends on:** 79 (and 31–34, shipped).
**Pitfalls.** The overlap-validation rescoping is the subtle change — it
*loosens* a constraint, so get the `leagueId` condition into the check
rather than deleting it. A night can now be in-season for one league and
off-season for another on the same date; that's correct (#9's gap stance,
per-league) — don't "fix" it. A season with zero nights for the active
league must render nothing rather than an empty "champion: —" card (the #31
ended-season gate handles most of this; verify the zero-night case
specifically). Hall-of-fame calls stay one league's worth per view — keep
the resolve-once-per-selection pattern, don't prefetch every league.
Min-games floors (`BEST_NIGHT_MIN_GAMES` etc.) matter *more* in a small
side league — keep them, never lower them per league.

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

> **Update (July 2026, ideas 36–70):** sections F–H add the league-admin role
> and the league-night suite. The dependency spine to "run a whole Tuesday in
> the app" is **36 → 39 → 40 → 43 → 45 → 50** — build in that order, with
> 37/38 completing the role along the way; nothing in section G is worth
> starting before 36 and 39 exist. Best standalone picks from the new
> sections: **#67** (smoke-test suite — pays for itself across every other
> idea here), **#63** (share recap, S), **#68** (deck retirement, S), **#70**
> (S). **#51** (TOM `.tdf` import) should wait until the event schema (39–43)
> has stabilized, and needs empirical verification of the undocumented
> `outcome` codes. New ideas needing an explicit product decision first:
> **#64/#66** (new anonymous token-gated endpoints, the #27 class of
> exposure) and **#54** (posting league data to an external Discord).

> **Update (July 2026, ideas 71–78):** section I adds ideas surveyed from
> Training Court and Trainer Hill. Best picks among them: **#77** (win-rate
> convention — S, pure consistency win), **#75** (match tags — S–M, high
> fun-per-effort), and **#71** (battle-log import — M, the biggest
> data-quality lever since #1 itself). **#72** should wait for #71 to prove
> the parser; **#78** waits on #60; **#76** extends the `/api/leaderboard`
> aggregate surface the way #31/#33 already did, so it needs no new product
> decision.

> **Update (July 2026, ideas 79–80):** **#79 (multiple leagues) is a direct
> user request, which puts it ahead of the speculative ideas** — it's the
> answer to "the Tuesday league and a big tournament shouldn't intermingle".
> **#80** (per-league seasons, awards & hall of fame) is its user-requested
> follow-up — build it immediately after #79, not bundled into it. If section G is ever
> built, do #79 first or alongside #39 so events are born with a `leagueId`.
