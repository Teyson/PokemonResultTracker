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
  createdBy: nvarchar('created_by', { length: 100 }).notNull(),
  createdAt: datetime2('created_at', { mode: 'date' })
    .notNull()
    .default(sql`SYSUTCDATETIME()`)
});

export const allowedUsers = mssqlTable('allowed_users', {
  id: int().primaryKey().identity(),
  githubLogin: nvarchar('github_login', { length: 100 }).notNull().unique(),
  role: nvarchar({ length: 20 }).notNull().default('member'),
  addedBy: nvarchar('added_by', { length: 100 }),
  createdAt: datetime2('created_at', { mode: 'date' })
    .notNull()
    .default(sql`SYSUTCDATETIME()`)
});
