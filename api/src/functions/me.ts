import { app, type HttpRequest, type InvocationContext, type HttpResponseInit } from '@azure/functions';
import { z } from 'zod';
import { and, eq, isNull, ne, or, sql } from 'drizzle-orm';
import { users, allowedUsers } from '../db/schema';
import { ensureUser } from '../db/userDirectory';
import { authenticate, type Db } from '../auth';
import { MAX_ALIAS_LENGTH } from '../db/displayName';

/**
 * /api/me — tells the frontend the caller's app-level role, and lets a member
 * manage their own alias (the display name shown to other players instead of
 * their GitHub login — see users.alias in db/schema.ts).
 *
 *   GET /api/me -> { isAdmin, isMember, userId, githubLogin, alias }
 *   PUT /api/me -> set/clear the caller's own alias (member only;
 *                  body: { alias: string | null })
 *
 * Free-tier Static Web Apps can't run a `rolesSource` function to stamp
 * member/admin onto the session (Standard SKU only), so
 * `x-ms-client-principal.userRoles` here only ever holds the built-in
 * "authenticated" role. The frontend calls GET instead of reading userRoles
 * to find out if it's looking at a member, an admin, or a signed-in-but-not-
 * yet-whitelisted ("pending") user.
 *
 * Real GitHub usernames always take priority over aliases: a login can never
 * be blocked by an existing alias (see the auto-rename in functions/users.ts)
 * — but the reverse still holds here, an alias can't be set to something that
 * collides with an existing login or alias.
 */

// Empty/whitespace-only input clears the alias (alias: null), same as omitting it.
const aliasInputSchema = z.object({
  alias: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() ? v.trim() : null),
    z.string().max(MAX_ALIAS_LENGTH, `Alias must be ${MAX_ALIAS_LENGTH} characters or fewer.`).nullable()
  )
});

/**
 * Case-insensitive collision check against every other user's current alias
 * or GitHub login, so a chosen alias can never read as impersonating a real
 * member elsewhere in the app (leaderboard, opponent deck lists, etc.). Also
 * checks pending invites' GitHub logins (allowed_users rows with no users row
 * yet, since they haven't signed in) and the env-var admin bootstrap login,
 * so an alias can't squat a name that's about to become someone's real login
 * either. Excludes the caller's own rows throughout, so setting your alias to
 * (redundantly) your own login is a no-op, not a false "taken" error.
 */
async function aliasCollision(db: Db, callerUserId: string, ownUsersId: number, alias: string): Promise<boolean> {
  const adminLogin = (process.env.ADMIN_GITHUB_LOGIN ?? '').trim();
  const adminUserId = (process.env.ADMIN_USER_ID ?? '').trim();
  const callerIsAdminLogin = adminUserId ? adminUserId === callerUserId : false;
  if (adminLogin && !callerIsAdminLogin && adminLogin.toLowerCase() === alias.toLowerCase()) return true;

  const [userRows, pendingRows] = await Promise.all([
    db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          ne(users.id, ownUsersId),
          or(sql`LOWER(${users.alias}) = LOWER(${alias})`, sql`LOWER(${users.githubLogin}) = LOWER(${alias})`)
        )
      ),
    db
      .select({ id: allowedUsers.id })
      .from(allowedUsers)
      .where(
        and(
          // NULL userId (not-yet-signed-in invite) is never "the caller" —
          // ne() alone would silently exclude those rows under SQL's
          // three-valued NULL logic, defeating the whole point of this check.
          or(isNull(allowedUsers.userId), ne(allowedUsers.userId, callerUserId)),
          sql`LOWER(${allowedUsers.githubLogin}) = LOWER(${alias})`
        )
      )
  ]);
  return userRows.length > 0 || pendingRows.length > 0;
}

app.http('me', {
  methods: ['GET', 'PUT'],
  authLevel: 'anonymous',
  route: 'me',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const auth = await authenticate(request, context);
    if (!('isMember' in auth)) return auth;
    const { user, db, isAdmin, isMember } = auth;

    if (request.method === 'GET') {
      let alias: string | null = null;
      if (isMember) {
        const row = (await db.select({ alias: users.alias }).from(users).where(eq(users.userId, user.userId)))[0];
        alias = row?.alias ?? null;
      }
      return { jsonBody: { isAdmin, isMember, userId: user.userId, githubLogin: user.userDetails, alias } };
    }

    // PUT — set or clear the caller's own alias only; there is no path here
    // (or anywhere) for setting anyone else's.
    if (!isMember) return { status: 403, jsonBody: { error: 'You do not have access to this app.' } };

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: 'Invalid JSON body.' } };
    }
    const parsed = aliasInputSchema.safeParse(raw);
    if (!parsed.success) {
      return { status: 400, jsonBody: { error: parsed.error.issues[0]?.message ?? 'Invalid request body.' } };
    }

    const ownUsersId = await ensureUser(db, user.userId, user.userDetails);
    const alias = parsed.data.alias;
    if (alias !== null && (await aliasCollision(db, user.userId, ownUsersId, alias))) {
      return { status: 409, jsonBody: { error: 'That alias is already taken.' } };
    }
    await db.update(users).set({ alias }).where(eq(users.id, ownUsersId));
    return { jsonBody: { alias } };
  }
});
