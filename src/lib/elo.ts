import type { Night } from './types';
import { sortedByDate } from './pokemon';

const START_RATING = 1000;
const K = 32;

export interface DeckRating {
  name: string;
  rating: number;
  games: number;
}

// Elo is scoped by deck name alone (case-insensitive, trimmed), not
// name+owner like DeckTable's own rows — a deck is one archetype across the
// whole league regardless of who's piloting it, and opponent decks (which
// only ever carry a name, no owner) already get tracked the same flat way in
// the matchup breakdown. Two different owners playing "Charizard" contribute
// to and read the same rating.
//
// Known conflict, left unresolved deliberately (see docs/FEATURE-IDEAS.md,
// idea 6): decks.ownerId models a deck as one player's own build, so two
// players naming the same archetype differently ("Gardevoir" vs
// "Gard/Kirlia") won't unify here, and cross-owner deck merging can't fix it
// either — upsertOwnedDeck only matches within the calling player's own
// ownerId. Revisit only if this causes real confusion in practice.
export function normalizeDeckName(name: string): string {
  return name.trim().toLowerCase();
}
const normalize = normalizeDeckName;

function expected(a: number, b: number): number {
  return 1 / (1 + 10 ** ((b - a) / 400));
}

export interface MatchRatingEvent {
  /** Date of the night the match was played on (ISO YYYY-MM-DD). */
  date: string;
  ownDeckKey: string;
  ownName: string;
  oppDeckKey: string;
  oppName: string;
  /** Ratings going into the match — what "opponent strength at the time" means. */
  ownBefore: number;
  oppBefore: number;
  ownAfter: number;
  oppAfter: number;
  result: 'W' | 'T' | 'L';
}

// Replays every match that has an opponent deck recorded, in chronological
// order (night date, then night id, then round number within the night —
// the same tie-break `sortedByDate` uses elsewhere), and emits one event per
// match with both decks' ratings before and after the update. Matches
// without an opponent deck don't move any rating and are skipped.
export function replayMatches(nights: Night[]): MatchRatingEvent[] {
  const ratings = new Map<string, DeckRating>();
  const events: MatchRatingEvent[] = [];

  function get(name: string): DeckRating {
    const key = normalize(name);
    let r = ratings.get(key);
    if (!r) {
      r = { name, rating: START_RATING, games: 0 };
      ratings.set(key, r);
    }
    return r;
  }

  for (const night of sortedByDate(nights)) {
    const matches = [...(night.matches ?? [])].sort((a, b) => a.roundNo - b.roundNo);
    for (const m of matches) {
      if (!m.opponentDeck) continue;
      const own = get(night.deck);
      const opp = get(m.opponentDeck);
      const ownBefore = own.rating;
      const oppBefore = opp.rating;
      const score = m.result === 'W' ? 1 : m.result === 'T' ? 0.5 : 0;
      const expOwn = expected(ownBefore, oppBefore);
      own.rating += K * (score - expOwn);
      opp.rating += K * (1 - score - (1 - expOwn));
      own.games++;
      opp.games++;
      events.push({
        date: night.date,
        ownDeckKey: normalize(night.deck),
        ownName: night.deck,
        oppDeckKey: normalize(m.opponentDeck),
        oppName: m.opponentDeck,
        ownBefore,
        oppBefore,
        ownAfter: own.rating,
        oppAfter: opp.rating,
        result: m.result
      });
    }
  }

  return events;
}

/** Current Elo rating for every deck that has appeared in a match with an opponent deck recorded. */
export function deckElo(nights: Night[]): Map<string, DeckRating> {
  const map = new Map<string, DeckRating>();
  for (const e of replayMatches(nights)) {
    map.set(e.ownDeckKey, { name: e.ownName, rating: e.ownAfter, games: (map.get(e.ownDeckKey)?.games ?? 0) + 1 });
    map.set(e.oppDeckKey, { name: e.oppName, rating: e.oppAfter, games: (map.get(e.oppDeckKey)?.games ?? 0) + 1 });
  }
  return map;
}

/** One deck's rating after each of its Elo-rated matches, oldest to newest — for a rating trend sparkline. */
export function deckRatingTrend(nights: Night[], deckName: string, limit: number): number[] {
  const key = normalize(deckName);
  const out: number[] = [];
  for (const e of replayMatches(nights)) {
    if (e.ownDeckKey === key) out.push(e.ownAfter);
    if (e.oppDeckKey === key) out.push(e.oppAfter);
  }
  return out.slice(-limit);
}
