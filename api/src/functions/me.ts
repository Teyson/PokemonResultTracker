import { app, type HttpRequest, type InvocationContext, type HttpResponseInit } from '@azure/functions';
import { getDb } from '../db/client';
import { getUser, resolveRole } from '../auth';

/**
 * /api/me — tells the frontend the caller's app-level role. Free-tier Static
 * Web Apps can't run a `rolesSource` function to stamp member/admin onto the
 * session (Standard SKU only), so `x-ms-client-principal.userRoles` here only
 * ever holds the built-in "authenticated" role. The frontend calls this
 * instead of reading userRoles to find out if it's looking at a member, an
 * admin, or a signed-in-but-not-yet-whitelisted ("pending") user.
 */
app.http('me', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'me',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const user = getUser(request);
    if (!user) return { status: 401, jsonBody: { error: 'Unauthorized.' } };

    const db = await getDb();
    const { isAdmin, isMember } = await resolveRole(db, user.userId, user.userDetails, context);
    return { jsonBody: { isAdmin, isMember, userId: user.userId, githubLogin: user.userDetails } };
  }
});
