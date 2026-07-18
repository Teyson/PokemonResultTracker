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
  createdBy: string;
  matches?: MatchResponse[];
  // Only present on the admin scope=deleted view.
  deletedAt?: string;
}

export interface DeckSummaryResponse {
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

export interface AllowedUserResponse {
  id: string;
  github_login: string;
  role: 'member' | 'admin';
  created_at: string;
}

export interface UsersResponse {
  admin: string;
  users: AllowedUserResponse[];
}

/** A named partition of play, e.g. "Spring 2026". endsOn null means open-ended (current). */
export interface SeasonResponse {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string | null;
}

/** One player's season totals for the leaderboard — league nights only, never per-night detail. */
export interface LeaderboardEntryResponse {
  login: string;
  nights: number;
  w: number;
  t: number;
  l: number;
}

/** The league-wide top deck by PPG (min 3 nights) for a leaderboard scope, with its owner. */
export interface BestDeckResponse {
  deck: string;
  ownerLogin: string;
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
