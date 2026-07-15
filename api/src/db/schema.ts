import { int, nvarchar, date, datetime2, mssqlTable } from 'drizzle-orm/mssql-core';
import { sql } from 'drizzle-orm';

/**
 * Mirrors sql/schema.sql column-for-column. That file stays in the repo as a
 * fresh-install fallback; this schema (and the migrations generated from it)
 * is the source of truth going forward.
 */

export const decks = mssqlTable('decks', {
  id: int().primaryKey().identity(),
  name: nvarchar({ length: 100 }).notNull().unique(),
  energyType: nvarchar('energy_type', { length: 50 }),
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
  // Ownership identity: the immutable Static Web Apps userId of the creator.
  // Nullable only to cover legacy rows created before this column existed; new
  // rows always stamp it. See createdBy for the human-readable display name.
  createdByUserId: nvarchar('created_by_user_id', { length: 200 }),
  // Display only: the GitHub login at creation time. Mutable (users can rename),
  // so it's never used for authorization — createdByUserId is the source of truth.
  createdBy: nvarchar('created_by', { length: 100 }).notNull(),
  createdAt: datetime2('created_at', { mode: 'date' })
    .notNull()
    .default(sql`SYSUTCDATETIME()`)
});

export const allowedUsers = mssqlTable('allowed_users', {
  id: int().primaryKey().identity(),
  // Invites are created by GitHub login (the only identifier a human knows
  // before the invitee ever signs in). Kept for display and for matching a
  // not-yet-bound invite on first login.
  githubLogin: nvarchar('github_login', { length: 100 }).notNull().unique(),
  // Bound on the member's first login (GetRoles stamps it). Once present, the
  // member is matched by this immutable userId, so a later GitHub rename can't
  // lock them out or let someone else claim their freed-up login.
  userId: nvarchar('user_id', { length: 200 }),
  role: nvarchar({ length: 20 }).notNull().default('member'),
  addedBy: nvarchar('added_by', { length: 100 }),
  createdAt: datetime2('created_at', { mode: 'date' })
    .notNull()
    .default(sql`SYSUTCDATETIME()`)
});
