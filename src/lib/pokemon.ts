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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDate(iso: string): string {
  const [y, m, dd] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${dd}, ${y}`;
}

export function fmtShort(iso: string): string {
  const [, m, dd] = iso.split('-').map(Number);
  return `${m}/${dd}`;
}
