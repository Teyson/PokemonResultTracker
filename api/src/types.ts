export interface MatchResponse {
  roundNo: number;
  result: 'W' | 'T' | 'L';
  opponentDeckId?: string;
  opponentDeck?: string;
  opponentType?: string;
  wentFirst?: boolean;
}

export interface NightResponse {
  id: string;
  date: string;
  deck: string;
  type: string;
  w: number;
  t: number;
  l: number;
  notes: string | null;
  isLeagueNight: boolean;
  // Which named league this night belongs to; null for casual nights. Kept in
  // sync with isLeagueNight (leagueId set <=> isLeagueNight = true) by nights.ts.
  leagueId: string | null;
  createdBy: string;
  // The owner's alias if they've set one, else the same value as createdBy —
  // use this (not createdBy) whenever the owner's name is shown to other
  // players; createdBy stays the real GitHub login for grouping/matching.
  createdByDisplay: string;
  matches?: MatchResponse[];
  // Only present on the admin scope=deleted view.
  deletedAt?: string;
}

export interface DeckSummaryResponse {
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

export interface AllowedUserResponse {
  id: string;
  github_login: string;
  // The member's alias if they've signed in and set one, else null (also
  // null for a pending invite that hasn't signed in yet). Admin-only view —
  // shown alongside github_login, never in place of it.
  alias: string | null;
  role: 'member' | 'admin';
  created_at: string;
}

export interface UsersResponse {
  admin: string;
  // The admin's own alias, looked up separately since the admin is defined by
  // env vars rather than an allowed_users row.
  adminAlias: string | null;
  users: AllowedUserResponse[];
}

/** A named partition of play, e.g. "Spring 2026". endsOn null means open-ended (current). */
export interface SeasonResponse {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string | null;
  // The league this season belongs to — each league runs its own calendar.
  leagueId: string;
}

/** A named competitive context, e.g. "Tuesday League". archivedAt null means active (visible in pickers). */
export interface LeagueResponse {
  id: string;
  name: string;
  archivedAt: string | null;
}

/** One player's season totals for the leaderboard — league nights only, never per-night detail. */
export interface LeaderboardEntryResponse {
  login: string;
  // The player's alias if set, else the same value as login. Use this for display.
  displayName: string;
  nights: number;
  w: number;
  t: number;
  l: number;
}

/** The league-wide top deck by PPG (min 3 nights) for a leaderboard scope, with its owner. */
export interface BestDeckResponse {
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
export interface LeaderboardResponse {
  entries: LeaderboardEntryResponse[];
  bestDeck: BestDeckResponse | null;
}

/** One admin/mutating action recorded to the audit trail. */
export interface AuditLogEntryResponse {
  id: string;
  actorLogin: string | null;
  action: string;
  detail: string | null;
  createdAt: string;
}

/** A page of the audit trail plus the total row count, for prev/next paging. */
export interface AuditLogResponse {
  entries: AuditLogEntryResponse[];
  total: number;
}
