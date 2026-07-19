import type { League } from './types';
import { api } from './api';

const STORAGE_KEY = 'activeLeagueId';

function loadPreference(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

// App-wide league state, read by every league-scoped view (leaderboard fetch,
// main page filtering, NightForm's League button/label, NavMenu's selector) —
// one shared fetch and one selection, instead of a picker (and a refetch) per
// page. activeLeagueId mirrors theme.svelte.ts's localStorage mechanism.
export const leagueState = $state<{ leagues: League[]; loaded: boolean; activeLeagueId: string | null }>({
  leagues: [],
  loaded: false,
  activeLeagueId: loadPreference()
});

export function setActiveLeague(id: string) {
  leagueState.activeLeagueId = id;
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, id);
}

/**
 * Keeps the active league valid against the current unarchived list: falls
 * back to the default (lowest-id) league if nothing is set yet, or if the
 * stored id no longer matches an unarchived league (e.g. it was archived).
 */
export function ensureActiveLeague(unarchivedLeagues: League[]): void {
  if (unarchivedLeagues.length === 0) return;
  const stillValid = leagueState.activeLeagueId !== null && unarchivedLeagues.some((l) => l.id === leagueState.activeLeagueId);
  if (!stillValid) setActiveLeague(unarchivedLeagues[0].id);
}

/** Fetches the league list once (member-only endpoint) — safe to call from every component that needs it. */
export async function loadLeagues(): Promise<void> {
  if (leagueState.loaded) return;
  leagueState.loaded = true;
  try {
    const data = (await api<League[]>('/api/leagues')) ?? [];
    leagueState.leagues = data;
    ensureActiveLeague(data.filter((l) => !l.archivedAt));
  } catch {
    // Not a member yet, or a transient error — league-scoped UI just stays hidden.
  }
}
