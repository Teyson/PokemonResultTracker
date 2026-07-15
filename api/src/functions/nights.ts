import { app, type HttpRequest, type InvocationContext, type HttpResponseInit } from '@azure/functions';
import { z } from 'zod';
import { eq, sql, desc } from 'drizzle-orm';
import { getDb } from '../db/client';
import { decks, nights, users } from '../db/schema';
import { ensureUser } from '../db/userDirectory';
import { getUser, resolveRole } from '../auth';
import type { NightResponse } from '../types';

/**
 * /api/nights — the league night log. Requires the "member" role. Free tier
 * can't gate this at the platform level (allowedRoles only sees "authenticated"
 * here), so this handler resolves the real role itself via resolveRole().
 *
 *   GET    /api/nights?scope=all   -> NightResponse[] (own nights, or everyone's for admins passing scope=all)
 *   POST   /api/nights             -> create   (body: { date, deck, type, w, t, l })
 *   PUT    /api/nights/{id}        -> update   (own nights only, unless admin)
 *   DELETE /api/nights/{id}        -> delete   (own nights only, unless admin)
 *
 * Each night is owned via owner_id, a foreign key into the users table. Identity
 * is the immutable Static Web Apps userId behind that row, so a creator renaming
 * their GitHub account keeps access to their nights and the displayed owner name
 * updates automatically (it's read from the joined users row, not copied in).
 * Members only see and manage their own nights; admins can pass ?scope=all to
 * view everyone's, and can edit/delete any night.
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
  notes: nights.notes,
  // Owner display name comes from the joined users row, so it always reflects
  // the owner's current GitHub login.
  createdBy: users.githubLogin
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
  createdBy: string;
}): NightResponse {
  return { ...row, id: String(row.id), type: row.type ?? 'Colorless' };
}

async function selectNight(db: Db, id: number): Promise<NightResponse | undefined> {
  const rows = await db
    .select(SELECT_COLUMNS)
    .from(nights)
    .innerJoin(decks, eq(decks.id, nights.deckId))
    .innerJoin(users, eq(users.id, nights.ownerId))
    .where(eq(nights.id, id));
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

/** Look up a night's owner userId (via the users FK), for the ownership check. */
async function ownerUserIdOf(db: Db, id: number): Promise<string | undefined> {
  const rows = await db
    .select({ ownerUserId: users.userId })
    .from(nights)
    .innerJoin(users, eq(users.id, nights.ownerId))
    .where(eq(nights.id, id));
  return rows[0]?.ownerUserId;
}

app.http('nights', {
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  authLevel: 'anonymous',
  route: 'nights/{id?}',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const idParam = request.params.id;
    try {
      const user = getUser(request);
      if (!user) return { status: 401, jsonBody: { error: 'Unauthorized.' } };

      const db = await getDb();
      const { isAdmin, isMember } = await resolveRole(db, user.userId, user.userDetails, context);
      if (!isMember) return { status: 403, jsonBody: { error: 'You do not have access to this app.' } };

      if (request.method === 'GET') {
        const wantsAll = isAdmin && new URL(request.url).searchParams.get('scope') === 'all';
        const rows = await db
          .select(SELECT_COLUMNS)
          .from(nights)
          .innerJoin(decks, eq(decks.id, nights.deckId))
          .innerJoin(users, eq(users.id, nights.ownerId))
          .where(wantsAll ? undefined : eq(users.userId, user.userId))
          .orderBy(desc(nights.playedOn), desc(nights.id));
        return { jsonBody: rows.map(toResponse) };
      }

      if (request.method === 'DELETE') {
        if (!idParam) return { status: 400, jsonBody: { error: 'Missing night id.' } };
        const id = Number(idParam);
        const ownerUserId = await ownerUserIdOf(db, id);
        if (ownerUserId === undefined) return { status: 404, jsonBody: { error: 'Night not found.' } };
        if (!isAdmin && ownerUserId !== user.userId) {
          return { status: 403, jsonBody: { error: 'You can only delete your own nights.' } };
        }
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
        const ownerId = await ensureUser(db, user.userId, user.userDetails);
        const inserted = await db
          .insert(nights)
          .output({ id: nights.id })
          .values({
            playedOn: input.date,
            deckId,
            wins: input.w,
            ties: input.t,
            losses: input.l,
            notes: input.notes,
            ownerId
          });
        return { status: 201, jsonBody: await selectNight(db, inserted[0].id) };
      }

      // PUT
      if (!idParam) return { status: 400, jsonBody: { error: 'Missing night id.' } };
      const id = Number(idParam);
      const ownerUserId = await ownerUserIdOf(db, id);
      if (ownerUserId === undefined) return { status: 404, jsonBody: { error: 'Night not found.' } };
      if (!isAdmin && ownerUserId !== user.userId) {
        return { status: 403, jsonBody: { error: 'You can only edit your own nights.' } };
      }
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
