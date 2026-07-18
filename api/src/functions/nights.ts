import { app, type HttpRequest, type InvocationContext, type HttpResponseInit } from '@azure/functions';
import { z } from 'zod';
import { and, eq, inArray, isNull, isNotNull, asc, desc } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mssql-core';
import { getDb } from '../db/client';
import { decks, matches, nights, users } from '../db/schema';
import { upsertOwnedDeck, upsertOpponentDeck } from '../db/decks';
import { ensureUser } from '../db/userDirectory';
import { logAudit } from '../db/auditLog';
import { getUser, resolveRole } from '../auth';
import type { MatchResponse, NightResponse } from '../types';

/**
 * /api/nights — the league night log. Requires the "member" role. Free tier
 * can't gate this at the platform level (allowedRoles only sees "authenticated"
 * here), so this handler resolves the real role itself via resolveRole().
 *
 *   GET    /api/nights?scope=all       -> NightResponse[] (own nights, or everyone's for admins passing scope=all)
 *   GET    /api/nights?scope=deleted   -> NightResponse[] (admin only: recently soft-deleted nights, newest first)
 *   POST   /api/nights                 -> create   (body: { date, deck, type, w, t, l })
 *   PUT    /api/nights/{id}            -> update   (own nights only, unless admin)
 *   DELETE /api/nights/{id}            -> soft-delete (own nights only, unless admin)
 *   POST   /api/nights/{id}/restore    -> undo a soft-delete (own nights only, unless admin)
 *
 * Deleting a night sets deleted_at instead of removing the row (and leaves its
 * matches untouched), so a delete can be undone via restore. Every read path
 * filters deleted_at IS NULL except the scope=deleted admin view.
 *
 * Each night is owned via owner_id, a foreign key into the users table. Identity
 * is the immutable Static Web Apps userId behind that row, so a creator renaming
 * their GitHub account keeps access to their nights and the displayed owner name
 * updates automatically (it's read from the joined users row, not copied in).
 * Members only see and manage their own nights; admins can pass ?scope=all to
 * view everyone's, and can edit/delete any night.
 *
 * Decks are normalized into their own table and owned per-player: the client
 * just sends a deck name plus type, and the player's own deck is upserted
 * scoped to their ownerId (so two players can each have a same-named deck).
 * Opponent decks upsert across every deck regardless of owner, so they behave
 * like one shared/global list.
 */

const nonNegativeInt = z.preprocess((v) => {
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}, z.number().int().min(0));

const matchInputSchema = z.object({
  result: z.enum(['W', 'T', 'L']),
  // Set when the opponent's deck was picked from the /api/decks list rather
  // than typed fresh — takes priority over opponentDeck below, since a name
  // alone is ambiguous once two owners can share a deck name.
  opponentDeckId: z.coerce.number().int().positive().optional(),
  // Optional: what the opponent was playing. opponentType defaults the same
  // way the top-level deck type does when a brand new opponent deck is named.
  opponentDeck: z.preprocess((v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined), z.string().optional()),
  opponentType: z.preprocess((v) => (typeof v === 'string' && v.trim() ? v.trim() : 'Colorless'), z.string()),
  // Optional: whether the player went first. Omitted when not recorded.
  wentFirst: z.boolean().optional()
});

// UTC-based (matches the ISO date strings played_on stores and the frontend's
// own todayISO() in src/lib/pokemon.ts) so the cutoff lands on the same day
// regardless of the server's local timezone.
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const nightInputSchema = z
  .object({
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
    isLeagueNight: z.boolean().optional().default(true),
    // Detailed mode: when present, replaces the night's per-match log and the
    // w/t/l totals are derived from it instead of the fields above. Absent
    // (quick mode) leaves any existing matches untouched.
    matches: z.array(matchInputSchema).max(50).optional()
  })
  .refine((v) => v.date <= todayISO(), { message: 'Nights cannot be logged for a future date.', path: ['date'] });

const SELECT_COLUMNS = {
  id: nights.id,
  date: nights.playedOn,
  deck: decks.name,
  type: decks.energyType,
  w: nights.wins,
  t: nights.ties,
  l: nights.losses,
  notes: nights.notes,
  isLeagueNight: nights.isLeagueNight,
  // Owner display name comes from the joined users row, so it always reflects
  // the owner's current GitHub login.
  createdBy: users.githubLogin
};

// Only selected for the admin scope=deleted view — deletedAt is never exposed
// on the normal (active) night responses.
const DELETED_SELECT_COLUMNS = { ...SELECT_COLUMNS, deletedAt: nights.deletedAt };

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
  isLeagueNight: boolean;
  createdBy: string;
  deletedAt?: Date | null;
}): NightResponse {
  const { deletedAt, ...rest } = row;
  return {
    ...rest,
    id: String(row.id),
    type: row.type ?? 'Colorless',
    ...(deletedAt ? { deletedAt: deletedAt.toISOString() } : {})
  };
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
 * Resolves each match's opponent to a deck id, ready for writeMatches. When
 * the client already picked a specific deck (opponentDeckId, from the
 * /api/decks list) that id is used as-is; otherwise the typed-in name is
 * upserted as before. A small in-call cache avoids re-upserting the same
 * freshly-typed opponent deck once per match within a single night.
 */
async function resolveMatchOpponents(
  db: Db,
  matchList: { result: 'W' | 'T' | 'L'; opponentDeckId?: number; opponentDeck?: string; opponentType: string; wentFirst?: boolean }[]
): Promise<{ result: 'W' | 'T' | 'L'; opponentDeckId?: number; wentFirst?: boolean }[]> {
  const cache = new Map<string, number>();
  const resolved: { result: 'W' | 'T' | 'L'; opponentDeckId?: number; wentFirst?: boolean }[] = [];
  for (const m of matchList) {
    if (m.opponentDeckId) {
      resolved.push({ result: m.result, opponentDeckId: m.opponentDeckId, wentFirst: m.wentFirst });
      continue;
    }
    if (!m.opponentDeck) {
      resolved.push({ result: m.result, wentFirst: m.wentFirst });
      continue;
    }
    const key = m.opponentDeck.toLowerCase();
    let id = cache.get(key);
    if (id === undefined) {
      id = await upsertOpponentDeck(db, m.opponentDeck, m.opponentType);
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
      opponentDeckId: matches.opponentDeckId,
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
      m.opponentDeckId = String(row.opponentDeckId);
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

/**
 * Look up a night's owner (userId + login, via the users FK), deck name, date
 * and delete-state — for ownership/visibility checks and, when an admin acts
 * on someone else's night, the audit log detail string.
 */
async function nightOwnerState(
  db: Db,
  id: number
): Promise<{ ownerUserId: string; ownerLogin: string; deck: string; date: string; deletedAt: Date | null } | undefined> {
  const rows = await db
    .select({ ownerUserId: users.userId, ownerLogin: users.githubLogin, deck: decks.name, date: nights.playedOn, deletedAt: nights.deletedAt })
    .from(nights)
    .innerJoin(users, eq(users.id, nights.ownerId))
    .innerJoin(decks, eq(decks.id, nights.deckId))
    .where(eq(nights.id, id));
  return rows[0];
}

app.http('nights', {
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  authLevel: 'anonymous',
  route: 'nights/{id?}/{action?}',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const idParam = request.params.id;
    const actionParam = request.params.action;
    try {
      // The only defined action route is POST /api/nights/{id}/restore.
      if (actionParam && !(request.method === 'POST' && actionParam === 'restore')) {
        return { status: 400, jsonBody: { error: 'Unknown action.' } };
      }
      const user = getUser(request);
      if (!user) return { status: 401, jsonBody: { error: 'Unauthorized.' } };

      const db = await getDb();
      const { isAdmin, isMember } = await resolveRole(db, user.userId, user.userDetails, context);
      if (!isMember) return { status: 403, jsonBody: { error: 'You do not have access to this app.' } };

      if (request.method === 'GET') {
        const scope = new URL(request.url).searchParams.get('scope');

        if (scope === 'deleted') {
          if (!isAdmin) return { status: 403, jsonBody: { error: 'Admin only.' } };
          const rows = await db
            .select(DELETED_SELECT_COLUMNS)
            .from(nights)
            .innerJoin(decks, eq(decks.id, nights.deckId))
            .innerJoin(users, eq(users.id, nights.ownerId))
            .where(isNotNull(nights.deletedAt))
            .orderBy(desc(nights.deletedAt));
          return { jsonBody: rows.map((row) => toResponse(row)) };
        }

        const wantsAll = isAdmin && scope === 'all';
        const rows = await db
          .select(SELECT_COLUMNS)
          .from(nights)
          .innerJoin(decks, eq(decks.id, nights.deckId))
          .innerJoin(users, eq(users.id, nights.ownerId))
          .where(wantsAll ? isNull(nights.deletedAt) : and(eq(users.userId, user.userId), isNull(nights.deletedAt)))
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
        const state = await nightOwnerState(db, id);
        if (!state || state.deletedAt) return { status: 404, jsonBody: { error: 'Night not found.' } };
        if (!isAdmin && state.ownerUserId !== user.userId) {
          return { status: 403, jsonBody: { error: 'You can only delete your own nights.' } };
        }
        await db.update(nights).set({ deletedAt: new Date() }).where(eq(nights.id, id));
        if (isAdmin && state.ownerUserId !== user.userId) {
          await logAudit(db, user, 'night.delete.admin', `Deleted ${state.ownerLogin}'s ${state.deck} night from ${state.date}`, context);
        }
        return { status: 204 };
      }

      if (actionParam === 'restore') {
        if (!idParam) return { status: 400, jsonBody: { error: 'Missing night id.' } };
        const id = Number(idParam);
        const state = await nightOwnerState(db, id);
        if (!state || !state.deletedAt) return { status: 404, jsonBody: { error: 'Night not found.' } };
        if (!isAdmin && state.ownerUserId !== user.userId) {
          return { status: 403, jsonBody: { error: 'You can only restore your own nights.' } };
        }
        await db.update(nights).set({ deletedAt: null }).where(eq(nights.id, id));
        return { jsonBody: await selectNight(db, id) };
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
      // Resolved up front (not just in the POST branch) since the player's own
      // deck is now looked up/created scoped to their ownerId on PUT too.
      const ownerId = await ensureUser(db, user.userId, user.userDetails);
      const deckId = await upsertOwnedDeck(db, ownerId, input.deck, input.type);
      // Detailed mode (matches present) derives w/t/l from the match log;
      // quick mode uses the raw fields and clears any prior match log so the
      // two can never drift apart.
      const totals = input.matches ? deriveTotals(input.matches) : { w: input.w, t: input.t, l: input.l };
      // Opponent decks are upserted up front (outside the transaction, same as
      // the player's own deck above) so writeMatches can insert plain ids.
      const resolvedMatches = input.matches ? await resolveMatchOpponents(db, input.matches) : undefined;

      if (request.method === 'POST') {
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
              isLeagueNight: input.isLeagueNight,
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
      const state = await nightOwnerState(db, id);
      if (!state || state.deletedAt) return { status: 404, jsonBody: { error: 'Night not found.' } };
      if (!isAdmin && state.ownerUserId !== user.userId) {
        return { status: 403, jsonBody: { error: 'You can only edit your own nights.' } };
      }
      await db.transaction(async (tx) => {
        await tx
          .update(nights)
          .set({
            playedOn: input.date,
            deckId,
            wins: totals.w,
            ties: totals.t,
            losses: totals.l,
            notes: input.notes,
            isLeagueNight: input.isLeagueNight
          })
          .where(eq(nights.id, id));
        await writeMatches(tx, id, resolvedMatches ?? []);
      });
      if (isAdmin && state.ownerUserId !== user.userId) {
        await logAudit(db, user, 'night.edit.admin', `Edited ${state.ownerLogin}'s ${state.deck} night from ${state.date}`, context);
      }
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
