import { int, nvarchar, date, datetime2, bit, mssqlTable, unique } from 'drizzle-orm/mssql-core';
import { sql } from 'drizzle-orm';

/**
 * Drizzle schema — the source of truth for the database. Migrations under
 * ./drizzle are generated from this file; sql/schema.sql is only a fresh-install
 * fallback reference.
 */

/**
 * Decks are owned by whoever created them (owner_id, nullable). A deck with
 * no owner is a reference-only entry — never logged as anyone's own deck,
 * only usable as an opponent's — for archetypes played by people who don't
 * use this app. Names are unique per owner (and among unowned decks) rather
 * than globally, so two players can each have their own "Charizard ex"
 * without colliding; opponent-deck matching still searches across every
 * deck regardless of owner, so it behaves like one shared/global list.
 */
export const decks = mssqlTable(
  'decks',
  {
    id: int().primaryKey().identity(),
    name: nvarchar({ length: 100 }).notNull(),
    ownerId: int('owner_id').references(() => users.id),
    energyType: nvarchar('energy_type', { length: 50 }),
    createdAt: datetime2('created_at', { mode: 'date' })
      .notNull()
      .default(sql`SYSUTCDATETIME()`)
  },
  (table) => [unique('decks_owner_id_name_unique').on(table.ownerId, table.name)]
);

/**
 * Identity directory for everyone who has actually signed in. Keyed on the
 * immutable Static Web Apps userId, with the GitHub login stored as a plain
 * display name that is refreshed on every login. Because nights reference this
 * table (not a copied-in login string), renaming a GitHub account updates the
 * name everywhere automatically. Distinct from allowed_users, which is the
 * admin-managed access policy (who may enter, and with what role).
 */
export const users = mssqlTable('users', {
  id: int().primaryKey().identity(),
  // Immutable Static Web Apps userId — the stable identity, never changes.
  userId: nvarchar('user_id', { length: 200 }).notNull().unique(),
  // Current GitHub login, refreshed on each sign-in. Display only, not unique
  // (a freed-up login could briefly appear on two rows until both refresh).
  githubLogin: nvarchar('github_login', { length: 100 }).notNull(),
  // Optional display name the player chooses for themselves, shown instead of
  // githubLogin to other players (leaderboard, opponent deck lists, etc.) —
  // never used for ownership/auth, which stay keyed on userId/githubLogin.
  // Null means "no alias set, show the GitHub login". Self-service, set from
  // /profile via PUT /api/me; checked case-insensitively unique against other
  // users' alias/githubLogin so aliases can't impersonate a real member.
  alias: nvarchar('alias', { length: 50 }),
  createdAt: datetime2('created_at', { mode: 'date' })
    .notNull()
    .default(sql`SYSUTCDATETIME()`)
});

export const nights = mssqlTable('nights', {
  id: int().primaryKey().identity(),
  playedOn: date('played_on', { mode: 'string' }).notNull(),
  deckId: int('deck_id')
    .notNull()
    .references(() => decks.id),
  wins: int().notNull().default(0),
  ties: int().notNull().default(0),
  losses: int().notNull().default(0),
  notes: nvarchar({ length: 500 }),
  // League night (ranked/tracked play) vs casual night — defaults to league
  // since that's the primary use case this app was built for.
  isLeagueNight: bit('is_league_night').notNull().default(sql`1`),
  // Owner: a foreign key into users. The display name comes from the joined
  // users row, so it always reflects the owner's current GitHub login.
  ownerId: int('owner_id')
    .notNull()
    .references(() => users.id),
  createdAt: datetime2('created_at', { mode: 'date' })
    .notNull()
    .default(sql`SYSUTCDATETIME()`),
  // Soft delete: null means active. Deleting sets this instead of removing the
  // row (and leaves its matches intact) so a delete can be undone; every read
  // path below filters it out except the admin-only "recently deleted" scope.
  deletedAt: datetime2('deleted_at', { mode: 'date' })
});

/**
 * Per-match results within a night, added so a night can optionally be logged
 * as individual matches instead of only an aggregate W/T/L. The nights.wins/
 * ties/losses columns stay authoritative and are recomputed from this table
 * on every write, so every existing read path (Scoreboard, DeckTable,
 * TrendChart) keeps working untouched for both quick-logged and detailed
 * nights.
 */
export const matches = mssqlTable('matches', {
  id: int().primaryKey().identity(),
  nightId: int('night_id')
    .notNull()
    .references(() => nights.id),
  roundNo: int('round_no').notNull(),
  // 'W' | 'T' | 'L'
  result: nvarchar({ length: 1 }).notNull(),
  // Optional: what the opponent was playing, reusing the same decks registry
  // as the player's own deck. Null when not recorded.
  opponentDeckId: int('opponent_deck_id').references(() => decks.id),
  // Optional: whether the player went first in this match. Null when not recorded.
  wentFirst: bit('went_first'),
  createdAt: datetime2('created_at', { mode: 'date' })
    .notNull()
    .default(sql`SYSUTCDATETIME()`)
});

/**
 * Named partitions of play (e.g. "Spring 2026"), managed by the admin from
 * /seasons. Deliberately has no FK on nights — a night's season is derived at
 * read time by comparing playedOn against [startsOn, endsOn], so adding or
 * editing a season never requires backfilling existing nights. endsOn null
 * means open-ended (the current season).
 */
export const seasons = mssqlTable('seasons', {
  id: int().primaryKey().identity(),
  name: nvarchar({ length: 100 }).notNull(),
  startsOn: date('starts_on', { mode: 'string' }).notNull(),
  endsOn: date('ends_on', { mode: 'string' }),
  createdAt: datetime2('created_at', { mode: 'date' })
    .notNull()
    .default(sql`SYSUTCDATETIME()`)
});

/**
 * Trail of admin/mutating actions worth being able to answer "who did that,
 * and when" about — member add/remove, an admin editing/deleting someone
 * else's night, deck merge/rename. actorLogin is a denormalized copy of the
 * GitHub login at the time of the action (not a users FK) so the log still
 * reads correctly after a rename or removal. detail is a short human-readable
 * summary string, not structured data — this is a log, not a data source, and
 * it deliberately never holds note contents or anything a member might
 * consider private.
 */
export const auditLog = mssqlTable('audit_log', {
  id: int().primaryKey().identity(),
  actorUserId: nvarchar('actor_user_id', { length: 200 }).notNull(),
  actorLogin: nvarchar('actor_login', { length: 100 }),
  action: nvarchar({ length: 50 }).notNull(),
  detail: nvarchar({ length: 500 }),
  createdAt: datetime2('created_at', { mode: 'date' })
    .notNull()
    .default(sql`SYSUTCDATETIME()`)
});

/**
 * Access policy / invite whitelist, managed by the admin from /admin. Invites
 * are created by GitHub login (the only handle known before someone first signs
 * in) and bound to the immutable userId on first login, so access survives a
 * GitHub rename. Kept separate from users so that removing an invite here
 * revokes access without touching the identity/ownership rows in users.
 */
export const allowedUsers = mssqlTable('allowed_users', {
  id: int().primaryKey().identity(),
  githubLogin: nvarchar('github_login', { length: 100 }).notNull().unique(),
  // Bound on the member's first login; matched by this immutable userId
  // thereafter so a later GitHub rename can't lock them out.
  userId: nvarchar('user_id', { length: 200 }),
  role: nvarchar({ length: 20 }).notNull().default('member'),
  addedBy: nvarchar('added_by', { length: 100 }),
  createdAt: datetime2('created_at', { mode: 'date' })
    .notNull()
    .default(sql`SYSUTCDATETIME()`)
});
