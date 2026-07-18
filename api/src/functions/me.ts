import { app, type HttpRequest, type InvocationContext, type HttpResponseInit } from '@azure/functions';
import { z } from 'zod';
import { and, eq, ne, or, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { users } from '../db/schema';
import { ensureUser } from '../db/userDirectory';
import { getUser, resolveRole } from '../auth';

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
 */

const MAX_ALIAS_LENGTH = 50;

// Empty/whitespace-only input clears the alias (alias: null), same as omitting it.
const aliasInputSchema = z.object({
  alias: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() ? v.trim() : null),
    z.string().max(MAX_ALIAS_LENGTH, `Alias must be ${MAX_ALIAS_LENGTH} characters or fewer.`).nullable()
  )
});

type Db = Awaited<ReturnType<typeof getDb>>;

/**
 * Case-insensitive collision check against every other user's current alias
 * or GitHub login, so a chosen alias can never read as impersonating a real
 * member elsewhere in the app (leaderboard, opponent deck lists, etc.).
 */
async function aliasCollision(db: Db, ownUsersId: number, alias: string): Promise<boolean> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        ne(users.id, ownUsersId),
        or(sql`LOWER(${users.alias}) = LOWER(${alias})`, sql`LOWER(${users.githubLogin}) = LOWER(${alias})`)
      )
    );
  return rows.length > 0;
}

app.http('me', {
  methods: ['GET', 'PUT'],
  authLevel: 'anonymous',
  route: 'me',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const user = getUser(request);
    if (!user) return { status: 401, jsonBody: { error: 'Unauthorized.' } };

    const db = await getDb();
    const { isAdmin, isMember } = await resolveRole(db, user.userId, user.userDetails, context);

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
    if (alias !== null && (await aliasCollision(db, ownUsersId, alias))) {
      return { status: 409, jsonBody: { error: 'That alias is already taken.' } };
    }
    await db.update(users).set({ alias }).where(eq(users.id, ownUsersId));
    return { jsonBody: { alias } };
  }
});
