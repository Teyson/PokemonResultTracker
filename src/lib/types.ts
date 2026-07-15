export interface Night {
  id: string;
  date: string; // YYYY-MM-DD
  deck: string;
  type: string;
  w: number;
  t: number;
  l: number;
  notes: string | null;
}

export interface NightInput {
  date: string;
  deck: string;
  type: string;
  w: number;
  t: number;
  l: number;
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
