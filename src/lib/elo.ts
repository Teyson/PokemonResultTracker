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

interface RatingEvent {
  deckKey: string;
  name: string;
  ratingAfter: number;
}

// Replays every match that has an opponent deck recorded, in chronological
// order (night date, then night id, then round number within the night —
// the same tie-break `sortedByDate` uses elsewhere), and emits one event per
// deck per match with that deck's rating immediately after the update.
// Matches without an opponent deck don't move any rating and are skipped.
function replay(nights: Night[]): RatingEvent[] {
  const ratings = new Map<string, DeckRating>();
  const events: RatingEvent[] = [];

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
      const score = m.result === 'W' ? 1 : m.result === 'T' ? 0.5 : 0;
      const expOwn = expected(own.rating, opp.rating);
      own.rating += K * (score - expOwn);
      opp.rating += K * (1 - score - (1 - expOwn));
      own.games++;
      opp.games++;
      events.push({ deckKey: normalize(night.deck), name: night.deck, ratingAfter: own.rating });
      events.push({ deckKey: normalize(m.opponentDeck), name: m.opponentDeck, ratingAfter: opp.rating });
    }
  }

  return events;
}

/** Current Elo rating for every deck that has appeared in a match with an opponent deck recorded. */
export function deckElo(nights: Night[]): Map<string, DeckRating> {
  const map = new Map<string, DeckRating>();
  for (const e of replay(nights)) {
    map.set(e.deckKey, { name: e.name, rating: e.ratingAfter, games: (map.get(e.deckKey)?.games ?? 0) + 1 });
  }
  return map;
}

/** One deck's rating after each of its Elo-rated matches, oldest to newest — for a rating trend sparkline. */
export function deckRatingTrend(nights: Night[], deckName: string, limit: number): number[] {
  const key = normalize(deckName);
  return replay(nights)
    .filter((e) => e.deckKey === key)
    .map((e) => e.ratingAfter)
    .slice(-limit);
}
