import { app, type HttpRequest, type InvocationContext, type HttpResponseInit } from '@azure/functions';
import { z } from 'zod';
import { eq, sql, desc } from 'drizzle-orm';
import { getDb } from '../db/client';
import { decks, nights } from '../db/schema';
import type { NightResponse } from '../types';

/**
 * /api/nights — the league night log. Requires the "member" role (enforced by
 * allowedRoles in staticwebapp.config.json).
 *
 *   GET    /api/nights        -> NightResponse[]
 *   POST   /api/nights        -> create   (body: { date, deck, type, w, t, l })
 *   PUT    /api/nights/{id}   -> update
 *   DELETE /api/nights/{id}   -> delete
 *
 * Decks are normalized into their own table; the client just sends a deck name
 * plus type and we upsert the deck transparently, same as before.
 */

const nonNegativeInt = z.preprocess((v) => {
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}, z.number().int().min(0));

const nightInputSchema = z.object({
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'A valid date (YYYY-MM-DD) is required.'),
  deck: z.string().trim().min(1, 'A deck name is required.'),
  type: z.preprocess((v) => (typeof v === 'string' && v.trim() ? v.trim() : 'Colorless'), z.string()),
  w: nonNegativeInt,
  t: nonNegativeInt,
  l: nonNegativeInt,
  notes: z.preprocess((v) => (typeof v === 'string' && v.trim() ? v.trim() : null), z.string().nullable())
});

const SELECT_COLUMNS = {
  id: nights.id,
  date: nights.playedOn,
  deck: decks.name,
  type: decks.energyType,
  w: nights.wins,
  t: nights.ties,
  l: nights.losses,
  notes: nights.notes
};

type Db = Awaited<ReturnType<typeof getDb>>;

function toResponse(row: {
  id: number;
  date: string;
  deck: string;
  type: string | null;
  w: number;
  t: number;
  l: number;
  notes: string | null;
}): NightResponse {
  return { ...row, id: String(row.id), type: row.type ?? 'Colorless' };
}

async function selectNight(db: Db, id: number): Promise<NightResponse | undefined> {
  const rows = await db.select(SELECT_COLUMNS).from(nights).innerJoin(decks, eq(decks.id, nights.deckId)).where(eq(nights.id, id));
  return rows[0] ? toResponse(rows[0]) : undefined;
}

/** Case-insensitive upsert-by-name, mirroring the original MERGE statement. */
async function upsertDeck(db: Db, name: string, type: string): Promise<number> {
  const existing = await db.select({ id: decks.id }).from(decks).where(sql`LOWER(${decks.name}) = LOWER(${name})`);
  if (existing[0]) {
    await db.update(decks).set({ energyType: type }).where(eq(decks.id, existing[0].id));
    return existing[0].id;
  }
  const inserted = await db.insert(decks).output({ id: decks.id }).values({ name, energyType: type });
  return inserted[0].id;
}

app.http('nights', {
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  authLevel: 'anonymous',
  route: 'nights/{id?}',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const idParam = request.params.id;
    try {
      const db = await getDb();

      if (request.method === 'GET') {
        const rows = await db
          .select(SELECT_COLUMNS)
          .from(nights)
          .innerJoin(decks, eq(decks.id, nights.deckId))
          .orderBy(desc(nights.playedOn), desc(nights.id));
        return { jsonBody: rows.map(toResponse) };
      }

      if (request.method === 'DELETE') {
        if (!idParam) return { status: 400, jsonBody: { error: 'Missing night id.' } };
        const id = Number(idParam);
        const existing = await db.select({ id: nights.id }).from(nights).where(eq(nights.id, id));
        if (existing.length === 0) return { status: 404, jsonBody: { error: 'Night not found.' } };
        await db.delete(nights).where(eq(nights.id, id));
        return { status: 204 };
      }

      let raw: unknown;
      try {
        raw = await request.json();
      } catch {
        return { status: 400, jsonBody: { error: 'Invalid JSON body.' } };
      }
      const parsed = nightInputSchema.safeParse(raw);
      if (!parsed.success) {
        return { status: 400, jsonBody: { error: parsed.error.issues[0]?.message ?? 'Invalid request body.' } };
      }
      const input = parsed.data;
      const deckId = await upsertDeck(db, input.deck, input.type);

      if (request.method === 'POST') {
        const inserted = await db
          .insert(nights)
          .output({ id: nights.id })
          .values({ playedOn: input.date, deckId, wins: input.w, ties: input.t, losses: input.l, notes: input.notes });
        return { status: 201, jsonBody: await selectNight(db, inserted[0].id) };
      }

      // PUT
      if (!idParam) return { status: 400, jsonBody: { error: 'Missing night id.' } };
      const id = Number(idParam);
      const existing = await db.select({ id: nights.id }).from(nights).where(eq(nights.id, id));
      if (existing.length === 0) return { status: 404, jsonBody: { error: 'Night not found.' } };
      await db
        .update(nights)
        .set({ playedOn: input.date, deckId, wins: input.w, ties: input.t, losses: input.l, notes: input.notes })
        .where(eq(nights.id, id));
      return { jsonBody: await selectNight(db, id) };
    } catch (err) {
      context.error('nights handler failed', err);
      return {
        status: 500,
        jsonBody: {
          error: 'Database error. If the app was idle, the database may be waking up — try again in a few seconds.'
        }
      };
    }
  }
});
