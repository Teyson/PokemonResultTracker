import { app, type HttpRequest, type InvocationContext, type HttpResponseInit } from '@azure/functions';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { allowedUsers } from '../db/schema';

/**
 * Custom roles function (rolesSource in staticwebapp.config.json).
 * Static Web Apps POSTs the signed-in user's identity (userId + userDetails)
 * here on every login and uses the returned roles for the session. We grant:
 *   - "admin" + "member"  to the configured admin (ADMIN_USER_ID)
 *   - "member"            to anyone the admin has whitelisted in allowed_users
 *   - nothing extra       to everyone else (they stay merely "authenticated")
 *
 * Identity is keyed on the immutable Static Web Apps userId, not the GitHub
 * login, so renaming a GitHub account never changes who is admin or who is a
 * member. Invites are still created by login (the only handle known before a
 * user first signs in); the matching row is "bound" to the user's userId the
 * first time they log in, and matched by userId from then on.
 *
 * Once wired as rolesSource, this endpoint can't be called from outside SWA.
 */
app.http('GetRoles', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'GetRoles',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    let body: { userId?: string; userDetails?: string } = {};
    try {
      body = (await request.json()) as { userId?: string; userDetails?: string };
    } catch {
      // empty body
    }

    const userId = (body.userId ?? '').trim();
    const login = (body.userDetails ?? '').trim().toLowerCase();

    const adminUserId = (process.env.ADMIN_USER_ID ?? '').trim();
    // Login is only a transitional safety net so you can't lock yourself out
    // before ADMIN_USER_ID is set. Once ADMIN_USER_ID is configured, identity is
    // purely id-based and ADMIN_GITHUB_LOGIN can be dropped.
    const adminLogin = (process.env.ADMIN_GITHUB_LOGIN ?? '').trim().toLowerCase();

    if ((adminUserId && userId && userId === adminUserId) || (adminLogin && login && login === adminLogin)) {
      return { jsonBody: { roles: ['admin', 'member'] } };
    }

    const roles: string[] = [];
    try {
      const db = await getDb();
      const cols = { id: allowedUsers.id, role: allowedUsers.role, userId: allowedUsers.userId };

      // Already bound: match by immutable userId.
      let match: { id: number; role: string; userId: string | null } | undefined;
      if (userId) {
        match = (await db.select(cols).from(allowedUsers).where(eq(allowedUsers.userId, userId)))[0];
      }

      // Not bound yet: match a pending invite by login and bind it to this userId.
      if (!match && login) {
        const candidate = (await db.select(cols).from(allowedUsers).where(sql`LOWER(${allowedUsers.githubLogin}) = ${login}`))[0];
        if (candidate) {
          if (!candidate.userId) {
            if (userId) await db.update(allowedUsers).set({ userId }).where(eq(allowedUsers.id, candidate.id));
            match = candidate;
          } else if (candidate.userId === userId) {
            match = candidate;
          }
          // else: this login is already bound to a different userId (it was
          // renamed/reassigned) — don't grant the new holder someone else's spot.
        }
      }

      if (match) {
        if (match.role === 'admin') roles.push('admin', 'member');
        else roles.push('member');
      }
    } catch (err) {
      context.error('GetRoles DB lookup failed', err);
      // Fail closed: no extra roles rather than granting access on error.
    }

    return { jsonBody: { roles } };
  }
});
