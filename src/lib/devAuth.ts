import type { ClientPrincipal } from './types';

/**
 * Local-only login bypass for testing the member/admin UI without fighting
 * the SWA CLI's broken GitHub-login emulation. Gated two ways:
 *  1. VITE_LOCAL_DEV_LOGIN is only ever "true" via a gitignored .env.local —
 *     a fresh checkout (including the real Azure deploy) never has it set.
 *  2. Even if that somehow leaked, this only activates on localhost/127.0.0.1.
 * It only ever fabricates the frontend's own ClientPrincipal — every /api/*
 * call still goes through the real Azure Functions, which don't trust
 * anything the client claims, so this cannot bypass real server-side auth.
 */
export const DEV_LOGIN_ENABLED =
  import.meta.env.VITE_LOCAL_DEV_LOGIN === 'true' &&
  (typeof location === 'undefined' || ['localhost', '127.0.0.1'].includes(location.hostname));

const STORAGE_KEY = 'pokemon-tracker-dev-principal';

export type DevRole = 'anonymous' | 'pending' | 'member' | 'admin';

export function buildDevPrincipal(role: DevRole, username: string): ClientPrincipal | null {
  if (role === 'anonymous') return null;
  const roles = role === 'admin' ? ['admin', 'member'] : role === 'member' ? ['member'] : [];
  return { userId: `dev-${username}`, userDetails: username, userRoles: roles, claims: [] };
}

export function loadDevPrincipal(): ClientPrincipal | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ClientPrincipal;
  } catch {
    return null;
  }
}

export function saveDevPrincipal(principal: ClientPrincipal | null) {
  if (principal) localStorage.setItem(STORAGE_KEY, JSON.stringify(principal));
  else localStorage.removeItem(STORAGE_KEY);
}
