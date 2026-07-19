import { app, type HttpRequest, type InvocationContext, type HttpResponseInit } from '@azure/functions';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../db/client';
import { events, leagues, users } from '../db/schema';
import { displayName } from '../db/displayName';
import { logAudit } from '../db/auditLog';
import { authenticate } from '../auth';
import type { EventResponse } from '../types';

/**
 * /api/events — league nights as a shared entity (idea 39), managed from the
 * /events page. Foundation for pairings/check-in/live reporting (future
 * ideas) to hang off; gated on plain isAdmin rather than a league-admin role,
 * since that role doesn't exist yet (see idea 39's correction note).
 *
 *   GET    /api/events            -> EventResponse[] (member; all leagues, newest playedOn first — client filters by active league)
 *   GET    /api/events/{id}       -> EventResponse (member)
 *   POST   /api/events            -> admin: create (body: { name?, playedOn, bestOf?, roundLengthMin?, leagueId }), status starts at 'setup'
 *   PUT    /api/events/{id}       -> admin: edit the same shape (status unchanged)
 *   POST   /api/events/{id}/start  -> admin: setup -> live
 *   POST   /api/events/{id}/finish -> admin: live -> done
 *   DELETE /api/events/{id}       -> admin: only while status is 'setup'
 *
 * No FK from nights to here yet — a future bridge (idea 50) links them, same
 * derive-at-read-time stance nights/seasons already use for league scoping.
 */

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');

const eventSchema = z.object({
  name: z.string().trim().max(100, 'Event name is too long.').optional().nullable(),
  playedOn: dateSchema,
  bestOf: z
    .number()
    .int()
    .refine((v) => v === 1 || v === 3, 'Best of must be 1 or 3.')
    .optional(),
  roundLengthMin: z.number().int().min(1, 'Round length must be at least 1 minute.').max(180, 'Round length is too long.').optional(),
  leagueId: z.number().int()
});

type Db = Awaited<ReturnType<typeof getDb>>;

const SELECT_COLUMNS = {
  id: events.id,
  name: events.name,
  playedOn: events.playedOn,
  bestOf: events.bestOf,
  roundLengthMin: events.roundLengthMin,
  status: events.status,
  leagueId: events.leagueId,
  createdBy: users.githubLogin,
  createdByAlias: users.alias,
  createdAt: events.createdAt
};

function toResponse(row: {
  id: number;
  name: string | null;
  playedOn: string;
  bestOf: number;
  roundLengthMin: number;
  status: string;
  leagueId: number;
  createdBy: string;
  createdByAlias: string | null;
  createdAt: Date;
}): EventResponse {
  return {
    id: String(row.id),
    name: row.name,
    playedOn: row.playedOn,
    bestOf: row.bestOf,
    roundLengthMin: row.roundLengthMin,
    status: row.status as EventResponse['status'],
    leagueId: String(row.leagueId),
    createdBy: row.createdBy,
    createdByDisplay: displayName(row.createdBy, row.createdByAlias),
    createdAt: row.createdAt.toISOString()
  };
}

async function loadOne(db: Db, id: number) {
  const rows = await db.select(SELECT_COLUMNS).from(events).innerJoin(users, eq(users.id, events.createdBy)).where(eq(events.id, id));
  return rows[0];
}

app.http('events', {
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  authLevel: 'anonymous',
  route: 'events/{id?}/{action?}',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const idParam = request.params.id;
    const actionParam = request.params.action;
    try {
      if (actionParam && !(request.method === 'POST' && (actionParam === 'start' || actionParam === 'finish'))) {
        return { status: 400, jsonBody: { error: 'Unknown action.' } };
      }
      const auth = await authenticate(request, context);
      if (!('isMember' in auth)) return auth;
      const { user, db, isAdmin, isMember } = auth;
      if (!isMember) return { status: 403, jsonBody: { error: 'You do not have access to this app.' } };

      if (request.method === 'GET' && !idParam) {
        const rows = await db.select(SELECT_COLUMNS).from(events).innerJoin(users, eq(users.id, events.createdBy)).orderBy(desc(events.playedOn), desc(events.id));
        return { jsonBody: rows.map(toResponse) };
      }

      if (request.method === 'GET') {
        const row = await loadOne(db, Number(idParam));
        if (!row) return { status: 404, jsonBody: { error: 'Event not found.' } };
        return { jsonBody: toResponse(row) };
      }

      // Every remaining route (POST create/start/finish, PUT, DELETE) is an admin mutation.
      if (!isAdmin) return { status: 403, jsonBody: { error: 'Admins only.' } };

      if (request.method === 'POST' && !idParam) {
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return { status: 400, jsonBody: { error: 'Invalid JSON body.' } };
        }
        const parsed = eventSchema.safeParse(raw);
        if (!parsed.success) {
          return { status: 400, jsonBody: { error: parsed.error.issues[0]?.message ?? 'Invalid request body.' } };
        }
        const { name, playedOn, bestOf, roundLengthMin, leagueId } = parsed.data;
        const league = (await db.select({ id: leagues.id }).from(leagues).where(eq(leagues.id, leagueId)))[0];
        if (!league) return { status: 400, jsonBody: { error: 'League not found.' } };
        const creator = (await db.select({ id: users.id }).from(users).where(eq(users.userId, user.userId)))[0];
        if (!creator) return { status: 500, jsonBody: { error: 'Could not resolve your user record.' } };
        const inserted = await db
          .insert(events)
          .output({ id: events.id })
          .values({
            name: name || null,
            playedOn,
            bestOf: bestOf ?? 1,
            roundLengthMin: roundLengthMin ?? 30,
            leagueId,
            createdBy: creator.id
          });
        const row = await loadOne(db, inserted[0].id);
        await logAudit(db, user, 'event.create', `Created event "${name || playedOn}"`, context);
        return { status: 201, jsonBody: toResponse(row!) };
      }

      if (!idParam) return { status: 400, jsonBody: { error: 'Missing event id.' } };
      const id = Number(idParam);
      const existing = await loadOne(db, id);
      if (!existing) return { status: 404, jsonBody: { error: 'Event not found.' } };

      if (request.method === 'PUT') {
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return { status: 400, jsonBody: { error: 'Invalid JSON body.' } };
        }
        const parsed = eventSchema.safeParse(raw);
        if (!parsed.success) {
          return { status: 400, jsonBody: { error: parsed.error.issues[0]?.message ?? 'Invalid request body.' } };
        }
        const { name, playedOn, bestOf, roundLengthMin, leagueId } = parsed.data;
        const league = (await db.select({ id: leagues.id }).from(leagues).where(eq(leagues.id, leagueId)))[0];
        if (!league) return { status: 400, jsonBody: { error: 'League not found.' } };
        await db
          .update(events)
          .set({ name: name || null, playedOn, bestOf: bestOf ?? 1, roundLengthMin: roundLengthMin ?? 30, leagueId })
          .where(eq(events.id, id));
        await logAudit(db, user, 'event.update', `Updated event "${existing.name || existing.playedOn}"`, context);
        const row = await loadOne(db, id);
        return { jsonBody: toResponse(row!) };
      }

      if (request.method === 'POST' && actionParam === 'start') {
        if (existing.status !== 'setup') {
          return { status: 400, jsonBody: { error: `Can't start an event that is already ${existing.status}.` } };
        }
        await db.update(events).set({ status: 'live' }).where(eq(events.id, id));
        await logAudit(db, user, 'event.start', `Started event "${existing.name || existing.playedOn}"`, context);
        const row = await loadOne(db, id);
        return { jsonBody: toResponse(row!) };
      }

      if (request.method === 'POST' && actionParam === 'finish') {
        if (existing.status !== 'live') {
          return { status: 400, jsonBody: { error: `Can't finish an event that is ${existing.status}, not live.` } };
        }
        await db.update(events).set({ status: 'done' }).where(eq(events.id, id));
        await logAudit(db, user, 'event.finish', `Finished event "${existing.name || existing.playedOn}"`, context);
        const row = await loadOne(db, id);
        return { jsonBody: toResponse(row!) };
      }

      if (request.method === 'DELETE') {
        if (existing.status !== 'setup') {
          return { status: 400, jsonBody: { error: "Only an event still in setup can be deleted — it already has history." } };
        }
        await db.delete(events).where(eq(events.id, id));
        await logAudit(db, user, 'event.delete', `Deleted event "${existing.name || existing.playedOn}"`, context);
        return { status: 204 };
      }

      return { status: 400, jsonBody: { error: 'Unknown action.' } };
    } catch (err) {
      context.error('events handler failed', err);
      return {
        status: 500,
        jsonBody: {
          error: 'Database error. If the app was idle, the database may be waking up — try again in a few seconds.'
        }
      };
    }
  }
});
