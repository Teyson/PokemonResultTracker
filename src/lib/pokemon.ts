import type { Night } from './types';

export const TYPES: [string, string][] = [
  ['Grass', '#63bc5a'],
  ['Fire', '#ff9c54'],
  ['Water', '#4f92d6'],
  ['Lightning', '#f6c945'],
  ['Psychic', '#a86fd4'],
  ['Fighting', '#cd7137'],
  ['Darkness', '#525873'],
  ['Metal', '#a8a9b4'],
  ['Dragon', '#b79b3f'],
  ['Fairy', '#ec8fd0'],
  ['Colorless', '#c4c4bc']
];

export function colorOf(type: string): string {
  return (TYPES.find(([name]) => name === type) ?? ['Colorless', '#c4c4bc'])[1];
}

export function pts(n: Pick<Night, 'w' | 't'>): number {
  return n.w * 3 + n.t;
}

export function games(n: Pick<Night, 'w' | 't' | 'l'>): number {
  return n.w + n.t + n.l;
}

export function ppg(n: Pick<Night, 'w' | 't' | 'l'>): number {
  const g = games(n);
  return g ? pts(n) / g : 0;
}

// Exported so other chronological-replay logic (e.g. src/lib/elo.ts) uses the
// exact same tie-break order rather than redefining it.
export function sortedByDate(nights: Night[]): Night[] {
  return [...nights].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id.localeCompare(b.id)));
}

/** Combined PPG over the most recent n nights (chronological) — "current form" vs the season average. */
export function rollingPpg(nights: Night[], n: number): number {
  const recent = sortedByDate(nights).slice(-n);
  return ppg({
    w: recent.reduce((sum, x) => sum + x.w, 0),
    t: recent.reduce((sum, x) => sum + x.t, 0),
    l: recent.reduce((sum, x) => sum + x.l, 0)
  });
}

/** Each of the most recent n nights' own PPG, oldest to newest — for sparklines. */
export function nightlyPpgSeries(nights: Night[], n: number): number[] {
  return sortedByDate(nights)
    .slice(-n)
    .map((x) => ppg(x));
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Most recent Tuesday (inclusive of today), local time — matches the league's weekly cadence. */
export function recentTuesday(): string {
  const d = new Date();
  const diff = (d.getDay() - 2 + 7) % 7;
  d.setDate(d.getDate() - diff);
  return toISO(d);
}

/** Whether a YYYY-MM-DD date string falls on a Tuesday, the league's usual night. */
export function isTuesday(iso: string): boolean {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return false;
  return new Date(y, m - 1, d).getDay() === 2;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// UTC-based (not local Date arithmetic) so week/year boundaries land on the
// same day regardless of the viewer's timezone — see CLAUDE.md pitfalls.
function toISOUTC(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** All Tuesdays that fall within the given year, chronological, as ISO date strings (UTC). */
export function tuesdaysOfYear(year: number): string[] {
  const out: string[] = [];
  const jan1Day = new Date(Date.UTC(year, 0, 1)).getUTCDay();
  let d = new Date(Date.UTC(year, 0, 1 + ((2 - jan1Day + 7) % 7)));
  while (d.getUTCFullYear() === year) {
    out.push(toISOUTC(d));
    d = new Date(d.getTime() + 7 * 86400000);
  }
  return out;
}

/**
 * The nearest Tuesday to an arbitrary ISO date, used to fold nights logged on
 * a non-Tuesday (the date picker allows any day) into their week's cell on
 * the attendance heatmap. Ties (impossible for a single weekday target, but
 * kept explicit) resolve forward.
 */
export function nearestTuesday(iso: string): string {
  const [y, m, dd] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, dd));
  let delta = 2 - d.getUTCDay();
  if (delta > 3) delta -= 7;
  if (delta < -3) delta += 7;
  d.setUTCDate(d.getUTCDate() + delta);
  return toISOUTC(d);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDate(iso: string): string {
  const [y, m, dd] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${dd}, ${y}`;
}

export function fmtShort(iso: string): string {
  const [, m, dd] = iso.split('-').map(Number);
  return `${m}/${dd}`;
}
