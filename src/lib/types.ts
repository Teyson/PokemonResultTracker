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

export interface ClientPrincipal {
  userId: string;
  userDetails: string;
  userRoles: string[];
  claims?: { typ: string; val: string }[];
}
