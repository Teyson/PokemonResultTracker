import { int, nvarchar, date, datetime2, mssqlTable } from 'drizzle-orm/mssql-core';
import { sql } from 'drizzle-orm';

/**
 * Drizzle schema — the source of truth for the database. Migrations under
 * ./drizzle are generated from this file; sql/schema.sql is only a fresh-install
 * fallback reference.
 */

export const decks = mssqlTable('decks', {
  id: int().primaryKey().identity(),
  name: nvarchar({ length: 100 }).notNull().unique(),
  energyType: nvarchar('energy_type', { length: 50 }),
  createdAt: datetime2('created_at', { mode: 'date' })
    .notNull()
    .default(sql`SYSUTCDATETIME()`)
});

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
  // Owner: a foreign key into users. The display name comes from the joined
  // users row, so it always reflects the owner's current GitHub login.
  ownerId: int('owner_id')
    .notNull()
    .references(() => users.id),
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
