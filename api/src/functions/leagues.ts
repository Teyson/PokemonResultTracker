import { app, type HttpRequest, type InvocationContext, type HttpResponseInit } from '@azure/functions';
import { asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../db/client';
import { leagues } from '../db/schema';
import { defaultLeagueId } from '../db/leagues';
import { logAudit } from '../db/auditLog';
import { getUser, resolveRole } from '../auth';
import type { LeagueResponse } from '../types';

/**
 * /api/leagues — named competitive contexts (e.g. "Tuesday League", "Summer
 * Cup 2026"), managed from the /leagues admin page.
 *
 *   GET   /api/leagues            -> LeagueResponse[] (member; unarchived first, then archived, each by name)
 *   POST  /api/leagues            -> admin: create (body: { name })
 *   PUT   /api/leagues/{id}       -> admin: rename (body: { name })
 *   POST  /api/leagues/{id}/archive   -> admin: archive (hide from pickers, keep history)
 *   POST  /api/leagues/{id}/unarchive -> admin: reveal again
 *
 * No DELETE — a league that ever had a night logged against it can't lose its
 * history, so archive is the only retirement path (same stance as #68 deck
 * retirement). The default league (lowest unarchived id) can't be archived —
 * it anchors the night-form default and the leaderboard/awards default scope.
 */

const nameSchema = z.object({
  name: z.string().trim().min(1, 'A league name is required.').max(100, 'League name is too long.')
});

type Db = Awaited<ReturnType<typeof getDb>>;

function toResponse(r: { id: number; name: string; archivedAt: Date | null }): LeagueResponse {
  return { id: String(r.id), name: r.name, archivedAt: r.archivedAt ? r.archivedAt.toISOString() : null };
}

/** Case-insensitive name collision check, excluding a given id on edit. */
async function nameCollision(db: Db, name: string, excludeId: number): Promise<boolean> {
  const rows = await db
    .select({ id: leagues.id })
    .from(leagues)
    .where(sql`LOWER(${leagues.name}) = LOWER(${name}) AND ${leagues.id} != ${excludeId}`);
  return rows.length > 0;
}

app.http('leagues', {
  methods: ['GET', 'POST', 'PUT'],
  authLevel: 'anonymous',
  route: 'leagues/{id?}/{action?}',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const idParam = request.params.id;
    const actionParam = request.params.action;
    try {
      if (actionParam && !(request.method === 'POST' && (actionParam === 'archive' || actionParam === 'unarchive'))) {
        return { status: 400, jsonBody: { error: 'Unknown action.' } };
      }
      const user = getUser(request);
      if (!user) return { status: 401, jsonBody: { error: 'Unauthorized.' } };

      const db = await getDb();
      const { isAdmin, isMember } = await resolveRole(db, user.userId, user.userDetails, context);
      if (!isMember) return { status: 403, jsonBody: { error: 'You do not have access to this app.' } };

      if (request.method === 'GET') {
        const rows = await db
          .select({ id: leagues.id, name: leagues.name, archivedAt: leagues.archivedAt })
          .from(leagues)
          .orderBy(sql`CASE WHEN ${leagues.archivedAt} IS NULL THEN 0 ELSE 1 END`, asc(leagues.name));
        return { jsonBody: rows.map(toResponse) };
      }

      // Every remaining route (POST create/archive/unarchive, PUT) is an admin mutation.
      if (!isAdmin) return { status: 403, jsonBody: { error: 'Admins only.' } };

      if (request.method === 'POST' && !idParam) {
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return { status: 400, jsonBody: { error: 'Invalid JSON body.' } };
        }
        const parsed = nameSchema.safeParse(raw);
        if (!parsed.success) {
          return { status: 400, jsonBody: { error: parsed.error.issues[0]?.message ?? 'Invalid request body.' } };
        }
        const { name } = parsed.data;
        if (await nameCollision(db, name, -1)) {
          return { status: 409, jsonBody: { error: `A league named "${name}" already exists.` } };
        }
        const inserted = await db
          .insert(leagues)
          .output({ id: leagues.id, name: leagues.name, archivedAt: leagues.archivedAt })
          .values({ name });
        await logAudit(db, user, 'league.create', `Created "${name}"`, context);
        return { status: 201, jsonBody: toResponse(inserted[0]) };
      }

      if (!idParam) return { status: 400, jsonBody: { error: 'Missing league id.' } };
      const id = Number(idParam);
      const existing = (await db.select({ id: leagues.id, name: leagues.name, archivedAt: leagues.archivedAt }).from(leagues).where(eq(leagues.id, id)))[0];
      if (!existing) return { status: 404, jsonBody: { error: 'League not found.' } };

      if (request.method === 'PUT') {
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return { status: 400, jsonBody: { error: 'Invalid JSON body.' } };
        }
        const parsed = nameSchema.safeParse(raw);
        if (!parsed.success) {
          return { status: 400, jsonBody: { error: parsed.error.issues[0]?.message ?? 'Invalid request body.' } };
        }
        const { name } = parsed.data;
        if (await nameCollision(db, name, id)) {
          return { status: 409, jsonBody: { error: `A league named "${name}" already exists.` } };
        }
        await db.update(leagues).set({ name }).where(eq(leagues.id, id));
        if (existing.name !== name) {
          await logAudit(db, user, 'league.rename', `Renamed "${existing.name}" to "${name}"`, context);
        }
        const rows = await db.select({ id: leagues.id, name: leagues.name, archivedAt: leagues.archivedAt }).from(leagues).where(eq(leagues.id, id));
        return { jsonBody: toResponse(rows[0]) };
      }

      if (request.method === 'POST' && actionParam === 'archive') {
        if (existing.archivedAt) return { jsonBody: toResponse(existing) };
        const defaultId = await defaultLeagueId(db);
        if (defaultId === id) {
          return { status: 400, jsonBody: { error: 'The default league can\'t be archived — it anchors form defaults and standings.' } };
        }
        await db.update(leagues).set({ archivedAt: new Date() }).where(eq(leagues.id, id));
        await logAudit(db, user, 'league.archive', `Archived "${existing.name}"`, context);
        const rows = await db.select({ id: leagues.id, name: leagues.name, archivedAt: leagues.archivedAt }).from(leagues).where(eq(leagues.id, id));
        return { jsonBody: toResponse(rows[0]) };
      }

      if (request.method === 'POST' && actionParam === 'unarchive') {
        if (!existing.archivedAt) return { jsonBody: toResponse(existing) };
        await db.update(leagues).set({ archivedAt: null }).where(eq(leagues.id, id));
        await logAudit(db, user, 'league.unarchive', `Unarchived "${existing.name}"`, context);
        const rows = await db.select({ id: leagues.id, name: leagues.name, archivedAt: leagues.archivedAt }).from(leagues).where(eq(leagues.id, id));
        return { jsonBody: toResponse(rows[0]) };
      }

      return { status: 400, jsonBody: { error: 'Unknown action.' } };
    } catch (err) {
      context.error('leagues handler failed', err);
      return {
        status: 500,
        jsonBody: {
          error: 'Database error. If the app was idle, the database may be waking up — try again in a few seconds.'
        }
      };
    }
  }
});
