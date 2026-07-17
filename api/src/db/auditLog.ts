import type { InvocationContext } from '@azure/functions';
import { getDb } from './client';
import { auditLog } from './schema';
import type { ClientPrincipal } from '../auth';

type Db = Awaited<ReturnType<typeof getDb>>;

/**
 * Records one admin/mutating action. A logging failure never fails the
 * calling action — mirrors how resolveRole isolates its ensureUser
 * directory-write call in api/src/auth.ts, so a write hiccup here can't deny
 * or roll back something the admin actually did.
 */
export async function logAudit(db: Db, actor: ClientPrincipal, action: string, detail: string, context?: InvocationContext): Promise<void> {
  try {
    await db.insert(auditLog).values({
      actorUserId: actor.userId,
      actorLogin: actor.userDetails || null,
      action,
      detail
    });
  } catch (err) {
    context?.error('logAudit insert failed', err);
  }
}
