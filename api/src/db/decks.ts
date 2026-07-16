import { eq, sql } from 'drizzle-orm';
import { getDb } from './client';
import { decks } from './schema';

type Db = Awaited<ReturnType<typeof getDb>>;

/** Case-insensitive upsert-by-name, mirroring the original MERGE statement. */
export async function upsertDeck(db: Db, name: string, type: string): Promise<number> {
  const existing = await db.select({ id: decks.id }).from(decks).where(sql`LOWER(${decks.name}) = LOWER(${name})`);
  if (existing[0]) {
    await db.update(decks).set({ energyType: type }).where(eq(decks.id, existing[0].id));
    return existing[0].id;
  }
  const inserted = await db.insert(decks).output({ id: decks.id }).values({ name, energyType: type });
  return inserted[0].id;
}
