import { eq } from 'drizzle-orm';
import { getDb } from './client';
import { users } from './schema';

type Db = Awaited<ReturnType<typeof getDb>>;

/**
 * Get-or-create the users row for a signed-in identity, returning its surrogate
 * id (used as nights.owner_id). Keyed on the immutable Static Web Apps userId;
 * the GitHub login is stored as a display name and refreshed whenever it
 * changes, so a rename propagates to everything that joins to this row.
 */
export async function ensureUser(db: Db, userId: string, githubLogin: string): Promise<number> {
  const existing = await db.select({ id: users.id, githubLogin: users.githubLogin }).from(users).where(eq(users.userId, userId));
  if (existing[0]) {
    if (existing[0].githubLogin !== githubLogin) {
      await db.update(users).set({ githubLogin }).where(eq(users.id, existing[0].id));
    }
    return existing[0].id;
  }
  const inserted = await db.insert(users).output({ id: users.id }).values({ userId, githubLogin });
  return inserted[0].id;
}
