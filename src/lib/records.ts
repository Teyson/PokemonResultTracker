import type { Night } from './types';
import { games, ppg } from './pokemon';

export interface BestNight {
  night: Night;
  ppg: number;
  games: number;
}

export interface GamesMilestone {
  total: number;
  next: number | null;
  remaining: number | null;
}

export interface Records {
  currentNightStreak: number;
  longestNightStreak: number;
  longestMatchWinStreak: number;
  longestMatchUnbeatenStreak: number;
  hasMatchData: boolean;
  bestNight: BestNight | null;
  totalNights: number;
  gamesMilestone: GamesMilestone;
}

const MILESTONES = [50, 100, 250, 500, 1000, 2000];

// Minimum games for a night to be eligible as "best night ever" — a 1-0 night
// shouldn't outrank a strong 4-1 one just by having a cleaner record.
const BEST_NIGHT_MIN_GAMES = 3;

function sortedByDate(nights: Night[]): Night[] {
  return [...nights].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id.localeCompare(b.id)));
}

/** A "winning night" is one where wins outnumber losses; ties neither extend nor break the streak. */
function isWinningNight(n: Night): boolean {
  return n.w > n.l;
}

function isLosingNight(n: Night): boolean {
  return n.l > n.w;
}

/** Walks nights chronologically; a losing night resets the streak, a tied night just doesn't extend it. */
function nightWinStreaks(sorted: Night[]): { current: number; longest: number } {
  let current = 0;
  let longest = 0;
  for (const n of sorted) {
    if (isWinningNight(n)) {
      current += 1;
      longest = Math.max(longest, current);
    } else if (isLosingNight(n)) {
      current = 0;
    }
  }
  return { current, longest };
}

/** Every logged match across all nights, in chronological play order. */
function chronologicalMatches(sorted: Night[]): { result: 'W' | 'T' | 'L' }[] {
  const list: { result: 'W' | 'T' | 'L' }[] = [];
  for (const n of sorted) {
    const byRound = [...(n.matches ?? [])].sort((a, b) => a.roundNo - b.roundNo);
    for (const m of byRound) list.push({ result: m.result });
  }
  return list;
}

/**
 * Win streak: only consecutive W's count, a T or L resets it.
 * Unbeaten streak: W or T both extend it, only an L resets it.
 */
function matchStreaks(sorted: Night[]): { winStreak: number; unbeatenStreak: number } {
  let win = 0;
  let longestWin = 0;
  let unbeaten = 0;
  let longestUnbeaten = 0;
  for (const m of chronologicalMatches(sorted)) {
    if (m.result === 'W') {
      win += 1;
      unbeaten += 1;
    } else if (m.result === 'T') {
      win = 0;
      unbeaten += 1;
    } else {
      win = 0;
      unbeaten = 0;
    }
    longestWin = Math.max(longestWin, win);
    longestUnbeaten = Math.max(longestUnbeaten, unbeaten);
  }
  return { winStreak: longestWin, unbeatenStreak: longestUnbeaten };
}

function findBestNight(nights: Night[]): BestNight | null {
  let best: BestNight | null = null;
  for (const n of nights) {
    const g = games(n);
    if (g < BEST_NIGHT_MIN_GAMES) continue;
    const p = ppg(n);
    if (!best || p > best.ppg) best = { night: n, ppg: p, games: g };
  }
  return best;
}

function findGamesMilestone(nights: Night[]): GamesMilestone {
  const total = nights.reduce((sum, n) => sum + games(n), 0);
  const next = MILESTONES.find((m) => m > total) ?? null;
  return { total, next, remaining: next !== null ? next - total : null };
}

export function computeRecords(nights: Night[]): Records {
  const sorted = sortedByDate(nights);
  const nightStreaks = nightWinStreaks(sorted);
  const { winStreak, unbeatenStreak } = matchStreaks(sorted);
  return {
    currentNightStreak: nightStreaks.current,
    longestNightStreak: nightStreaks.longest,
    longestMatchWinStreak: winStreak,
    longestMatchUnbeatenStreak: unbeatenStreak,
    hasMatchData: sorted.some((n) => (n.matches ?? []).length > 0),
    bestNight: findBestNight(nights),
    totalNights: nights.length,
    gamesMilestone: findGamesMilestone(nights)
  };
}
