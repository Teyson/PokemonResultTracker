import { app, type HttpRequest, type InvocationContext, type HttpResponseInit } from '@azure/functions';
import { and, eq, gte, lte, isNull, count, sum } from 'drizzle-orm';
import { nights, seasons, users, decks } from '../db/schema';
import { defaultLeagueId } from '../db/leagues';
import { authenticate } from '../auth';
import { displayName } from '../db/displayName';
import type { LeaderboardEntryResponse, LeaderboardResponse, BestDeckResponse } from '../types';

/**
 * /api/leaderboard — season standings across the whole league.
 *
 *   GET /api/leaderboard                -> LeaderboardResponse, all-time totals for the default league
 *   GET /api/leaderboard?seasonId=<id>  -> same shape, scoped to that season's date range
 *   GET /api/leaderboard?leagueId=<id>  -> same shape, scoped to that league instead of the default one
 *
 * One row per player who has logged at least one league night in the scope,
 * plus one league-wide "best deck" highlight — both aggregated server-side
 * (never raw per-night data: dates and notes stay private to their owner,
 * only W/T/L totals and a deck's name/owner login are shared).
 *
 * Scoped to one league (league_id = <id>, defaulting to the default league)
 * — casual nights and other leagues' nights never affect standings. Unlike
 * GET /api/nights (own-nights-only unless an admin passes scope=all), this is
 * open to every member: seeing where you rank against the rest of the league
 * is the point of the feature.
 *
 * The seasonId/leagueId filters are applied server-side (before aggregating)
 * rather than client-side, so the privacy boundary — members only ever see
 * aggregate totals, never raw nights — holds for season and league views too.
 * seasonId is validated to actually belong to leagueId (or the default league
 * when leagueId is omitted) — a season from a different league is 404, same
 * as an unknown id (#80: seasons are per-league).
 */

// A deck needs more than this many nights logged to be eligible for the
// "best deck" highlight — a 1-night 3-0 shouldn't outrank a real sample size.
const BEST_DECK_MIN_NIGHTS = 3;
app.http('leaderboard', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'leaderboard',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const auth = await authenticate(request, context);
      if (!('isMember' in auth)) return auth;
      const { db, isMember } = auth;
      if (!isMember) return { status: 403, jsonBody: { error: 'You do not have access to this app.' } };

      const leagueIdParam = request.query.get('leagueId');
      let leagueId: number | null;
      if (leagueIdParam !== null) {
        leagueId = Number(leagueIdParam);
        if (!Number.isInteger(leagueId)) return { status: 400, jsonBody: { error: 'Invalid leagueId.' } };
      } else {
        leagueId = await defaultLeagueId(db);
      }
      // No league exists yet (fresh install, before any league is created) — nothing to scope to.
      if (leagueId === null) {
        return { jsonBody: { entries: [], bestDeck: null } satisfies LeaderboardResponse };
      }

      const seasonIdParam = request.query.get('seasonId');
      let seasonRange: { startsOn: string; endsOn: string | null } | undefined;
      if (seasonIdParam !== null) {
        const seasonId = Number(seasonIdParam);
        if (!Number.isInteger(seasonId)) return { status: 400, jsonBody: { error: 'Invalid seasonId.' } };
        const found = (
          await db
            .select({ startsOn: seasons.startsOn, endsOn: seasons.endsOn, leagueId: seasons.leagueId })
            .from(seasons)
            .where(eq(seasons.id, seasonId))
        )[0];
        // Treat "wrong league" the same as "doesn't exist" — a season id that belongs to
        // a different league is not a valid scope for this request's leagueId.
        if (!found || found.leagueId !== leagueId) return { status: 404, jsonBody: { error: 'Season not found.' } };
        seasonRange = found;
      }

      const scopeFilter = and(
        eq(nights.leagueId, leagueId),
        isNull(nights.deletedAt),
        seasonRange ? gte(nights.playedOn, seasonRange.startsOn) : undefined,
        seasonRange?.endsOn ? lte(nights.playedOn, seasonRange.endsOn) : undefined
      );

      const rows = await db
        .select({
          login: users.githubLogin,
          alias: users.alias,
          nights: count(nights.id),
          w: sum(nights.wins).mapWith(Number),
          t: sum(nights.ties).mapWith(Number),
          l: sum(nights.losses).mapWith(Number)
        })
        .from(nights)
        .innerJoin(users, eq(users.id, nights.ownerId))
        .where(scopeFilter)
        .groupBy(users.githubLogin, users.alias);

      // SUM() is typed nullable in general (no matching rows), but every row here came from
      // a GROUP BY with at least one match, so the sums are never actually null — the ?? 0
      // just satisfies the type.
      const entries: LeaderboardEntryResponse[] = rows.map((r) => ({
        login: r.login,
        displayName: displayName(r.login, r.alias),
        nights: r.nights,
        w: r.w ?? 0,
        t: r.t ?? 0,
        l: r.l ?? 0
      }));

      // League-wide "best deck" highlight for the same scope — grouped by deck
      // id (not name), since deck names are only unique per owner.
      const deckRows = await db
        .select({
          deck: decks.name,
          ownerLogin: users.githubLogin,
          ownerAlias: users.alias,
          nights: count(nights.id),
          w: sum(nights.wins).mapWith(Number),
          t: sum(nights.ties).mapWith(Number),
          l: sum(nights.losses).mapWith(Number)
        })
        .from(nights)
        .innerJoin(decks, eq(decks.id, nights.deckId))
        .innerJoin(users, eq(users.id, nights.ownerId))
        .where(scopeFilter)
        .groupBy(decks.id, decks.name, users.githubLogin, users.alias);

      let bestDeck: BestDeckResponse | null = null;
      let bestPpg = -1;
      for (const r of deckRows) {
        if (r.nights <= BEST_DECK_MIN_NIGHTS) continue;
        const w = r.w ?? 0;
        const t = r.t ?? 0;
        const l = r.l ?? 0;
        const games = w + t + l;
        const ppg = games ? (w * 3 + t) / games : 0;
        if (ppg > bestPpg) {
          bestPpg = ppg;
          bestDeck = {
            deck: r.deck,
            ownerLogin: r.ownerLogin,
            ownerDisplayName: displayName(r.ownerLogin, r.ownerAlias),
            nights: r.nights,
            w,
            t,
            l
          };
        }
      }

      const jsonBody: LeaderboardResponse = { entries, bestDeck };
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
