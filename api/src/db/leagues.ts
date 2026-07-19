import { asc, eq, isNull } from 'drizzle-orm';
import { getDb } from './client';
import { leagues } from './schema';

type Db = Awaited<ReturnType<typeof getDb>>;

/** The default league: the lowest-id unarchived league, or null if none exist/all are archived. */
export async function defaultLeagueId(db: Db): Promise<number | null> {
  const rows = await db.select({ id: leagues.id }).from(leagues).where(isNull(leagues.archivedAt)).orderBy(asc(leagues.id));
  return rows[0]?.id ?? null;
}

/**
 * The single write-path mapping between the legacy isLeagueNight boolean and
 * leagueId, used by every write to nights so the two columns can't drift
 * apart while both exist: isLeagueNight false -> leagueId always null;
 * isLeagueNight true -> the given leagueId if valid, else the default league.
 * Throws a descriptive error for an unknown/archived leagueId so the caller
 * can turn it into a 400.
 */
export async function resolveNightLeagueId(db: Db, isLeagueNight: boolean, requestedLeagueId?: number): Promise<number | null> {
  if (!isLeagueNight) return null;
  if (requestedLeagueId !== undefined) {
    const rows = await db
      .select({ id: leagues.id, archivedAt: leagues.archivedAt })
      .from(leagues)
      .where(eq(leagues.id, requestedLeagueId));
    const found = rows[0];
    if (!found) throw new Error('League not found.');
    if (found.archivedAt) throw new Error('That league is archived and can\'t accept new nights.');
    return found.id;
  }
  return defaultLeagueId(db);
}
