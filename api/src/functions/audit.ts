import { app, type HttpRequest, type InvocationContext, type HttpResponseInit } from '@azure/functions';
import { desc } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../db/client';
import { auditLog } from '../db/schema';
import { getUser, resolveRole } from '../auth';
import type { AuditLogEntryResponse } from '../types';

/**
 * /api/audit — the admin action trail. Admin only.
 *
 *   GET /api/audit?limit=50 -> AuditLogEntryResponse[], newest first
 *
 * Retention is indefinite — this app's scale (one small league) makes that
 * fine; there is no purge path.
 */
const limitSchema = z.preprocess((v) => {
  const n = parseInt(String(v ?? '50'), 10);
  return Number.isFinite(n) ? n : 50;
}, z.number().int().min(1).max(200));

app.http('audit', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'audit',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const user = getUser(request);
      if (!user) return { status: 401, jsonBody: { error: 'Unauthorized.' } };

      const db = await getDb();
      const { isAdmin } = await resolveRole(db, user.userId, user.userDetails, context);
      if (!isAdmin) return { status: 403, jsonBody: { error: 'Admins only.' } };

      const limit = limitSchema.parse(new URL(request.url).searchParams.get('limit'));
      const rows = await db
        .select({
          id: auditLog.id,
          actorLogin: auditLog.actorLogin,
          action: auditLog.action,
          detail: auditLog.detail,
          createdAt: auditLog.createdAt
        })
        .from(auditLog)
        .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
        .offset(0)
        .fetch(limit);

      const jsonBody: AuditLogEntryResponse[] = rows.map((r) => ({ ...r, id: String(r.id), createdAt: r.createdAt.toISOString() }));
      return { jsonBody };
    } catch (err) {
      context.error('audit handler failed', err);
      return {
        status: 500,
        jsonBody: {
          error: 'Database error. If the app was idle, the database may be waking up — try again in a few seconds.'
        }
      };
    }
  }
});
