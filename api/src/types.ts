export interface MatchResponse {
  roundNo: number;
  result: 'W' | 'T' | 'L';
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
  createdBy: string;
  matches?: MatchResponse[];
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
