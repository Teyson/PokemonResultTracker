import type { HttpRequest, InvocationContext } from '@azure/functions';
import { eq, sql } from 'drizzle-orm';
import { getDb } from './db/client';
import { allowedUsers } from './db/schema';
import { ensureUser } from './db/userDirectory';

export interface ClientPrincipal {
  userId: string;
  userDetails: string;
  userRoles: string[];
}

/** Decode the Static Web Apps client principal from the request headers. */
export function getUser(request: HttpRequest): ClientPrincipal | null {
  const header = request.headers.get('x-ms-client-principal');
  if (!header) return null;
  try {
    const parsed = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
    if (!parsed?.userId) return null;
    // userDetails is guaranteed by the real GitHub provider, but the local SWA
    // CLI emulator sometimes omits it — normalize so callers never see undefined.
    return { ...parsed, userDetails: parsed.userDetails ?? '' };
  } catch {
    return null;
  }
}

type Db = Awaited<ReturnType<typeof getDb>>;

export interface Role {
  isAdmin: boolean;
  isMember: boolean;
}

/**
 * Resolve a signed-in principal's app-level role against the allowed_users
 * whitelist. Free-tier Static Web Apps can't run a `rolesSource` function
 * (Standard SKU only), so this check runs inside each Function instead of at
 * the platform level — routes only require the built-in "authenticated" role,
 * and the Function itself decides member/admin access.
 *
 * Admin is granted to the configured ADMIN_USER_ID (or, as a bootstrap
 * fallback before that's set, ADMIN_GITHUB_LOGIN). Everyone else is looked up
 * by userId, falling back to a pending invite matched by GitHub login and
 * bound to this userId on first login (see allowed_users' doc comment).
 *
 * On success this also upserts the caller into the users identity directory,
 * isolated so a directory write failure never denies access.
 */
export async function resolveRole(db: Db, userId: string, userDetailsRaw: string, context?: InvocationContext): Promise<Role> {
  const login = (userDetailsRaw ?? '').trim().toLowerCase();

  const adminUserId = (process.env.ADMIN_USER_ID ?? '').trim();
  const adminLogin = (process.env.ADMIN_GITHUB_LOGIN ?? '').trim().toLowerCase();
  const isAdmin = (adminUserId && userId && userId === adminUserId) || (adminLogin && login && login === adminLogin);

  let role: Role = { isAdmin: false, isMember: false };
  try {
    if (isAdmin) {
      role = { isAdmin: true, isMember: true };
    } else {
      const cols = { id: allowedUsers.id, role: allowedUsers.role, userId: allowedUsers.userId };

      let match: { id: number; role: string; userId: string | null } | undefined;
      if (userId) {
        match = (await db.select(cols).from(allowedUsers).where(eq(allowedUsers.userId, userId)))[0];
      }

      if (!match && login) {
        const candidate = (await db.select(cols).from(allowedUsers).where(sql`LOWER(${allowedUsers.githubLogin}) = ${login}`))[0];
        if (candidate) {
          if (!candidate.userId) {
            if (userId) await db.update(allowedUsers).set({ userId }).where(eq(allowedUsers.id, candidate.id));
            match = candidate;
          } else if (candidate.userId === userId) {
            match = candidate;
          }
        }
      }

      if (match) {
        role = match.role === 'admin' ? { isAdmin: true, isMember: true } : { isAdmin: false, isMember: true };
      }
    }

    if ((role.isAdmin || role.isMember) && userId) {
      try {
        await ensureUser(db, userId, userDetailsRaw);
      } catch (err) {
        context?.error('resolveRole user-directory upsert failed', err);
      }
    }
  } catch (err) {
    context?.error('resolveRole DB lookup failed', err);
    // Fail closed: no role rather than granting access on error.
    return { isAdmin: false, isMember: false };
  }

  return role;
}
