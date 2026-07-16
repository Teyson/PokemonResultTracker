import { and, eq, sql } from 'drizzle-orm';
import { getDb } from './client';
import { decks } from './schema';

type Db = Awaited<ReturnType<typeof getDb>>;

/** Case-insensitive upsert scoped to one owner, so different owners can share a deck name. */
export async function upsertOwnedDeck(db: Db, ownerId: number, name: string, type: string): Promise<number> {
  const existing = await db
    .select({ id: decks.id })
    .from(decks)
    .where(and(eq(decks.ownerId, ownerId), sql`LOWER(${decks.name}) = LOWER(${name})`));
  if (existing[0]) {
    await db.update(decks).set({ energyType: type }).where(eq(decks.id, existing[0].id));
    return existing[0].id;
  }
  const inserted = await db.insert(decks).output({ id: decks.id }).values({ name, energyType: type, ownerId });
  return inserted[0].id;
}

/**
 * Case-insensitive upsert across every deck regardless of owner, so opponent
 * decks behave like one shared/global list. Creates an unowned (ownerId: null)
 * deck when nothing matches.
 */
export async function upsertOpponentDeck(db: Db, name: string, type: string): Promise<number> {
  const existing = await db.select({ id: decks.id }).from(decks).where(sql`LOWER(${decks.name}) = LOWER(${name})`);
  if (existing[0]) {
    await db.update(decks).set({ energyType: type }).where(eq(decks.id, existing[0].id));
    return existing[0].id;
  }
  const inserted = await db.insert(decks).output({ id: decks.id }).values({ name, energyType: type });
  return inserted[0].id;
}
