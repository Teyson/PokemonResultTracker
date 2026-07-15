import { app, type HttpRequest, type InvocationContext, type HttpResponseInit } from '@azure/functions';
import { sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { allowedUsers } from '../db/schema';

/**
 * Custom roles function (rolesSource in staticwebapp.config.json).
 * Static Web Apps POSTs the signed-in user's identity here on every login and
 * uses the returned roles for the session. We grant:
 *   - "admin" + "member"  to the configured ADMIN_GITHUB_LOGIN
 *   - "member"            to anyone the admin has whitelisted in allowed_users
 *   - nothing extra       to everyone else (they stay merely "authenticated")
 *
 * Once wired as rolesSource, this endpoint can't be called from outside SWA.
 */
app.http('GetRoles', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'GetRoles',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    let body: { userDetails?: string } = {};
    try {
      body = (await request.json()) as { userDetails?: string };
    } catch {
      // empty body
    }

    const login = (body.userDetails ?? '').trim().toLowerCase();
    const admin = (process.env.ADMIN_GITHUB_LOGIN ?? '').trim().toLowerCase();

    if (login && login === admin) {
      return { jsonBody: { roles: ['admin', 'member'] } };
    }

    const roles: string[] = [];
    if (login) {
      try {
        const db = await getDb();
        const rows = await db
          .select({ role: allowedUsers.role })
          .from(allowedUsers)
          .where(sql`LOWER(${allowedUsers.githubLogin}) = ${login}`);
        if (rows[0]) {
          if (rows[0].role === 'admin') roles.push('admin', 'member');
          else roles.push('member');
        }
      } catch (err) {
        context.error('GetRoles DB lookup failed', err);
        // Fail closed: no extra roles rather than granting access on error.
      }
    }

    return { jsonBody: { roles } };
  }
});
