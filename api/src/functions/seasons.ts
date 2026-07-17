import { app, type HttpRequest, type InvocationContext, type HttpResponseInit } from '@azure/functions';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../db/client';
import { seasons } from '../db/schema';
import { logAudit } from '../db/auditLog';
import { getUser, resolveRole } from '../auth';
import type { SeasonResponse } from '../types';

/**
 * /api/seasons — named partitions of play (e.g. "Spring 2026"), managed from
 * the /seasons admin page.
 *
 *   GET    /api/seasons        -> SeasonResponse[] (member; ordered by startsOn desc)
 *   POST   /api/seasons        -> admin: create (body: { name, startsOn, endsOn? })
 *   PUT    /api/seasons/{id}   -> admin: edit the same shape
 *   DELETE /api/seasons/{id}   -> admin: delete
 *
 * No FK on nights — a night's season is derived at read time by comparing
 * playedOn against [startsOn, endsOn], so this endpoint only ever manages the
 * seasons table itself.
 */

// Sentinel used only for range-overlap comparisons — an open-ended (endsOn:
// null) season is treated as running through this date, which is far enough
// out to never collide with a real season boundary.
const OPEN_ENDED_SENTINEL = '9999-12-31';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');

const seasonSchema = z
  .object({
    name: z.string().trim().min(1, 'A season name is required.').max(100, 'Season name is too long.'),
    startsOn: dateSchema,
    endsOn: dateSchema.optional().nullable()
  })
  .refine((v) => !v.endsOn || v.endsOn >= v.startsOn, {
    message: 'End date must be on or after the start date.',
    path: ['endsOn']
  });

type Db = Awaited<ReturnType<typeof getDb>>;

function toResponse(r: { id: number; name: string; startsOn: string; endsOn: string | null }): SeasonResponse {
  return { id: String(r.id), name: r.name, startsOn: r.startsOn, endsOn: r.endsOn };
}

/** Lexicographic range-overlap check (ISO date strings), excluding a given id on edit. */
async function hasOverlap(db: Db, startsOn: string, endsOn: string | null | undefined, excludeId?: number): Promise<boolean> {
  const rows = await db.select({ id: seasons.id, startsOn: seasons.startsOn, endsOn: seasons.endsOn }).from(seasons);
  const aEnd = endsOn ?? OPEN_ENDED_SENTINEL;
  return rows.some((r) => {
    if (excludeId !== undefined && r.id === excludeId) return false;
    const bEnd = r.endsOn ?? OPEN_ENDED_SENTINEL;
    return startsOn <= bEnd && r.startsOn <= aEnd;
  });
}

app.http('seasons', {
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  authLevel: 'anonymous',
  route: 'seasons/{id?}',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const idParam = request.params.id;
    try {
      const user = getUser(request);
      if (!user) return { status: 401, jsonBody: { error: 'Unauthorized.' } };

      const db = await getDb();
      const { isAdmin, isMember } = await resolveRole(db, user.userId, user.userDetails, context);
      if (!isMember) return { status: 403, jsonBody: { error: 'You do not have access to this app.' } };

      if (request.method === 'GET') {
        const rows = await db
          .select({ id: seasons.id, name: seasons.name, startsOn: seasons.startsOn, endsOn: seasons.endsOn })
          .from(seasons)
          .orderBy(desc(seasons.startsOn));
        return { jsonBody: rows.map(toResponse) };
      }

      // Every remaining route (POST, PUT, DELETE) is an admin mutation.
      if (!isAdmin) return { status: 403, jsonBody: { error: 'Admins only.' } };

      if (request.method === 'POST') {
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return { status: 400, jsonBody: { error: 'Invalid JSON body.' } };
        }
        const parsed = seasonSchema.safeParse(raw);
        if (!parsed.success) {
          return { status: 400, jsonBody: { error: parsed.error.issues[0]?.message ?? 'Invalid request body.' } };
        }
        const { name, startsOn, endsOn } = parsed.data;
        if (await hasOverlap(db, startsOn, endsOn)) {
          return { status: 409, jsonBody: { error: 'That date range overlaps an existing season.' } };
        }
        const inserted = await db
          .insert(seasons)
          .output({ id: seasons.id, name: seasons.name, startsOn: seasons.startsOn, endsOn: seasons.endsOn })
          .values({ name, startsOn, endsOn: endsOn ?? null });
        await logAudit(db, user, 'season.create', `Created "${name}"`, context);
        return { status: 201, jsonBody: toResponse(inserted[0]) };
      }

      // PUT and DELETE both need an id.
      if (!idParam) return { status: 400, jsonBody: { error: 'Missing season id.' } };
      const id = Number(idParam);
      const existing = (await db.select({ id: seasons.id, name: seasons.name }).from(seasons).where(eq(seasons.id, id)))[0];
      if (!existing) return { status: 404, jsonBody: { error: 'Season not found.' } };

      if (request.method === 'PUT') {
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return { status: 400, jsonBody: { error: 'Invalid JSON body.' } };
        }
        const parsed = seasonSchema.safeParse(raw);
        if (!parsed.success) {
          return { status: 400, jsonBody: { error: parsed.error.issues[0]?.message ?? 'Invalid request body.' } };
        }
        const { name, startsOn, endsOn } = parsed.data;
        if (await hasOverlap(db, startsOn, endsOn, id)) {
          return { status: 409, jsonBody: { error: 'That date range overlaps an existing season.' } };
        }
        await db.update(seasons).set({ name, startsOn, endsOn: endsOn ?? null }).where(eq(seasons.id, id));
        await logAudit(db, user, 'season.update', `Updated "${existing.name}"${existing.name !== name ? ` to "${name}"` : ''}`, context);
        const rows = await db
          .select({ id: seasons.id, name: seasons.name, startsOn: seasons.startsOn, endsOn: seasons.endsOn })
          .from(seasons)
          .where(eq(seasons.id, id));
        return { jsonBody: toResponse(rows[0]) };
      }

      // DELETE
      await db.delete(seasons).where(eq(seasons.id, id));
      await logAudit(db, user, 'season.delete', `Deleted "${existing.name}"`, context);
      return { status: 204 };
    } catch (err) {
      context.error('seasons handler failed', err);
      return {
        status: 500,
        jsonBody: {
          error: 'Database error. If the app was idle, the database may be waking up — try again in a few seconds.'
        }
      };
    }
  }
});
