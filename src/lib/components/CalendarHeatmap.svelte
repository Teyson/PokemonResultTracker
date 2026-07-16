<script lang="ts">
  import type { Night } from '$lib/types';
  import { tuesdaysOfYear, nearestTuesday, ppg, games, fmtDate } from '$lib/pokemon';
  import { slide } from 'svelte/transition';

  let { nights }: { nights: Night[] } = $props();

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  let open = $state(false);
  let selected = $state<string | null>(null);

  let years = $derived(
    Array.from(new Set(nights.map((n) => Number(n.date.slice(0, 4))))).sort((a, b) => b - a)
  );
  let currentYear = new Date().getUTCFullYear();
  let year = $state(currentYear);

  // Once nights load, default to the most recent year that has data instead
  // of always the calendar year — a league that stopped playing last winter
  // shouldn't open on a blank grid.
  $effect(() => {
    if (years.length && !years.includes(year)) year = years[0];
  });

  let minYear = $derived(years.length ? Math.min(currentYear, ...years) : currentYear);
  let maxYear = $derived(years.length ? Math.max(currentYear, ...years) : currentYear);

  // Fold each night into the week (nearest Tuesday) it belongs to and sum
  // w/t/l per week — a night logged on an off-Tuesday date, or two nights
  // in the same week, both collapse into one cell rather than being dropped.
  let weekRecords = $derived.by(() => {
    const map = new Map<string, { w: number; t: number; l: number }>();
    for (const n of nights) {
      const wk = nearestTuesday(n.date);
      const rec = map.get(wk) ?? { w: 0, t: 0, l: 0 };
      rec.w += n.w;
      rec.t += n.t;
      rec.l += n.l;
      map.set(wk, rec);
    }
    return map;
  });

  let weeks = $derived(tuesdaysOfYear(year));

  let monthGroups = $derived.by(() => {
    const groups: { label: string; weeks: string[] }[] = [];
    for (const iso of weeks) {
      const m = Number(iso.slice(5, 7)) - 1;
      const label = MONTHS[m];
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.weeks.push(iso);
      else groups.push({ label, weeks: [iso] });
    }
    return groups;
  });

  function stepFor(iso: string): number {
    const rec = weekRecords.get(iso);
    if (!rec || games(rec) === 0) return -1;
    const p = ppg(rec);
    return Math.max(0, Math.min(3, Math.floor((p / 3) * 4)));
  }

  const STEP_BG = [
    'color-mix(in srgb, var(--muted2) 75%, var(--win) 25%)',
    'color-mix(in srgb, var(--muted2) 50%, var(--win) 50%)',
    'color-mix(in srgb, var(--muted2) 25%, var(--win) 75%)',
    'var(--win)'
  ];

  function bg(iso: string): string {
    const step = stepFor(iso);
    return step < 0 ? 'var(--panel2)' : STEP_BG[step];
  }

  function label(iso: string): string {
    const rec = weekRecords.get(iso);
    if (!rec || games(rec) === 0) return `${fmtDate(iso)} — no night`;
    return `${fmtDate(iso)} — ${rec.w}-${rec.t}-${rec.l} (${ppg(rec).toFixed(2)} ppg)`;
  }

  function toggle(iso: string) {
    selected = selected === iso ? null : iso;
  }
</script>

{#if nights.length >= 3}
  <div
    class="section-title toggle"
    role="button"
    tabindex="0"
    onclick={() => (open = !open)}
    onkeydown={(e) => e.key === 'Enter' && (open = !open)}
  >
    Attendance
    <span class="chev">{open ? '▴' : '▾'}</span>
  </div>
  {#if open}
    <div class="heatmap" transition:slide={{ duration: 220 }}>
      <div class="year-row">
        <button class="yr-nav" disabled={year <= minYear} onclick={() => (year = year - 1)}>‹</button>
        <span class="yr">{year}</span>
        <button class="yr-nav" disabled={year >= maxYear} onclick={() => (year = year + 1)}>›</button>
      </div>
      <div class="grid-scroll">
        <div class="grid">
          {#each monthGroups as g (g.weeks[0])}
            <div class="month-group">
              <div class="month-label">{g.label}</div>
              <div class="cells">
                {#each g.weeks as iso (iso)}
                  <button
                    class="cell"
                    class:active={selected === iso}
                    style="background: {bg(iso)}"
                    title={label(iso)}
                    onclick={() => toggle(iso)}
                    aria-label={label(iso)}
                  ></button>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </div>
      {#if selected}
        <div class="detail">{label(selected)}</div>
      {/if}
    </div>
  {/if}
{/if}

<style>
  .section-title {
    font-family: var(--display);
    font-size: 12px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--muted);
    margin: 22px 2px 10px;
    display: flex;
    align-items: center;
    gap: 9px;
  }
  .section-title::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--line);
  }
  .section-title.toggle {
    cursor: pointer;
    user-select: none;
  }
  .section-title.toggle:hover {
    color: var(--text);
  }
  .chev {
    font-size: 11px;
  }

  .heatmap {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 12px;
  }
  .year-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin-bottom: 10px;
  }
  .yr {
    font-family: var(--display);
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.06em;
  }
  .yr-nav {
    font-family: inherit;
    background: transparent;
    border: 1px solid var(--line);
    color: var(--muted);
    border-radius: 6px;
    width: 24px;
    height: 24px;
    cursor: pointer;
  }
  .yr-nav:hover:not(:disabled) {
    color: var(--text);
    border-color: var(--muted2);
  }
  .yr-nav:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .grid-scroll {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    padding-bottom: 2px;
  }
  .grid {
    display: flex;
    gap: 6px;
    width: max-content;
  }
  .month-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .month-label {
    font-size: 9px;
    letter-spacing: 0.06em;
    color: var(--muted2);
    text-align: center;
  }
  .cells {
    display: flex;
    gap: 3px;
  }
  .cell {
    width: 13px;
    height: 13px;
    border-radius: 3px;
    border: 1px solid transparent;
    padding: 0;
    cursor: pointer;
  }
  .cell.active {
    border-color: var(--text);
  }

  .detail {
    margin-top: 10px;
    font-size: 12px;
    color: var(--muted);
    text-align: center;
  }
</style>
