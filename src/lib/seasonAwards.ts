import type { Night, Season } from './types';
import { games, ppg, nightInSeason } from './pokemon';

export interface DeckSeasonStat {
  deck: string;
  type: string;
  w: number;
  t: number;
  l: number;
  ppg: number;
}

export interface NightSeasonStat {
  night: Night;
  ppg: number;
}

export interface PersonalSeasonAwards {
  nightsPlayed: number;
  gamesPlayed: number;
  bestDeck: DeckSeasonStat | null;
  biggestNight: NightSeasonStat | null;
}

// Mirrors the minimum-games floor src/lib/records.ts uses for "best night ever" —
// a spotless 1-0 shouldn't outrank a real sample size just by having no losses.
const MIN_GAMES = 3;

/**
 * A member's own per-season awards: nights/games played, best-performing deck,
 * and single best night. Scoped to the active league's nights only, matching
 * the leaderboard's own scoping (casual nights, and other leagues' nights,
 * don't count toward standings, so they don't count here either).
 */
export function personalSeasonAwards(nights: Night[], season: Season, leagueId: string): PersonalSeasonAwards {
  const seasonNights = nights.filter((n) => n.leagueId === leagueId && nightInSeason(n, season));

  const byDeck = new Map<string, { deck: string; type: string; w: number; t: number; l: number }>();
  for (const n of seasonNights) {
    const key = n.deck.trim().toLowerCase();
    const agg = byDeck.get(key) ?? { deck: n.deck, type: n.type, w: 0, t: 0, l: 0 };
    agg.w += n.w;
    agg.t += n.t;
    agg.l += n.l;
    byDeck.set(key, agg);
  }

  let bestDeck: DeckSeasonStat | null = null;
  for (const d of byDeck.values()) {
    if (games(d) < MIN_GAMES) continue;
    const p = ppg(d);
    if (!bestDeck || p > bestDeck.ppg) bestDeck = { ...d, ppg: p };
  }

  let biggestNight: NightSeasonStat | null = null;
  for (const n of seasonNights) {
    if (games(n) < MIN_GAMES) continue;
    const p = ppg(n);
    if (!biggestNight || p > biggestNight.ppg) biggestNight = { night: n, ppg: p };
  }

  return {
    nightsPlayed: seasonNights.length,
    gamesPlayed: seasonNights.reduce((sum, n) => sum + games(n), 0),
    bestDeck,
    biggestNight
  };
}
