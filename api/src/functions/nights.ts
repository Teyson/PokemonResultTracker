import { app, type HttpRequest, type InvocationContext, type HttpResponseInit } from '@azure/functions';
import { z } from 'zod';
import { eq, inArray, asc, desc } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mssql-core';
import { getDb } from '../db/client';
import { decks, matches, nights, users } from '../db/schema';
import { upsertDeck } from '../db/decks';
import { ensureUser } from '../db/userDirectory';
import { getUser, resolveRole } from '../auth';
import type { MatchResponse, NightResponse } from '../types';

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

const matchInputSchema = z.object({
  result: z.enum(['W', 'T', 'L']),
  // Optional: what the opponent was playing. opponentType defaults the same
  // way the top-level deck type does when a brand new opponent deck is named.
  opponentDeck: z.preprocess((v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined), z.string().optional()),
  opponentType: z.preprocess((v) => (typeof v === 'string' && v.trim() ? v.trim() : 'Colorless'), z.string()),
  // Optional: whether the player went first. Omitted when not recorded.
  wentFirst: z.boolean().optional()
});

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
  notes: z.preprocess((v) => (typeof v === 'string' && v.trim() ? v.trim() : null), z.string().nullable()),
  // Detailed mode: when present, replaces the night's per-match log and the
  // w/t/l totals are derived from it instead of the fields above. Absent
  // (quick mode) leaves any existing matches untouched.
  matches: z.array(matchInputSchema).max(50).optional()
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
// Either the top-level db handle or the transaction handle passed into a
// db.transaction() callback — writeMatches runs under both.
type DbOrTx = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

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

/** Totals derived from a detailed-mode match list, authoritative over the raw w/t/l fields. */
function deriveTotals(matchList: { result: 'W' | 'T' | 'L' }[]): { w: number; t: number; l: number } {
  let w = 0,
    t = 0,
    l = 0;
  for (const m of matchList) {
    if (m.result === 'W') w++;
    else if (m.result === 'T') t++;
    else l++;
  }
  return { w, t, l };
}

/** Replaces a night's match log in place (delete-then-insert), assigning sequential round numbers. */
async function writeMatches(
  db: DbOrTx,
  nightId: number,
  matchList: { result: 'W' | 'T' | 'L'; opponentDeckId?: number; wentFirst?: boolean }[]
): Promise<void> {
  await db.delete(matches).where(eq(matches.nightId, nightId));
  if (matchList.length === 0) return;
  await db.insert(matches).values(
    matchList.map((m, i) => ({
      nightId,
      roundNo: i + 1,
      result: m.result,
      opponentDeckId: m.opponentDeckId ?? null,
      wentFirst: m.wentFirst ?? null
    }))
  );
}

/**
 * Upserts the opponent deck named on each match (if any) and resolves it to an
 * id, ready for writeMatches. A small in-call cache avoids re-upserting the
 * same opponent deck once per match within a single night.
 */
async function resolveMatchOpponents(
  db: Db,
  matchList: { result: 'W' | 'T' | 'L'; opponentDeck?: string; opponentType: string; wentFirst?: boolean }[]
): Promise<{ result: 'W' | 'T' | 'L'; opponentDeckId?: number; wentFirst?: boolean }[]> {
  const cache = new Map<string, number>();
  const resolved: { result: 'W' | 'T' | 'L'; opponentDeckId?: number; wentFirst?: boolean }[] = [];
  for (const m of matchList) {
    if (!m.opponentDeck) {
      resolved.push({ result: m.result, wentFirst: m.wentFirst });
      continue;
    }
    const key = m.opponentDeck.toLowerCase();
    let id = cache.get(key);
    if (id === undefined) {
      id = await upsertDeck(db, m.opponentDeck, m.opponentType);
      cache.set(key, id);
    }
    resolved.push({ result: m.result, opponentDeckId: id, wentFirst: m.wentFirst });
  }
  return resolved;
}

const opponentDecks = alias(decks, 'opponent_decks');

/** Batch-fetches match logs for a set of nights, keyed by night id, ordered by round. */
async function fetchMatchesFor(db: Db, nightIds: number[]): Promise<Map<number, MatchResponse[]>> {
  const byNight = new Map<number, MatchResponse[]>();
  if (nightIds.length === 0) return byNight;
  const rows = await db
    .select({
      nightId: matches.nightId,
      roundNo: matches.roundNo,
      result: matches.result,
      opponentDeck: opponentDecks.name,
      opponentType: opponentDecks.energyType,
      wentFirst: matches.wentFirst
    })
    .from(matches)
    .leftJoin(opponentDecks, eq(opponentDecks.id, matches.opponentDeckId))
    .where(inArray(matches.nightId, nightIds))
    .orderBy(asc(matches.nightId), asc(matches.roundNo));
  for (const row of rows) {
    const list = byNight.get(row.nightId) ?? [];
    const m: MatchResponse = { roundNo: row.roundNo, result: row.result as 'W' | 'T' | 'L' };
    if (row.opponentDeck) {
      m.opponentDeck = row.opponentDeck;
      m.opponentType = row.opponentType ?? 'Colorless';
    }
    if (row.wentFirst !== null) m.wentFirst = row.wentFirst as boolean;
    list.push(m);
    byNight.set(row.nightId, list);
  }
  return byNight;
}

async function selectNight(db: Db, id: number): Promise<NightResponse | undefined> {
  const rows = await db
    .select(SELECT_COLUMNS)
    .from(nights)
    .innerJoin(decks, eq(decks.id, nights.deckId))
    .innerJoin(users, eq(users.id, nights.ownerId))
    .where(eq(nights.id, id));
  if (!rows[0]) return undefined;
  const night = toResponse(rows[0]);
  const matchList = (await fetchMatchesFor(db, [id])).get(id);
  if (matchList) night.matches = matchList;
  return night;
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
        const matchesByNight = await fetchMatchesFor(
          db,
          rows.map((r) => r.id)
        );
        return {
          jsonBody: rows.map((row) => {
            const night = toResponse(row);
            const matchList = matchesByNight.get(row.id);
            if (matchList) night.matches = matchList;
            return night;
          })
        };
      }

      if (request.method === 'DELETE') {
        if (!idParam) return { status: 400, jsonBody: { error: 'Missing night id.' } };
        const id = Number(idParam);
        const ownerUserId = await ownerUserIdOf(db, id);
        if (ownerUserId === undefined) return { status: 404, jsonBody: { error: 'Night not found.' } };
        if (!isAdmin && ownerUserId !== user.userId) {
          return { status: 403, jsonBody: { error: 'You can only delete your own nights.' } };
        }
        await db.transaction(async (tx) => {
          await tx.delete(matches).where(eq(matches.nightId, id));
          await tx.delete(nights).where(eq(nights.id, id));
        });
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
      // Detailed mode (matches present) derives w/t/l from the match log;
      // quick mode uses the raw fields and clears any prior match log so the
      // two can never drift apart.
      const totals = input.matches ? deriveTotals(input.matches) : { w: input.w, t: input.t, l: input.l };
      // Opponent decks are upserted up front (outside the transaction, same as
      // the player's own deck above) so writeMatches can insert plain ids.
      const resolvedMatches = input.matches ? await resolveMatchOpponents(db, input.matches) : undefined;

      if (request.method === 'POST') {
        const ownerId = await ensureUser(db, user.userId, user.userDetails);
        const newId = await db.transaction(async (tx) => {
          const inserted = await tx
            .insert(nights)
            .output({ id: nights.id })
            .values({
              playedOn: input.date,
              deckId,
              wins: totals.w,
              ties: totals.t,
              losses: totals.l,
              notes: input.notes,
              ownerId
            });
          const id = inserted[0].id;
          if (resolvedMatches) await writeMatches(tx, id, resolvedMatches);
          return id;
        });
        return { status: 201, jsonBody: await selectNight(db, newId) };
      }

      // PUT
      if (!idParam) return { status: 400, jsonBody: { error: 'Missing night id.' } };
      const id = Number(idParam);
      const ownerUserId = await ownerUserIdOf(db, id);
      if (ownerUserId === undefined) return { status: 404, jsonBody: { error: 'Night not found.' } };
      if (!isAdmin && ownerUserId !== user.userId) {
        return { status: 403, jsonBody: { error: 'You can only edit your own nights.' } };
      }
      await db.transaction(async (tx) => {
        await tx
          .update(nights)
          .set({ playedOn: input.date, deckId, wins: totals.w, ties: totals.t, losses: totals.l, notes: input.notes })
          .where(eq(nights.id, id));
        await writeMatches(tx, id, resolvedMatches ?? []);
      });
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
