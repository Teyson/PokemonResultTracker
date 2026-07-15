import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { getDb } from './client';
import { decks, nights } from './schema';

/**
 * Optional: recreates the single seed night carried over from the old tracker
 * (sql/schema.sql had the same block). Skip this — or just don't run
 * `npm run seed` — if you'd rather start with an empty database.
 */
async function seed() {
  const db = await getDb();

  let [deck] = await db.select().from(decks).where(eq(decks.name, 'Alakazam'));
  if (!deck) {
    const inserted = await db.insert(decks).output({ id: decks.id }).values({ name: 'Alakazam', energyType: 'Psychic' });
    [deck] = await db.select().from(decks).where(eq(decks.id, inserted[0].id));
  }

  const existingNight = await db.select({ id: nights.id }).from(nights).where(eq(nights.deckId, deck.id));
  if (existingNight.length === 0) {
    await db.insert(nights).values({ playedOn: '2026-07-07', deckId: deck.id, wins: 0, ties: 2, losses: 2 });
  }

  console.log('Seed complete.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
