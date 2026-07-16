<script lang="ts">
  import type { Night } from '$lib/types';
  import { colorOf, nightlyPpgSeries, ppg } from '$lib/pokemon';
  import { slide } from 'svelte/transition';
  import TypeIcon from './TypeIcon.svelte';
  import Sparkline from './Sparkline.svelte';

  const FORM_WINDOW = 8;

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
    opponentTypes: Map<string, MatchupCell>;
    history: Night[];
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
          opponents: new Map(),
          opponentTypes: new Map(),
          history: [] as Night[]
        } satisfies DeckAgg);
      agg.w += n.w;
      agg.t += n.t;
      agg.l += n.l;
      agg.history.push(n);
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
        if (m.opponentType) {
          const tk = m.opponentType;
          const cell = agg.opponentTypes.get(tk) ?? { name: m.opponentType, w: 0, t: 0, l: 0 };
          if (m.result === 'W') cell.w++;
          else if (m.result === 'T') cell.t++;
          else cell.l++;
          agg.opponentTypes.set(tk, cell);
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

  type MatchupSortKey = 'name' | 'record' | 'score' | 'ppg';
  let matchupSort = $state<{ key: MatchupSortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 });

  function toggleMatchupSort(key: MatchupSortKey) {
    matchupSort =
      matchupSort.key === key
        ? { key, dir: matchupSort.dir === 1 ? -1 : 1 }
        : { key, dir: key === 'name' ? 1 : -1 };
  }

  function matchupSortArrow(key: MatchupSortKey): string {
    if (matchupSort.key !== key) return '';
    return matchupSort.dir === 1 ? ' ▲' : ' ▼';
  }

  function sortedOpponents(d: DeckAgg): MatchupCell[] {
    const { key, dir } = matchupSort;
    return [...d.opponents.values()].sort((a, b) => {
      let cmp = 0;
      if (key === 'name') cmp = a.name.localeCompare(b.name);
      else if (key === 'record') cmp = games(a) - games(b);
      else if (key === 'score') cmp = (scorePct(a) ?? -1) - (scorePct(b) ?? -1);
      else cmp = ppg(a) - ppg(b);
      return cmp * dir;
    });
  }

  let typeSort = $state<{ key: MatchupSortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 });

  function toggleTypeSort(key: MatchupSortKey) {
    typeSort =
      typeSort.key === key ? { key, dir: typeSort.dir === 1 ? -1 : 1 } : { key, dir: key === 'name' ? 1 : -1 };
  }

  function typeSortArrow(key: MatchupSortKey): string {
    if (typeSort.key !== key) return '';
    return typeSort.dir === 1 ? ' ▲' : ' ▼';
  }

  function sortedOpponentTypes(d: DeckAgg): MatchupCell[] {
    const { key, dir } = typeSort;
    return [...d.opponentTypes.values()].sort((a, b) => {
      let cmp = 0;
      if (key === 'name') cmp = a.name.localeCompare(b.name);
      else if (key === 'record') cmp = games(a) - games(b);
      else if (key === 'score') cmp = (scorePct(a) ?? -1) - (scorePct(b) ?? -1);
      else cmp = ppg(a) - ppg(b);
      return cmp * dir;
    });
  }

  // Percent used to color-code a matchup value — PPG is rescaled from its
  // 0-3 range onto 0-100 so both columns share the same win/loss gradient.
  function pctColor(pct: number): string {
    const clamped = Math.max(0, Math.min(100, pct));
    return `color-mix(in srgb, var(--win) ${clamped}%, var(--loss))`;
  }
</script>

{#if decks.length >= 2}
  <div class="section-title">By deck</div>
  <div class="decktable">
    <div class="drow head">
      <span>Deck</span><span>Record</span><span>Pts</span><span>PPG</span><span>Form</span><span></span>
    </div>
    {#each decks as d (d.key)}
      {@const g = d.w + d.t + d.l}
      {@const p = d.w * 3 + d.t}
      {@const hasTurnOrder = games(d.first) + games(d.second) >= 3}
      {@const form = nightlyPpgSeries(d.history, FORM_WINDOW)}
      <div class="drow">
        <div class="dname">
          <TypeIcon type={d.type} size={16} /><span class="dname-text">{d.deck}</span>
          {#if showOwner}<span class="owner">· {d.owner}</span>{/if}
        </div>
        <div class="mono">{d.w}-{d.t}-{d.l}</div>
        <div class="mono">{p}</div>
        <div class="mono gold">{g ? (p / g).toFixed(2) : '—'}</div>
        <div class="spark-cell"><Sparkline values={form} color={colorOf(d.type)} /></div>
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
        {@const opponentTypes = sortedOpponentTypes(d)}
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
            <div class="agg-lab">Matchups</div>
            {#if opponents.length > 0}
              <div class="mu-table">
                <div class="mu-row mu-head">
                  <button type="button" onclick={() => toggleMatchupSort('name')}>Opponent{matchupSortArrow('name')}</button>
                  <button type="button" onclick={() => toggleMatchupSort('record')}>Record{matchupSortArrow('record')}</button>
                  <button type="button" onclick={() => toggleMatchupSort('score')}>Score%{matchupSortArrow('score')}</button>
                  <button type="button" onclick={() => toggleMatchupSort('ppg')}>PPG{matchupSortArrow('ppg')}</button>
                </div>
                {#each opponents as opp (opp.name)}
                  {@const g = games(opp)}
                  {@const lowData = g < 3}
                  {@const pct = scorePct(opp)}
                  {@const ppgVal = ppg(opp)}
                  <div class="mu-row">
                    <span class="mu-name">{opp.name}</span>
                    <span class="mu-rec">{opp.w}-{opp.t}-{opp.l}</span>
                    <span
                      class="mu-val"
                      class:low={lowData}
                      style={!lowData && pct !== null ? `color: ${pctColor(pct)}` : ''}
                      >{lowData ? 'low data' : pct !== null ? `${pct}%` : 'all ties'}</span
                    >
                    <span class="mu-val" class:low={lowData} style={!lowData ? `color: ${pctColor((ppgVal / 3) * 100)}` : ''}
                      >{lowData ? 'low data' : ppgVal.toFixed(2)}</span
                    >
                  </div>
                {/each}
              </div>
            {:else}
              <div class="to-empty">No opponent decks logged yet.</div>
            {/if}
          </div>
          <div class="agg-section">
            <div class="agg-lab">Opponent types</div>
            {#if opponentTypes.length > 0}
              <div class="mu-table">
                <div class="mu-row mu-head">
                  <button type="button" onclick={() => toggleTypeSort('name')}>Type{typeSortArrow('name')}</button>
                  <button type="button" onclick={() => toggleTypeSort('record')}>Record{typeSortArrow('record')}</button>
                  <button type="button" onclick={() => toggleTypeSort('score')}>Score%{typeSortArrow('score')}</button>
                  <button type="button" onclick={() => toggleTypeSort('ppg')}>PPG{typeSortArrow('ppg')}</button>
                </div>
                {#each opponentTypes as opp (opp.name)}
                  {@const g = games(opp)}
                  {@const lowData = g < 3}
                  {@const pct = scorePct(opp)}
                  {@const ppgVal = ppg(opp)}
                  <div class="mu-row">
                    <span class="mu-name"><TypeIcon type={opp.name} size={16} />{opp.name}</span>
                    <span class="mu-rec">{opp.w}-{opp.t}-{opp.l}</span>
                    <span
                      class="mu-val"
                      class:low={lowData}
                      style={!lowData && pct !== null ? `color: ${pctColor(pct)}` : ''}
                      >{lowData ? 'low data' : pct !== null ? `${pct}%` : 'all ties'}</span
                    >
                    <span class="mu-val" class:low={lowData} style={!lowData ? `color: ${pctColor((ppgVal / 3) * 100)}` : ''}
                      >{lowData ? 'low data' : ppgVal.toFixed(2)}</span
                    >
                  </div>
                {/each}
              </div>
            {:else}
              <div class="to-empty">No opponent types logged yet.</div>
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
    grid-template-columns: 1fr 92px 56px 64px 48px 24px;
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
  .drow.head span:nth-child(5) {
    text-align: center;
  }
  .drow .dname {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    font-size: 14px;
    min-width: 0;
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
  .spark-cell {
    display: flex;
    justify-content: center;
    align-items: center;
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
    grid-template-columns: 1fr 68px 56px 56px;
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
  .mu-row.mu-head button {
    font-family: inherit;
    font-size: 9px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
    background: none;
    border: none;
    padding: 0;
    text-align: left;
    cursor: pointer;
  }
  .mu-row.mu-head button:hover {
    color: var(--text);
  }
  .mu-row.mu-head button:not(:first-child) {
    text-align: right;
  }
  .mu-name {
    display: flex;
    align-items: center;
    gap: 6px;
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
