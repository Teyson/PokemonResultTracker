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
  // The owner's alias if set, else the same value as createdBy. Use this
  // (not createdBy) whenever the owner's name is shown to other players.
  createdByDisplay: string;
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
  // The owner's alias if set, else ownerLogin; null when unowned. Use this for display.
  ownerDisplayName: string | null;
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
  // The member's alias if they've signed in and set one, else null.
  alias: string | null;
  role: 'member' | 'admin';
  created_at: string;
}

export interface UsersResponse {
  admin: string;
  // The admin's own alias, looked up separately since the admin is defined by
  // env vars rather than an allowed_users row.
  adminAlias: string | null;
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
  // The player's alias if set, else the same value as login. Use this for display.
  displayName: string;
  nights: number;
  w: number;
  t: number;
  l: number;
}

/** The league-wide top deck by PPG (more than 3 nights logged) for a leaderboard scope, with its owner. */
export interface BestDeck {
  deck: string;
  ownerLogin: string;
  // The owner's alias if set, else ownerLogin. Use this for display.
  ownerDisplayName: string;
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

/** GET /api/me response. */
export interface Me {
  isAdmin: boolean;
  isMember: boolean;
  userId: string;
  githubLogin: string;
  alias: string | null;
}

/** Shared shape of the 'auth' context set in +layout.svelte and read via getContext on every route. */
export interface AuthContext {
  principal: ClientPrincipal | null;
  loading: boolean;
  isMember: boolean;
  isAdmin: boolean;
  // The signed-in member's own alias (null if unset) — kept in sync with
  // /api/me and mutated in place by the profile page after a save, so every
  // page sharing this context reflects a change without a refetch.
  alias: string | null;
}
