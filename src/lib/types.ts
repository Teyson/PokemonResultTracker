export interface Match {
  roundNo: number;
  result: 'W' | 'T' | 'L';
  opponentDeckId?: string;
  opponentDeck?: string;
  opponentType?: string;
  wentFirst?: boolean;
}

export interface Night {
  id: string;
  date: string; // YYYY-MM-DD
  deck: string;
  type: string;
  w: number;
  t: number;
  l: number;
  notes: string | null;
  isLeagueNight: boolean;
  createdBy: string;
  matches?: Match[];
  // Only present on the admin scope=deleted view.
  deletedAt?: string;
}

export interface NightInput {
  date: string;
  deck: string;
  type: string;
  w: number;
  t: number;
  l: number;
  isLeagueNight: boolean;
  matches?: {
    result: 'W' | 'T' | 'L';
    opponentDeckId?: string;
    opponentDeck?: string;
    opponentType?: string;
    wentFirst?: boolean;
  }[];
}

export interface DeckSummary {
  id: string;
  name: string;
  type: string;
  ownerLogin: string | null;
  timesPlayedAgainst: number;
  lastPlayedAgainst: string | null;
  // Only present for admins: league-wide usage, used by the deck management
  // page to decide whether a deck can be safely deleted.
  nightsCount?: number;
  opponentCount?: number;
}

export interface AllowedUser {
  id: string;
  github_login: string;
  role: 'member' | 'admin';
  created_at: string;
}

export interface UsersResponse {
  admin: string;
  users: AllowedUser[];
}

/** A named partition of play, e.g. "Spring 2026". endsOn null means open-ended (current). */
export interface Season {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string | null;
}

/** One player's season totals for the leaderboard — league nights only, no per-night detail. */
export interface LeaderboardEntry {
  login: string;
  nights: number;
  w: number;
  t: number;
  l: number;
}

/** The league-wide top deck by PPG (more than 3 nights logged) for a leaderboard scope, with its owner. */
export interface BestDeck {
  deck: string;
  ownerLogin: string;
  nights: number;
  w: number;
  t: number;
  l: number;
}

/** GET /api/leaderboard response: per-player standings plus a league-wide best-deck highlight, same scope. */
export interface Leaderboard {
  entries: LeaderboardEntry[];
  bestDeck: BestDeck | null;
}

/** One admin/mutating action recorded to the audit trail. */
export interface AuditLogEntry {
  id: string;
  actorLogin: string | null;
  action: string;
  detail: string | null;
  createdAt: string;
}

/** A page of the audit trail plus the total row count, for prev/next paging. */
export interface AuditLogPage {
  entries: AuditLogEntry[];
  total: number;
}

export interface ClientPrincipal {
  userId: string;
  userDetails: string;
  userRoles: string[];
  claims?: { typ: string; val: string }[];
}
