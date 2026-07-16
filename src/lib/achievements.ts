import type { Night } from './types';
import { games, ppg, sortedByDate } from './pokemon';
import { normalizeDeckName, replayMatches } from './elo';

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
  progress?(nights: Night[]): Progress | null;
}

const deckKey = normalizeDeckName;

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

/** Date the streak of consecutive weeks first reached `target`, or null. */
function consecutiveWeeksReached(sorted: Night[], target: number): string | null {
  if (longestConsecutiveWeeks(sorted) < target) return null;
  // Rare path (badge is earned); re-walk night-by-night to find the earning date.
  for (let i = 0; i < sorted.length; i++) {
    if (longestConsecutiveWeeks(sorted.slice(0, i + 1)) >= target) return sorted[i].date;
  }
  return null;
}

/** Every logged match across all nights, in chronological play order, tagged with its night's date. */
function chronologicalMatches(sorted: Night[]): { date: string; result: 'W' | 'T' | 'L'; wentFirst?: boolean; opponentDeck?: string }[] {
  const list: { date: string; result: 'W' | 'T' | 'L'; wentFirst?: boolean; opponentDeck?: string }[] = [];
  for (const n of sorted) {
    const byRound = [...(n.matches ?? [])].sort((a, b) => a.roundNo - b.roundNo);
    for (const m of byRound) {
      list.push({ date: n.date, result: m.result, wentFirst: m.wentFirst, opponentDeck: m.opponentDeck });
    }
  }
  return list;
}

/** Date the match win streak first reached `target`, or null. */
function matchWinStreakReached(sorted: Night[], target: number): string | null {
  let current = 0;
  for (const m of chronologicalMatches(sorted)) {
    current = m.result === 'W' ? current + 1 : 0;
    if (current >= target) return m.date;
  }
  return null;
}

/** Longest run of consecutive match wins across all logged matches. */
function longestMatchWinStreak(sorted: Night[]): number {
  let current = 0;
  let longest = 0;
  for (const m of chronologicalMatches(sorted)) {
    current = m.result === 'W' ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}

/**
 * Winning-night streak semantics match src/lib/records.ts: a winning night is
 * w > l, a losing night (l > w) resets the streak, a tied night neither
 * extends nor breaks it.
 */
function nightWinStreakReached(sorted: Night[], target: number): string | null {
  let current = 0;
  for (const n of sorted) {
    if (n.w > n.l) {
      current += 1;
      if (current >= target) return n.date;
    } else if (n.l > n.w) {
      current = 0;
    }
  }
  return null;
}

function longestNightWinStreak(sorted: Night[]): number {
  let current = 0;
  let longest = 0;
  for (const n of sorted) {
    if (n.w > n.l) {
      current += 1;
      longest = Math.max(longest, current);
    } else if (n.l > n.w) {
      current = 0;
    }
  }
  return longest;
}

/** PPG over each full 5-night window, chronological, tagged with the window's last night. */
function rollingFiveWindows(sorted: Night[]): { date: string; ppg: number }[] {
  const out: { date: string; ppg: number }[] = [];
  for (let i = 4; i < sorted.length; i++) {
    const win = sorted.slice(i - 4, i + 1);
    out.push({
      date: sorted[i].date,
      ppg: ppg({
        w: win.reduce((s, n) => s + n.w, 0),
        t: win.reduce((s, n) => s + n.t, 0),
        l: win.reduce((s, n) => s + n.l, 0)
      })
    });
  }
  return out;
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

/** Date the count of distinct decks played first reached `target`, or null. */
function distinctDecksReached(sorted: Night[], target: number): string | null {
  const seen = new Set<string>();
  for (const n of sorted) {
    seen.add(deckKey(n.deck));
    if (seen.size >= target) return n.date;
  }
  return null;
}

function distinctTypeCount(nights: Night[]): number {
  return new Set(nights.map((n) => n.type.trim().toLowerCase())).size;
}

function totalGames(nights: Night[]): number {
  return nights.reduce((sum, n) => sum + games(n), 0);
}

/** Date cumulative games first reached `target`, or null. */
function totalGamesReached(sorted: Night[], target: number): string | null {
  let total = 0;
  for (const n of sorted) {
    total += games(n);
    if (total >= target) return n.date;
  }
  return null;
}

function totalTies(nights: Night[]): number {
  return nights.reduce((sum, n) => sum + n.t, 0);
}

const DEFINITIONS: Definition[] = [
  // --- The originals ---
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
    evaluate: (sorted) => distinctDecksReached(sorted, 5),
    progress: (nights) => ({ current: Math.min(distinctDeckCount(nights), 5), target: 5 })
  },
  {
    id: 'iron-tuesday',
    name: 'Iron Tuesday',
    emoji: '⛓️',
    description: 'Attend 8 consecutive weeks.',
    evaluate: (sorted) => consecutiveWeeksReached(sorted, 8),
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
    evaluate: (sorted) => totalGamesReached(sorted, 100),
    progress: (nights) => ({ current: Math.min(totalGames(nights), 100), target: 100 })
  },
  {
    id: 'on-a-heater',
    name: 'On a Heater',
    emoji: '🔥',
    description: 'Win 5 matches in a row.',
    evaluate: (sorted) => matchWinStreakReached(sorted, 5),
    progress: (nights) => ({ current: Math.min(longestMatchWinStreak(sortedByDate(nights)), 5), target: 5 })
  },

  // --- Volume & dedication ---
  {
    id: 'half-century',
    name: 'Half Century',
    emoji: '🗓️',
    description: 'Log 50 nights.',
    evaluate: (sorted) => (sorted.length >= 50 ? sorted[49].date : null),
    progress: (nights) => ({ current: Math.min(nights.length, 50), target: 50 })
  },
  {
    id: 'double-century',
    name: 'Double Century',
    emoji: '🎯',
    description: 'Play 250 games.',
    evaluate: (sorted) => totalGamesReached(sorted, 250),
    progress: (nights) => ({ current: Math.min(totalGames(nights), 250), target: 250 })
  },
  {
    id: 'anniversary',
    name: 'Anniversary',
    emoji: '🎂',
    description: 'Log nights spanning a full year.',
    evaluate: (sorted) =>
      sorted.length ? (sorted.find((n) => epochDay(n.date) - epochDay(sorted[0].date) >= 365)?.date ?? null) : null,
    progress: (nights) => {
      const sorted = sortedByDate(nights);
      const span = sorted.length ? epochDay(sorted[sorted.length - 1].date) - epochDay(sorted[0].date) : 0;
      return { current: Math.min(span, 365), target: 365 };
    }
  },
  {
    id: 'iron-season',
    name: 'Iron Season',
    emoji: '🏋️',
    description: 'Attend 16 consecutive weeks.',
    evaluate: (sorted) => consecutiveWeeksReached(sorted, 16),
    progress: (nights) => ({ current: Math.min(longestConsecutiveWeeks(sortedByDate(nights)), 16), target: 16 })
  },
  {
    id: 'overtime',
    name: 'Overtime',
    emoji: '🕐',
    description: 'Play 10 or more games in a single night.',
    evaluate: (sorted) => sorted.find((n) => games(n) >= 10)?.date ?? null,
    progress: (nights) => ({
      current: Math.min(nights.length ? Math.max(...nights.map((n) => games(n))) : 0, 10),
      target: 10
    })
  },
  {
    id: 'tie-fighter',
    name: 'Tie Fighter',
    emoji: '🤝',
    description: 'Record 10 career ties.',
    evaluate: (sorted) => {
      let ties = 0;
      for (const n of sorted) {
        ties += n.t;
        if (ties >= 10) return n.date;
      }
      return null;
    },
    progress: (nights) => ({ current: Math.min(totalTies(nights), 10), target: 10 })
  },

  // --- Winning & form ---
  {
    id: 'hat-trick',
    name: 'Hat Trick',
    emoji: '🎩',
    description: '3 winning nights in a row.',
    evaluate: (sorted) => nightWinStreakReached(sorted, 3),
    progress: (nights) => ({ current: Math.min(longestNightWinStreak(sortedByDate(nights)), 3), target: 3 })
  },
  {
    id: 'unstoppable',
    name: 'Unstoppable',
    emoji: '🌊',
    description: '5 winning nights in a row.',
    evaluate: (sorted) => nightWinStreakReached(sorted, 5),
    progress: (nights) => ({ current: Math.min(longestNightWinStreak(sortedByDate(nights)), 5), target: 5 })
  },
  {
    id: 'perfect-ten',
    name: 'Perfect Ten',
    emoji: '🔟',
    description: 'Win 10 matches in a row.',
    evaluate: (sorted) => matchWinStreakReached(sorted, 10),
    progress: (nights) => ({ current: Math.min(longestMatchWinStreak(sortedByDate(nights)), 10), target: 10 })
  },
  {
    id: 'clean-sweep',
    name: 'Clean Sweep',
    emoji: '🧹',
    description: '5 or more wins, nothing else, in one night.',
    evaluate: (sorted) => sorted.find((n) => n.w >= 5 && n.t === 0 && n.l === 0)?.date ?? null
  },
  {
    id: 'hot-streak',
    name: 'Hot Streak',
    emoji: '🌡️',
    description: 'Average 2.00+ PPG across 5 consecutive nights.',
    evaluate: (sorted) => rollingFiveWindows(sorted).find((w) => w.ppg >= 2)?.date ?? null,
    progress: (nights) => {
      const windows = rollingFiveWindows(sortedByDate(nights));
      const best = windows.length ? Math.max(...windows.map((w) => w.ppg)) : 0;
      return { current: Math.min(Math.round(best * 100) / 100, 2), target: 2 };
    }
  },
  {
    id: 'bounce-back',
    name: 'Bounce Back',
    emoji: '🃏',
    description: 'A winning night right after a winless one.',
    evaluate: (sorted) => {
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        if (prev.w === 0 && games(prev) > 0 && sorted[i].w > sorted[i].l) return sorted[i].date;
      }
      return null;
    }
  },
  {
    id: 'comeback-kid',
    name: 'Comeback Kid',
    emoji: '🔄',
    description: 'Lose the first two matches, still finish the night winning.',
    evaluate: (sorted) => {
      for (const n of sorted) {
        const byRound = [...(n.matches ?? [])].sort((a, b) => a.roundNo - b.roundNo);
        if (byRound.length >= 2 && byRound[0].result === 'L' && byRound[1].result === 'L' && n.w > n.l) {
          return n.date;
        }
      }
      return null;
    }
  },

  // --- Decks & variety ---
  {
    id: 'explorer',
    name: 'Explorer',
    emoji: '🗺️',
    description: 'Play 10 different decks.',
    evaluate: (sorted) => distinctDecksReached(sorted, 10),
    progress: (nights) => ({ current: Math.min(distinctDeckCount(nights), 10), target: 10 })
  },
  {
    id: 'rainbow',
    name: 'Rainbow',
    emoji: '🌈',
    description: 'Play decks of 7 different energy types.',
    evaluate: (sorted) => {
      const seen = new Set<string>();
      for (const n of sorted) {
        seen.add(n.type.trim().toLowerCase());
        if (seen.size >= 7) return n.date;
      }
      return null;
    },
    progress: (nights) => ({ current: Math.min(distinctTypeCount(nights), 7), target: 7 })
  },
  {
    id: 'deck-whisperer',
    name: 'Deck Whisperer',
    emoji: '🐉',
    description: 'Get one of your decks to a 1200 Elo rating.',
    evaluate: (sorted) => replayMatches(sorted).find((e) => e.ownAfter >= 1200)?.date ?? null,
    progress: (nights) => {
      const events = replayMatches(nights);
      if (!events.length) return null;
      const peak = Math.max(...events.map((e) => e.ownAfter));
      return { current: Math.min(Math.round(peak), 1200), target: 1200 };
    }
  },

  // --- Opponents & matchups ---
  {
    id: 'giant-slayer',
    name: 'Giant Slayer',
    emoji: '⚔️',
    description: 'Beat an opponent deck rated 100+ Elo above yours.',
    evaluate: (sorted) =>
      replayMatches(sorted).find((e) => e.result === 'W' && e.oppBefore - e.ownBefore >= 100)?.date ?? null
  },
  {
    id: 'nemesis',
    name: 'Nemesis',
    emoji: '🥊',
    description: 'Face the same opponent deck 10 times.',
    evaluate: (sorted) => {
      const counts = new Map<string, number>();
      for (const m of chronologicalMatches(sorted)) {
        if (!m.opponentDeck) continue;
        const k = deckKey(m.opponentDeck);
        const next = (counts.get(k) ?? 0) + 1;
        counts.set(k, next);
        if (next >= 10) return m.date;
      }
      return null;
    },
    progress: (nights) => {
      const counts = new Map<string, number>();
      for (const m of chronologicalMatches(sortedByDate(nights))) {
        if (!m.opponentDeck) continue;
        const k = deckKey(m.opponentDeck);
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      const max = counts.size ? Math.max(...counts.values()) : 0;
      return { current: Math.min(max, 10), target: 10 };
    }
  },
  {
    id: 'meta-caller',
    name: 'Meta Caller',
    emoji: '🔮',
    description: 'Beat 8 distinct opponent decks.',
    evaluate: (sorted) => {
      const beaten = new Set<string>();
      for (const m of chronologicalMatches(sorted)) {
        if (m.result !== 'W' || !m.opponentDeck) continue;
        beaten.add(deckKey(m.opponentDeck));
        if (beaten.size >= 8) return m.date;
      }
      return null;
    },
    progress: (nights) => {
      const beaten = new Set<string>();
      for (const m of chronologicalMatches(sortedByDate(nights))) {
        if (m.result === 'W' && m.opponentDeck) beaten.add(deckKey(m.opponentDeck));
      }
      return { current: Math.min(beaten.size, 8), target: 8 };
    }
  },
  {
    id: 'coin-flip-defier',
    name: 'Coin Flip Defier',
    emoji: '🪙',
    description: 'Win 10 matches going second.',
    evaluate: (sorted) => {
      let count = 0;
      for (const m of chronologicalMatches(sorted)) {
        if (m.result === 'W' && m.wentFirst === false) {
          count += 1;
          if (count >= 10) return m.date;
        }
      }
      return null;
    },
    progress: (nights) => {
      const count = chronologicalMatches(sortedByDate(nights)).filter(
        (m) => m.result === 'W' && m.wentFirst === false
      ).length;
      return { current: Math.min(count, 10), target: 10 };
    }
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
