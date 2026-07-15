import { app, type HttpRequest, type InvocationContext, type HttpResponseInit } from '@azure/functions';
import { eq, sql, asc } from 'drizzle-orm';
import { getDb } from '../db/client';
import { allowedUsers } from '../db/schema';
import { getUser, resolveRole } from '../auth';
import type { UsersResponse } from '../types';

/**
 * /api/users — the member whitelist. Admin only. Free tier can't gate this at
 * the platform level (allowedRoles only sees "authenticated" here), so this
 * handler resolves the real role itself via resolveRole() and rejects non-admins.
 *
 *   GET    /api/users        -> { admin, users: AllowedUserResponse[] }
 *   POST   /api/users        -> add a member   (body: { github_login })
 *   DELETE /api/users/{id}   -> remove a member
 *
 * The admin themselves is defined by ADMIN_USER_ID (or, before that's set, the
 * ADMIN_GITHUB_LOGIN bootstrap fallback), not by a table row, so the admin
 * always has access even before the DB has any rows.
 */

const LOGIN_PATTERN = /^[A-Za-z0-9-]{1,39}$/;

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

app.http('users', {
  methods: ['GET', 'POST', 'DELETE'],
  authLevel: 'anonymous',
  route: 'users/{id?}',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const idParam = request.params.id;
    const admin = (process.env.ADMIN_GITHUB_LOGIN ?? '').trim();
    try {
      const caller = getUser(request);
      if (!caller) return { status: 401, jsonBody: { error: 'Unauthorized.' } };

      const db = await getDb();
      const { isAdmin } = await resolveRole(db, caller.userId, caller.userDetails, context);
      if (!isAdmin) return { status: 403, jsonBody: { error: 'Admins only.' } };

      if (request.method === 'GET') {
        const rows = await db
          .select({
            id: allowedUsers.id,
            github_login: allowedUsers.githubLogin,
            role: allowedUsers.role,
            created_at: allowedUsers.createdAt
          })
          .from(allowedUsers)
          .orderBy(asc(allowedUsers.createdAt), asc(allowedUsers.id));
        const response: UsersResponse = {
          admin,
          users: rows.map((r) => ({ ...r, id: String(r.id), role: r.role as 'member' | 'admin', created_at: toDateOnly(r.created_at) }))
        };
        return { jsonBody: response };
      }

      if (request.method === 'POST') {
        let raw: { github_login?: string } = {};
        try {
          raw = (await request.json()) as { github_login?: string };
        } catch {
          return { status: 400, jsonBody: { error: 'Invalid JSON body.' } };
        }
        const login = (raw.github_login ?? '').trim().replace(/^@/, '');
        if (!login || !LOGIN_PATTERN.test(login)) {
          return { status: 400, jsonBody: { error: 'Enter a valid GitHub username (letters, numbers and hyphens).' } };
        }
        if (login.toLowerCase() === admin.toLowerCase()) {
          return { status: 400, jsonBody: { error: 'That user is already the admin.' } };
        }

        const existing = await db
          .select({ id: allowedUsers.id })
          .from(allowedUsers)
          .where(sql`LOWER(${allowedUsers.githubLogin}) = LOWER(${login})`);
        if (existing.length) {
          return { status: 409, jsonBody: { error: `${login} is already on the list.` } };
        }

        const me = getUser(request);
        const addedBy = me?.userDetails ?? null;
        const inserted = await db
          .insert(allowedUsers)
          .output({
            id: allowedUsers.id,
            github_login: allowedUsers.githubLogin,
            role: allowedUsers.role,
            created_at: allowedUsers.createdAt
          })
          .values({ githubLogin: login, role: 'member', addedBy });
        const row = inserted[0];
        return {
          status: 201,
          jsonBody: { ...row, id: String(row.id), created_at: toDateOnly(row.created_at) }
        };
      }

      // DELETE
      if (!idParam) return { status: 400, jsonBody: { error: 'Missing user id.' } };
      const id = Number(idParam);
      const existing = await db
        .select({ id: allowedUsers.id })
        .from(allowedUsers)
        .where(sql`${allowedUsers.id} = ${id} AND ${allowedUsers.role} <> 'admin'`);
      if (existing.length === 0) return { status: 404, jsonBody: { error: 'Member not found (or is an admin).' } };
      await db.delete(allowedUsers).where(eq(allowedUsers.id, id));
      return { status: 204 };
    } catch (err) {
      context.error('users handler failed', err);
      return {
        status: 500,
        jsonBody: {
          error: 'Database error. If the app was idle, the database may be waking up — try again in a few seconds.'
        }
      };
    }
  }
});
