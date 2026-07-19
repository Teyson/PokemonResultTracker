import { app, type HttpRequest, type InvocationContext, type HttpResponseInit } from '@azure/functions';
import { desc, count } from 'drizzle-orm';
import { z } from 'zod';
import { auditLog } from '../db/schema';
import { authenticate } from '../auth';
import type { AuditLogResponse } from '../types';

/**
 * /api/audit — the admin action trail. Admin only.
 *
 *   GET /api/audit?limit=10&offset=0 -> AuditLogResponse ({ entries, total }), newest first
 *
 * Retention is indefinite — this app's scale (one small league) makes that
 * fine; there is no purge path. total is a separate COUNT(*) rather than
 * derived from the page, so the admin page can page forward/back correctly.
 */
const limitSchema = z.preprocess((v) => {
  const n = parseInt(String(v ?? '10'), 10);
  return Number.isFinite(n) ? n : 10;
}, z.number().int().min(1).max(200));

const offsetSchema = z.preprocess((v) => {
  const n = parseInt(String(v ?? '0'), 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}, z.number().int().min(0));

app.http('audit', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'audit',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const auth = await authenticate(request, context);
      if (!('isMember' in auth)) return auth;
      const { db, isAdmin } = auth;
      if (!isAdmin) return { status: 403, jsonBody: { error: 'Admins only.' } };

      const params = new URL(request.url).searchParams;
      const limit = limitSchema.parse(params.get('limit'));
      const offset = offsetSchema.parse(params.get('offset'));

      const [rows, totalRows] = await Promise.all([
        db
          .select({
            id: auditLog.id,
            actorLogin: auditLog.actorLogin,
            action: auditLog.action,
            detail: auditLog.detail,
            createdAt: auditLog.createdAt
          })
          .from(auditLog)
          .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
          .offset(offset)
          .fetch(limit),
        db.select({ total: count() }).from(auditLog)
      ]);

      const jsonBody: AuditLogResponse = {
        entries: rows.map((r) => ({ ...r, id: String(r.id), createdAt: r.createdAt.toISOString() })),
        total: totalRows[0]?.total ?? 0
      };
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
