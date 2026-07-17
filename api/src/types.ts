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
