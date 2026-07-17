import { app, type HttpRequest, type InvocationContext, type HttpResponseInit } from '@azure/functions';
import { and, eq, isNull, count, sum } from 'drizzle-orm';
import { getDb } from '../db/client';
import { nights, users } from '../db/schema';
import { getUser, resolveRole } from '../auth';
import type { LeaderboardEntryResponse } from '../types';

/**
 * /api/leaderboard — season standings across the whole league.
 *
 *   GET /api/leaderboard -> LeaderboardEntryResponse[], one row per player who has
 *                           logged at least one league night, totals aggregated
 *                           server-side (never raw per-night data — decks, dates
 *                           and notes stay private to their owner; only the season
 *                           W/T/L totals are shared).
 *
 * Scoped to league nights only (is_league_night = 1) — casual nights never affect
 * standings. Unlike GET /api/nights (own-nights-only unless an admin passes
 * scope=all), this is open to every member: seeing where you rank against the
 * rest of the league is the point of the feature.
 */
app.http('leaderboard', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'leaderboard',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const user = getUser(request);
      if (!user) return { status: 401, jsonBody: { error: 'Unauthorized.' } };

      const db = await getDb();
      const { isMember } = await resolveRole(db, user.userId, user.userDetails, context);
      if (!isMember) return { status: 403, jsonBody: { error: 'You do not have access to this app.' } };

      const rows = await db
        .select({
          login: users.githubLogin,
          nights: count(nights.id),
          w: sum(nights.wins).mapWith(Number),
          t: sum(nights.ties).mapWith(Number),
          l: sum(nights.losses).mapWith(Number)
        })
        .from(nights)
        .innerJoin(users, eq(users.id, nights.ownerId))
        .where(and(eq(nights.isLeagueNight, true), isNull(nights.deletedAt)))
        .groupBy(users.githubLogin);

      // SUM() is typed nullable in general (no matching rows), but every row here came from
      // a GROUP BY with at least one match, so the sums are never actually null — the ?? 0
      // just satisfies the type.
      const jsonBody: LeaderboardEntryResponse[] = rows.map((r) => ({
        login: r.login,
        nights: r.nights,
        w: r.w ?? 0,
        t: r.t ?? 0,
        l: r.l ?? 0
      }));
      return { jsonBody };
    } catch (err) {
      context.error('leaderboard handler failed', err);
      return {
        status: 500,
        jsonBody: {
          error: 'Database error. If the app was idle, the database may be waking up — try again in a few seconds.'
        }
      };
    }
  }
});
