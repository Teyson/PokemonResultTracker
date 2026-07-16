import { app, type HttpRequest, type InvocationContext, type HttpResponseInit } from '@azure/functions';
import { and, eq, isNull, isNotNull, ne, count, max, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../db/client';
import { decks, matches, nights, users } from '../db/schema';
import { ensureUser } from '../db/userDirectory';
import { getUser, resolveRole } from '../auth';
import type { DeckSummaryResponse } from '../types';

/**
 * /api/decks — the global decklist.
 *
 *   GET    /api/decks              -> DeckSummaryResponse[] (member; admins additionally get
 *                                      nightsCount/opponentCount, league-wide usage totals)
 *   PUT    /api/decks/{id}         -> admin: rename/retype a deck (body: { name, type })
 *   POST   /api/decks/{id}/merge   -> admin: fold a deck into another (body: { targetId }) —
 *                                      repoints every night and match that references it, then
 *                                      deletes the source deck, in one transaction
 *   DELETE /api/decks/{id}         -> admin: delete a deck, only if no night or match references it
 *
 * GET is available to every member — it's how the opponent-deck picker (DeckPicker.svelte)
 * browses/searches the registry. The mutating routes are admin-only: the registry only ever
 * grows via upsert-by-name, so one typo ("Gardvoir") creates a permanent phantom deck that
 * splits stats forever. Merge is the fix for that; rename/delete round it out.
 */

const renameSchema = z.object({
  name: z.string().trim().min(1, 'A deck name is required.').max(100, 'Deck name is too long.'),
  type: z.preprocess((v) => (typeof v === 'string' && v.trim() ? v.trim() : 'Colorless'), z.string())
});

const mergeSchema = z.object({
  targetId: z.coerce.number().int().positive()
});

type Db = Awaited<ReturnType<typeof getDb>>;

async function fetchDeckRow(db: Db, id: number): Promise<{ id: number; name: string; ownerId: number | null } | undefined> {
  const rows = await db.select({ id: decks.id, name: decks.name, ownerId: decks.ownerId }).from(decks).where(eq(decks.id, id));
  return rows[0];
}

/** Case-insensitive collision check, scoped the same way the unique constraint is: per owner (or among unowned decks). */
async function nameCollision(db: Db, ownerId: number | null, name: string, excludeId: number): Promise<boolean> {
  const scope = ownerId === null ? isNull(decks.ownerId) : eq(decks.ownerId, ownerId);
  const rows = await db
    .select({ id: decks.id })
    .from(decks)
    .where(and(scope, sql`LOWER(${decks.name}) = LOWER(${name})`, ne(decks.id, excludeId)));
  return rows.length > 0;
}

app.http('decks', {
  methods: ['GET', 'PUT', 'POST', 'DELETE'],
  authLevel: 'anonymous',
  route: 'decks/{id?}/{action?}',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const idParam = request.params.id;
    const actionParam = request.params.action;
    try {
      // The only defined action route is POST /api/decks/{id}/merge.
      if (actionParam && !(request.method === 'POST' && actionParam === 'merge')) {
        return { status: 400, jsonBody: { error: 'Unknown action.' } };
      }
      const user = getUser(request);
      if (!user) return { status: 401, jsonBody: { error: 'Unauthorized.' } };

      const db = await getDb();
      const { isAdmin, isMember } = await resolveRole(db, user.userId, user.userDetails, context);
      if (!isMember) return { status: 403, jsonBody: { error: 'You do not have access to this app.' } };

      if (request.method === 'GET') {
        const ownerId = await ensureUser(db, user.userId, user.userDetails);

        const oppStats = db
          .select({
            deckId: matches.opponentDeckId,
            cnt: count(matches.id).as('cnt'),
            lastPlayed: max(nights.playedOn).as('lastPlayed')
          })
          .from(matches)
          .innerJoin(nights, eq(nights.id, matches.nightId))
          .where(and(eq(nights.ownerId, ownerId), isNull(nights.deletedAt)))
          .groupBy(matches.opponentDeckId)
          .as('oppStats');

        const rows = await db
          .select({
            id: decks.id,
            name: decks.name,
            type: decks.energyType,
            ownerLogin: users.githubLogin,
            timesPlayedAgainst: oppStats.cnt,
            lastPlayedAgainst: oppStats.lastPlayed
          })
          .from(decks)
          .leftJoin(users, eq(users.id, decks.ownerId))
          .leftJoin(oppStats, eq(oppStats.deckId, decks.id))
          .orderBy(decks.name);

        // League-wide usage, for the admin deck-management page's merge/delete
        // decisions — deliberately unscoped (unlike timesPlayedAgainst above,
        // which is scoped to the caller). Only computed for admins.
        let nightsUsage = new Map<number, number>();
        let opponentUsage = new Map<number, number>();
        if (isAdmin) {
          const nightsRows = await db
            .select({ deckId: nights.deckId, cnt: count(nights.id).as('cnt') })
            .from(nights)
            .groupBy(nights.deckId);
          nightsUsage = new Map(nightsRows.map((r) => [r.deckId, r.cnt]));
          const oppRows = await db
            .select({ deckId: matches.opponentDeckId, cnt: count(matches.id).as('cnt') })
            .from(matches)
            .where(isNotNull(matches.opponentDeckId))
            .groupBy(matches.opponentDeckId);
          opponentUsage = new Map(oppRows.map((r) => [r.deckId as number, r.cnt]));
        }

        const jsonBody: DeckSummaryResponse[] = rows.map((r) => ({
          id: String(r.id),
          name: r.name,
          type: r.type ?? 'Colorless',
          ownerLogin: r.ownerLogin,
          timesPlayedAgainst: r.timesPlayedAgainst ?? 0,
          lastPlayedAgainst: r.lastPlayedAgainst,
          ...(isAdmin ? { nightsCount: nightsUsage.get(r.id) ?? 0, opponentCount: opponentUsage.get(r.id) ?? 0 } : {})
        }));
        return { jsonBody };
      }

      // Every remaining route (PUT, POST merge, DELETE) is an admin mutation on one deck id.
      if (!isAdmin) return { status: 403, jsonBody: { error: 'Admins only.' } };
      if (!idParam) return { status: 400, jsonBody: { error: 'Missing deck id.' } };
      const id = Number(idParam);

      if (request.method === 'PUT') {
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return { status: 400, jsonBody: { error: 'Invalid JSON body.' } };
        }
        const parsed = renameSchema.safeParse(raw);
        if (!parsed.success) {
          return { status: 400, jsonBody: { error: parsed.error.issues[0]?.message ?? 'Invalid request body.' } };
        }
        const existing = await fetchDeckRow(db, id);
        if (!existing) return { status: 404, jsonBody: { error: 'Deck not found.' } };
        if (await nameCollision(db, existing.ownerId, parsed.data.name, id)) {
          return {
            status: 409,
            jsonBody: {
              error:
                existing.ownerId === null
                  ? `An unowned deck named "${parsed.data.name}" already exists.`
                  : `That player already has a deck named "${parsed.data.name}".`
            }
          };
        }
        await db.update(decks).set({ name: parsed.data.name, energyType: parsed.data.type }).where(eq(decks.id, id));
        const rows = await db
          .select({ id: decks.id, name: decks.name, type: decks.energyType, ownerLogin: users.githubLogin })
          .from(decks)
          .leftJoin(users, eq(users.id, decks.ownerId))
          .where(eq(decks.id, id));
        const r = rows[0];
        return { jsonBody: { id: String(r.id), name: r.name, type: r.type ?? 'Colorless', ownerLogin: r.ownerLogin } };
      }

      if (actionParam === 'merge') {
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return { status: 400, jsonBody: { error: 'Invalid JSON body.' } };
        }
        const parsed = mergeSchema.safeParse(raw);
        if (!parsed.success) {
          return { status: 400, jsonBody: { error: parsed.error.issues[0]?.message ?? 'Invalid request body.' } };
        }
        const targetId = parsed.data.targetId;
        if (targetId === id) return { status: 400, jsonBody: { error: 'Pick a different deck to merge into.' } };
        const source = await fetchDeckRow(db, id);
        const target = await fetchDeckRow(db, targetId);
        if (!source) return { status: 404, jsonBody: { error: 'Deck not found.' } };
        if (!target) return { status: 404, jsonBody: { error: 'Target deck not found.' } };
        if (source.ownerId !== null && target.ownerId !== null && source.ownerId !== target.ownerId) {
          return {
            status: 400,
            jsonBody: { error: 'Can only merge into an unowned deck or a deck owned by the same player.' }
          };
        }
        await db.transaction(async (tx) => {
          await tx.update(nights).set({ deckId: targetId }).where(eq(nights.deckId, id));
          await tx.update(matches).set({ opponentDeckId: targetId }).where(eq(matches.opponentDeckId, id));
          await tx.delete(decks).where(eq(decks.id, id));
        });
        return { status: 204 };
      }

      // DELETE
      const existing = await fetchDeckRow(db, id);
      if (!existing) return { status: 404, jsonBody: { error: 'Deck not found.' } };
      const nightsRef = await db.select({ id: nights.id }).from(nights).where(eq(nights.deckId, id));
      if (nightsRef.length) return { status: 409, jsonBody: { error: 'This deck is still logged on one or more nights.' } };
      const matchRef = await db.select({ id: matches.id }).from(matches).where(eq(matches.opponentDeckId, id));
      if (matchRef.length) {
        return { status: 409, jsonBody: { error: 'This deck is still recorded as an opponent in one or more matches.' } };
      }
      await db.delete(decks).where(eq(decks.id, id));
      return { status: 204 };
    } catch (err) {
      context.error('decks handler failed', err);
      return {
        status: 500,
        jsonBody: {
          error: 'Database error. If the app was idle, the database may be waking up — try again in a few seconds.'
        }
      };
    }
  }
});
