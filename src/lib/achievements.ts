import type { Night } from './types';
import { games, sortedByDate } from './pokemon';

export interface Progress {
  current: number;
  target: number;
}

export interface Badge {
  id: string;
  name: string;
  emoji: string;
  description: string;
  earned: boolean;
  earnedOn: string | null;
  progress: Progress | null;
}

interface Definition {
  id: string;
  name: string;
  emoji: string;
  description: string;
  /** Returns the date (ISO) the badge was first earned by, walking chronologically, or null if unearned. */
  evaluate(sorted: Night[]): string | null;
  /** Cheap "how close" indicator for badges not yet earned; omitted where there's no natural single number. */
  progress?(nights: Night[]): Progress;
}

function deckKey(deck: string): string {
  return deck.trim().toLowerCase();
}

function epochDay(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

/**
 * Longest run of consecutive weeks with at least one night logged. Buckets by
 * floor(epochDay / 7), which is anchor-independent for detecting consecutive
 * runs; it can only misjudge two nights logged in the same calendar week if
 * they straddle a bucket boundary, an edge case not worth extra complexity for
 * a once-a-week league.
 */
function longestConsecutiveWeeks(sorted: Night[]): number {
  const buckets = [...new Set(sorted.map((n) => Math.floor(epochDay(n.date) / 7)))].sort((a, b) => a - b);
  let longest = buckets.length ? 1 : 0;
  let current = longest;
  for (let i = 1; i < buckets.length; i++) {
    current = buckets[i] === buckets[i - 1] + 1 ? current + 1 : 1;
    longest = Math.max(longest, current);
  }
  return longest;
}

/** Longest run of consecutive match wins across all logged matches, in chronological play order. */
function longestMatchWinStreak(sorted: Night[]): number {
  let current = 0;
  let longest = 0;
  for (const n of sorted) {
    const byRound = [...(n.matches ?? [])].sort((a, b) => a.roundNo - b.roundNo);
    for (const m of byRound) {
      current = m.result === 'W' ? current + 1 : 0;
      longest = Math.max(longest, current);
    }
  }
  return longest;
}

function maxNightsOnOneDeck(nights: Night[]): number {
  const counts = new Map<string, number>();
  for (const n of nights) {
    const k = deckKey(n.deck);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts.size ? Math.max(...counts.values()) : 0;
}

function distinctDeckCount(nights: Night[]): number {
  return new Set(nights.map((n) => deckKey(n.deck))).size;
}

function totalGames(nights: Night[]): number {
  return nights.reduce((sum, n) => sum + games(n), 0);
}

const DEFINITIONS: Definition[] = [
  {
    id: 'first-blood',
    name: 'First Blood',
    emoji: '🩸',
    description: 'Win your first match of the night.',
    evaluate: (sorted) => sorted.find((n) => n.w > 0)?.date ?? null
  },
  {
    id: 'perfect-night',
    name: 'Perfect Night',
    emoji: '🏆',
    description: '3 or more wins with zero losses in a single night.',
    evaluate: (sorted) => sorted.find((n) => n.w >= 3 && n.l === 0)?.date ?? null
  },
  {
    id: 'loyalist',
    name: 'Loyalist',
    emoji: '🛡️',
    description: 'Log 10 nights with the same deck.',
    evaluate: (sorted) => {
      const counts = new Map<string, number>();
      for (const n of sorted) {
        const k = deckKey(n.deck);
        const next = (counts.get(k) ?? 0) + 1;
        counts.set(k, next);
        if (next >= 10) return n.date;
      }
      return null;
    },
    progress: (nights) => ({ current: Math.min(maxNightsOnOneDeck(nights), 10), target: 10 })
  },
  {
    id: 'scientist',
    name: 'Scientist',
    emoji: '🧪',
    description: 'Play 5 different decks.',
    evaluate: (sorted) => {
      const seen = new Set<string>();
      for (const n of sorted) {
        seen.add(deckKey(n.deck));
        if (seen.size >= 5) return n.date;
      }
      return null;
    },
    progress: (nights) => ({ current: Math.min(distinctDeckCount(nights), 5), target: 5 })
  },
  {
    id: 'iron-tuesday',
    name: 'Iron Tuesday',
    emoji: '⛓️',
    description: 'Attend 8 consecutive weeks.',
    evaluate: (sorted) => (longestConsecutiveWeeks(sorted) >= 8 ? sorted[sorted.length - 1]?.date ?? null : null),
    progress: (nights) => ({ current: Math.min(longestConsecutiveWeeks(sortedByDate(nights)), 8), target: 8 })
  },
  {
    id: 'grinder',
    name: 'Grinder',
    emoji: '⚙️',
    description: 'Log 20 nights.',
    evaluate: (sorted) => (sorted.length >= 20 ? sorted[19].date : null),
    progress: (nights) => ({ current: Math.min(nights.length, 20), target: 20 })
  },
  {
    id: 'century-club',
    name: 'Century Club',
    emoji: '💯',
    description: 'Play 100 games.',
    evaluate: (sorted) => {
      let total = 0;
      for (const n of sorted) {
        total += games(n);
        if (total >= 100) return n.date;
      }
      return null;
    },
    progress: (nights) => ({ current: Math.min(totalGames(nights), 100), target: 100 })
  },
  {
    id: 'on-a-heater',
    name: 'On a Heater',
    emoji: '🔥',
    description: 'Win 5 matches in a row.',
    evaluate: (sorted) => {
      let current = 0;
      for (const n of sorted) {
        const byRound = [...(n.matches ?? [])].sort((a, b) => a.roundNo - b.roundNo);
        for (const m of byRound) {
          current = m.result === 'W' ? current + 1 : 0;
          if (current >= 5) return n.date;
        }
      }
      return null;
    },
    progress: (nights) => ({ current: Math.min(longestMatchWinStreak(sortedByDate(nights)), 5), target: 5 })
  }
];

export function computeBadges(nights: Night[]): Badge[] {
  const sorted = sortedByDate(nights);
  return DEFINITIONS.map((def) => {
    const earnedOn = def.evaluate(sorted);
    return {
      id: def.id,
      name: def.name,
      emoji: def.emoji,
      description: def.description,
      earned: earnedOn !== null,
      earnedOn,
      progress: earnedOn === null ? (def.progress?.(nights) ?? null) : null
    };
  });
}
