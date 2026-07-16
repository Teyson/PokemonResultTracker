import { app, type HttpRequest, type InvocationContext, type HttpResponseInit } from '@azure/functions';
import { eq, count, max } from 'drizzle-orm';
import { getDb } from '../db/client';
import { decks, matches, nights, users } from '../db/schema';
import { ensureUser } from '../db/userDirectory';
import { getUser, resolveRole } from '../auth';
import type { DeckSummaryResponse } from '../types';

/**
 * /api/decks — the global decklist, for browsing/searching every deck (any
 * owner, or unowned) as an opponent pick. timesPlayedAgainst/lastPlayedAgainst
 * are scoped to the caller's own matches, since this exists to help one
 * player find their own likely opponents quickly, not to report league-wide
 * numbers.
 *
 *   GET /api/decks -> DeckSummaryResponse[]
 */
app.http('decks', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'decks',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const user = getUser(request);
      if (!user) return { status: 401, jsonBody: { error: 'Unauthorized.' } };

      const db = await getDb();
      const { isMember } = await resolveRole(db, user.userId, user.userDetails, context);
      if (!isMember) return { status: 403, jsonBody: { error: 'You do not have access to this app.' } };

      const ownerId = await ensureUser(db, user.userId, user.userDetails);

      const oppStats = db
        .select({
          deckId: matches.opponentDeckId,
          cnt: count(matches.id).as('cnt'),
          lastPlayed: max(nights.playedOn).as('lastPlayed')
        })
        .from(matches)
        .innerJoin(nights, eq(nights.id, matches.nightId))
        .where(eq(nights.ownerId, ownerId))
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

      const jsonBody: DeckSummaryResponse[] = rows.map((r) => ({
        id: String(r.id),
        name: r.name,
        type: r.type ?? 'Colorless',
        ownerLogin: r.ownerLogin,
        timesPlayedAgainst: r.timesPlayedAgainst ?? 0,
        lastPlayedAgainst: r.lastPlayedAgainst
      }));
      return { jsonBody };
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
