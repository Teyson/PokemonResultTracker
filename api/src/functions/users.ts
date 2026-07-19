import { app, type HttpRequest, type InvocationContext, type HttpResponseInit } from '@azure/functions';
import { eq, sql, asc } from 'drizzle-orm';
import { allowedUsers, users } from '../db/schema';
import { logAudit } from '../db/auditLog';
import { authenticate, type Db } from '../auth';
import { withDollarSuffix } from '../db/displayName';
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

/** Whether any *other* user's alias/login, or any *other* pending invite's login, already matches this candidate — used to find a free `$`-suffixed alias below. */
async function candidateInUse(db: Db, excludeUsersId: number, candidate: string): Promise<boolean> {
  const [userRows, pendingRows] = await Promise.all([
    db
      .select({ id: users.id })
      .from(users)
      .where(
        sql`${users.id} <> ${excludeUsersId} AND (LOWER(${users.alias}) = LOWER(${candidate}) OR LOWER(${users.githubLogin}) = LOWER(${candidate}))`
      ),
    db.select({ id: allowedUsers.id }).from(allowedUsers).where(sql`LOWER(${allowedUsers.githubLogin}) = LOWER(${candidate})`)
  ]);
  return userRows.length > 0 || pendingRows.length > 0;
}

/**
 * Real GitHub usernames always take priority over aliases: rather than
 * blocking a new member whose login collides with someone else's chosen
 * alias, bump the colliding alias out of the way by appending '$' — and keep
 * appending until it's actually free (a login can't itself contain '$', so
 * it can never collide with the renamed result). Capped well short of
 * anything reachable in practice; it's a safety valve, not an expected path.
 */
async function dollarSuffixedAlias(db: Db, excludeUsersId: number, baseAlias: string): Promise<string> {
  let candidate = withDollarSuffix(baseAlias, 1);
  for (let count = 1; count < 20 && (await candidateInUse(db, excludeUsersId, candidate)); count++) {
    candidate = withDollarSuffix(baseAlias, count + 1);
  }
  return candidate;
}

app.http('users', {
  methods: ['GET', 'POST', 'DELETE'],
  authLevel: 'anonymous',
  route: 'users/{id?}',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const idParam = request.params.id;
    const admin = (process.env.ADMIN_GITHUB_LOGIN ?? '').trim();
    try {
      const auth = await authenticate(request, context);
      if (!('isMember' in auth)) return auth;
      const { user: caller, db, isAdmin } = auth;
      if (!isAdmin) return { status: 403, jsonBody: { error: 'Admins only.' } };

      if (request.method === 'GET') {
        // Left join: a pending invite (no user_id bound yet, hasn't signed in)
        // has no users row to join, so alias comes back null — same as a
        // member who's never set one.
        const rows = await db
          .select({
            id: allowedUsers.id,
            github_login: allowedUsers.githubLogin,
            alias: users.alias,
            role: allowedUsers.role,
            created_at: allowedUsers.createdAt
          })
          .from(allowedUsers)
          .leftJoin(users, eq(users.userId, allowedUsers.userId))
          .orderBy(asc(allowedUsers.createdAt), asc(allowedUsers.id));

        // The admin isn't an allowed_users row, so their alias is looked up
        // separately — by the immutable ADMIN_USER_ID once set, else by a
        // login match during the bootstrap window (see auth.ts's resolveRole
        // for the same two-step admin identity).
        const adminUserId = (process.env.ADMIN_USER_ID ?? '').trim();
        let adminAlias: string | null = null;
        if (admin) {
          const adminRow = adminUserId
            ? (await db.select({ alias: users.alias }).from(users).where(eq(users.userId, adminUserId)))[0]
            : (await db.select({ alias: users.alias }).from(users).where(sql`LOWER(${users.githubLogin}) = LOWER(${admin})`))[0];
          adminAlias = adminRow?.alias ?? null;
        }

        const response: UsersResponse = {
          admin,
          adminAlias,
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

        // A brand-new login could collide with an existing member's chosen
        // alias. Real usernames always win: rename the colliding alias out of
        // the way (append '$') rather than ever blocking the add — adding a
        // player must always succeed.
        const collidingAliasRows = await db
          .select({ id: users.id, alias: users.alias })
          .from(users)
          .where(sql`LOWER(${users.alias}) = LOWER(${login})`);
        for (const row of collidingAliasRows) {
          const renamed = await dollarSuffixedAlias(db, row.id, row.alias as string);
          await db.update(users).set({ alias: renamed }).where(eq(users.id, row.id));
          await logAudit(
            db,
            caller,
            'user.alias.autorename',
            `Renamed "${row.alias}" to "${renamed}" — collided with new member ${login}`,
            context
          );
        }

        const addedBy = caller.userDetails ?? null;
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
        await logAudit(db, caller, 'user.add', `Added ${row.github_login}`, context);
        return {
          status: 201,
          jsonBody: { ...row, id: String(row.id), created_at: toDateOnly(row.created_at) }
        };
      }

      // DELETE
      if (!idParam) return { status: 400, jsonBody: { error: 'Missing user id.' } };
      const id = Number(idParam);
      const existing = await db
        .select({ id: allowedUsers.id, githubLogin: allowedUsers.githubLogin })
        .from(allowedUsers)
        .where(sql`${allowedUsers.id} = ${id} AND ${allowedUsers.role} <> 'admin'`);
      if (existing.length === 0) return { status: 404, jsonBody: { error: 'Member not found (or is an admin).' } };
      await db.delete(allowedUsers).where(eq(allowedUsers.id, id));
      await logAudit(db, caller, 'user.remove', `Removed ${existing[0].githubLogin}`, context);
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
