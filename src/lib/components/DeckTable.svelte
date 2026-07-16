<script lang="ts">
  import type { Night } from '$lib/types';
  import { colorOf, ppg } from '$lib/pokemon';
  import { slide } from 'svelte/transition';

  let { nights, showOwner = false }: { nights: Night[]; showOwner?: boolean } = $props();

  interface WTL {
    w: number;
    t: number;
    l: number;
  }

  interface MatchupCell extends WTL {
    name: string;
  }

  interface DeckAgg {
    key: string;
    deck: string;
    type: string;
    owner: string;
    w: number;
    t: number;
    l: number;
    first: WTL;
    second: WTL;
    opponents: Map<string, MatchupCell>;
  }

  function emptyWtl(): WTL {
    return { w: 0, t: 0, l: 0 };
  }

  // Keyed by owner + name, not name alone — different owners can have a
  // same-named deck, and those should stay separate rows rather than merge.
  let decks = $derived.by(() => {
    const map = new Map<string, DeckAgg>();
    for (const n of nights) {
      const k = `${n.createdBy}::${n.deck.trim().toLowerCase()}`;
      const agg =
        map.get(k) ??
        ({
          key: k,
          deck: n.deck,
          type: n.type,
          owner: n.createdBy,
          w: 0,
          t: 0,
          l: 0,
          first: emptyWtl(),
          second: emptyWtl(),
          opponents: new Map()
        } satisfies DeckAgg);
      agg.w += n.w;
      agg.t += n.t;
      agg.l += n.l;
      for (const m of n.matches ?? []) {
        if (m.wentFirst !== undefined) {
          const bucket = m.wentFirst ? agg.first : agg.second;
          if (m.result === 'W') bucket.w++;
          else if (m.result === 'T') bucket.t++;
          else bucket.l++;
        }
        if (m.opponentDeck) {
          const ck = m.opponentDeck.trim().toLowerCase();
          const cell = agg.opponents.get(ck) ?? { name: m.opponentDeck, w: 0, t: 0, l: 0 };
          if (m.result === 'W') cell.w++;
          else if (m.result === 'T') cell.t++;
          else cell.l++;
          agg.opponents.set(ck, cell);
        }
      }
      map.set(k, agg);
    }
    return [...map.values()].sort((a, b) => {
      const ga = a.w + a.t + a.l;
      const gb = b.w + b.t + b.l;
      return (b.w * 3 + b.t) / (gb || 1) - (a.w * 3 + a.t) / (ga || 1);
    });
  });

  let expanded = $state<Set<string>>(new Set());

  function toggleExpand(key: string) {
    const next = new Set(expanded);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    expanded = next;
  }

  function games(r: WTL): number {
    return r.w + r.t + r.l;
  }

  // Score rate on the same 0-3 ppg scale used everywhere else in the app, expressed as a percent.
  function scorePct(r: WTL): number | null {
    const g = games(r);
    return g ? Math.round(((r.w * 3 + r.t) / (g * 3)) * 100) : null;
  }

  // Win rate over decisive games only — ties are neutral and don't move it.
  function winPct(r: WTL): number | null {
    const decisive = r.w + r.l;
    return decisive ? Math.round((r.w / decisive) * 100) : null;
  }

  function sortedOpponents(d: DeckAgg): MatchupCell[] {
    return [...d.opponents.values()].sort((a, b) => games(b) - games(a));
  }

  type MatchupMode = 'score' | 'win' | 'ppg';
  let matchupMode = $state<MatchupMode>('score');
  let matchupLabel = $derived(matchupMode === 'win' ? 'Win%' : matchupMode === 'ppg' ? 'PPG' : 'Score%');

  // Percent used to color-code a matchup cell — always on a 0-100 scale, even
  // in PPG mode (where the 0-3 ppg range is rescaled), so one gradient covers all three modes.
  function matchupPct(r: WTL): number | null {
    if (matchupMode === 'ppg') return (ppg(r) / 3) * 100;
    return matchupMode === 'win' ? winPct(r) : scorePct(r);
  }

  function matchupText(r: WTL): string {
    if (matchupMode === 'ppg') return ppg(r).toFixed(2);
    const pct = matchupMode === 'win' ? winPct(r) : scorePct(r);
    return pct === null ? 'all ties' : `${pct}%`;
  }

  function pctColor(pct: number): string {
    const clamped = Math.max(0, Math.min(100, pct));
    return `color-mix(in srgb, var(--win) ${clamped}%, var(--loss))`;
  }
</script>

{#if decks.length >= 2}
  <div class="section-title">By deck</div>
  <div class="decktable">
    <div class="drow head">
      <span>Deck</span><span>Record</span><span>Pts</span><span>PPG</span><span></span>
    </div>
    {#each decks as d (d.key)}
      {@const g = d.w + d.t + d.l}
      {@const p = d.w * 3 + d.t}
      {@const hasTurnOrder = games(d.first) + games(d.second) >= 3}
      <div class="drow">
        <div class="dname">
          <span class="dot" style="background:{colorOf(d.type)}"></span><span class="dname-text">{d.deck}</span>
          {#if showOwner}<span class="owner">· {d.owner}</span>{/if}
        </div>
        <div class="mono">{d.w}-{d.t}-{d.l}</div>
        <div class="mono">{p}</div>
        <div class="mono gold">{g ? (p / g).toFixed(2) : '—'}</div>
        <button
          type="button"
          class="chev"
          aria-expanded={expanded.has(d.key)}
          aria-label="Toggle deck breakdown for {d.deck}"
          onclick={() => toggleExpand(d.key)}>{expanded.has(d.key) ? '▴' : '▾'}</button
        >
      </div>
      {#if expanded.has(d.key)}
        {@const opponents = sortedOpponents(d)}
        <div class="aggrow" transition:slide={{ duration: 220 }}>
          <div class="agg-section">
            <div class="agg-lab">Turn order</div>
            {#if hasTurnOrder}
              <div class="to-grid">
                <div class="to-cell">
                  <div class="to-lab">Going first</div>
                  <div class="to-rec">{d.first.w}–{d.first.t}–{d.first.l}</div>
                  <div class="to-ppg">{ppg(d.first).toFixed(2)} <span>ppg</span></div>
                </div>
                <div class="to-cell">
                  <div class="to-lab">Going second</div>
                  <div class="to-rec">{d.second.w}–{d.second.t}–{d.second.l}</div>
                  <div class="to-ppg">{ppg(d.second).toFixed(2)} <span>ppg</span></div>
                </div>
              </div>
            {:else}
              <div class="to-empty">Not enough turn-order data yet — needs at least 3 logged games.</div>
            {/if}
          </div>
          <div class="agg-section">
            <div class="agg-lab-row">
              <div class="agg-lab">Matchups</div>
              <div class="mode-toggle">
                <button type="button" class:active={matchupMode === 'score'} onclick={() => (matchupMode = 'score')}
                  >Score%</button
                >
                <button type="button" class:active={matchupMode === 'win'} onclick={() => (matchupMode = 'win')}>Win%</button>
                <button type="button" class:active={matchupMode === 'ppg'} onclick={() => (matchupMode = 'ppg')}>PPG</button>
              </div>
            </div>
            {#if opponents.length > 0}
              <div class="mu-table">
                <div class="mu-row mu-head">
                  <span>Opponent</span><span>Record</span><span>{matchupLabel}</span>
                </div>
                {#each opponents as opp (opp.name)}
                  {@const g = games(opp)}
                  {@const lowData = g < 3}
                  {@const pct = matchupPct(opp)}
                  <div class="mu-row">
                    <span class="mu-name">{opp.name}</span>
                    <span class="mu-rec">{opp.w}-{opp.t}-{opp.l}</span>
                    <span
                      class="mu-val"
                      class:low={lowData}
                      style={!lowData && pct !== null ? `color: ${pctColor(pct)}` : ''}
                      >{lowData ? 'low data' : matchupText(opp)}</span
                    >
                  </div>
                {/each}
              </div>
            {:else}
              <div class="to-empty">No opponent decks logged yet.</div>
            {/if}
          </div>
        </div>
      {/if}
    {/each}
  </div>
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
  .decktable {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    overflow: hidden;
  }
  .drow {
    display: grid;
    grid-template-columns: 1fr 92px 56px 64px 24px;
    gap: 10px;
    align-items: center;
    padding: 11px 13px;
    border-bottom: 1px solid var(--line);
  }
  .drow:last-child {
    border-bottom: none;
  }
  .drow.head {
    background: rgba(0, 0, 0, 0.2);
  }
  .drow.head span {
    font-size: 9.5px;
    letter-spacing: 0.13em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .drow.head span:not(:first-child) {
    text-align: right;
  }
  .drow .dname {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    font-size: 14px;
    min-width: 0;
  }
  .drow .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    flex: 0 0 auto;
  }
  .drow .dname-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .drow .dname .owner {
    flex: 0 0 auto;
    color: var(--muted2);
    font-weight: 400;
  }
  .drow .mono {
    font-family: var(--display);
    font-weight: 600;
    font-size: 14px;
    text-align: right;
    min-width: 52px;
    font-variant-numeric: tabular-nums;
  }
  .drow .mono.gold {
    color: var(--gold);
  }
  .chev {
    flex: 0 0 auto;
    width: 24px;
    height: 24px;
    border-radius: 7px;
    border: 1px solid var(--line);
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    font-size: 11px;
  }
  .chev:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 2px;
  }
  .aggrow {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 2px 13px 13px;
    border-bottom: 1px solid var(--line);
  }
  .aggrow:last-child {
    border-bottom: none;
  }
  .agg-lab {
    font-size: 9.5px;
    letter-spacing: 0.13em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 6px;
  }
  .agg-lab-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 6px;
  }
  .agg-lab-row .agg-lab {
    margin-bottom: 0;
  }
  .mode-toggle {
    display: flex;
    gap: 4px;
  }
  .mode-toggle button {
    font-family: inherit;
    font-size: 10px;
    letter-spacing: 0.03em;
    color: var(--muted);
    background: transparent;
    border: 1px solid var(--line);
    border-radius: 20px;
    padding: 3px 9px;
    cursor: pointer;
  }
  .mode-toggle button.active {
    color: var(--text);
    border-color: var(--muted2);
    background: var(--panel2);
  }
  .to-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }
  .to-cell {
    background: rgba(0, 0, 0, 0.18);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 8px;
    text-align: center;
  }
  .to-lab {
    font-size: 9px;
    letter-spacing: 0.13em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 4px;
  }
  .to-rec {
    font-family: var(--display);
    font-weight: 700;
    font-size: 14px;
    font-variant-numeric: tabular-nums;
  }
  .to-ppg {
    font-size: 10.5px;
    color: var(--muted);
    margin-top: 2px;
    font-variant-numeric: tabular-nums;
  }
  .to-ppg span {
    font-size: 9px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .to-empty {
    text-align: center;
    color: var(--muted);
    font-size: 12px;
    padding: 10px 4px;
    background: rgba(0, 0, 0, 0.18);
    border: 1px solid var(--line);
    border-radius: 10px;
  }
  .mu-table {
    background: rgba(0, 0, 0, 0.18);
    border: 1px solid var(--line);
    border-radius: 10px;
    overflow: hidden;
  }
  .mu-row {
    display: grid;
    grid-template-columns: 1fr 74px 64px;
    gap: 8px;
    align-items: center;
    padding: 7px 10px;
    border-bottom: 1px solid var(--line);
  }
  .mu-row:last-child {
    border-bottom: none;
  }
  .mu-row.mu-head {
    background: rgba(0, 0, 0, 0.22);
  }
  .mu-row.mu-head span {
    font-size: 9px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .mu-row.mu-head span:not(:first-child) {
    text-align: right;
  }
  .mu-name {
    min-width: 0;
    font-size: 12.5px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mu-rec {
    font-family: var(--display);
    font-weight: 600;
    font-size: 12.5px;
    font-variant-numeric: tabular-nums;
    color: var(--muted);
    text-align: right;
  }
  .mu-val {
    font-family: var(--display);
    font-weight: 700;
    font-size: 12.5px;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  .mu-val.low {
    color: var(--muted);
    font-weight: 400;
    font-family: inherit;
    font-size: 11px;
  }
</style>
