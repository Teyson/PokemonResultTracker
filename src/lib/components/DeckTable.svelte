<script lang="ts">
  import type { Night } from '$lib/types';
  import { colorOf, fmtDate, games, nightlyPpgSeries, ppg, scorePct } from '$lib/pokemon';
  import { deckElo, deckRatingTrend } from '$lib/elo';
  import { slide } from 'svelte/transition';
  import TypeIcon from './TypeIcon.svelte';
  import Sparkline from './Sparkline.svelte';
  import TrendChart from './TrendChart.svelte';

  const FORM_WINDOW = 8;

  let { nights, showOwner = false }: { nights: Night[]; showOwner?: boolean } = $props();

  let open = $state(true);

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
          owner: n.createdByDisplay,
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

  // Elo is keyed by deck name alone, not owner+name like `decks` above — see
  // src/lib/elo.ts. Computed once over the full nights array so every row
  // (even same-named decks under different owners) reads the same replay.
  let eloRatings = $derived.by(() => deckElo(nights));

  let expanded = $state<Set<string>>(new Set());

  function toggleExpand(key: string) {
    const next = new Set(expanded);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    expanded = next;
  }

  // Every subsection inside a deck's foldout is independently foldable, each
  // with its own default (Turn order / Matchups open, the rest — Opponent
  // types / Trend / History — folded, since those are the ones most likely to
  // grow large). `expandedSections` only ever holds ids that have been
  // toggled *away* from their default, so `isOpen` XORs membership against
  // the default to get the effective state.
  let expandedSections = $state<Set<string>>(new Set());

  function toggleSection(id: string) {
    const next = new Set(expandedSections);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expandedSections = next;
  }

  function isOpen(id: string, defaultOpen: boolean): boolean {
    return expandedSections.has(id) !== defaultOpen;
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

{#if decks.length >= 1}
  <div
    class="section-title toggle"
    role="button"
    tabindex="0"
    onclick={() => (open = !open)}
    onkeydown={(e) => e.key === 'Enter' && (open = !open)}
  >
    My decks
    <span class="sec-chev">{open ? '▴' : '▾'}</span>
  </div>
  {#if open}
  <div class="decktable" transition:slide={{ duration: 220 }}>
    <div class="drow head">
      <span>Deck</span><span>Record</span><span>Pts</span><span>PPG</span><span>Elo</span><span>Form</span><span
      ></span>
    </div>
    {#each decks as d (d.key)}
      {@const g = d.w + d.t + d.l}
      {@const p = d.w * 3 + d.t}
      {@const hasTurnOrder = games(d.first) + games(d.second) >= 3}
      {@const form = nightlyPpgSeries(d.history, FORM_WINDOW)}
      {@const elo = eloRatings.get(d.deck.trim().toLowerCase())}
      <div class="drow">
        <div class="dname">
          <TypeIcon type={d.type} size={16} /><span class="dname-text">{d.deck}</span>
          {#if showOwner}<span class="owner">· {d.owner}</span>{/if}
        </div>
        <div class="mono">{d.w}-{d.t}-{d.l}</div>
        <div class="mono">{p}</div>
        <div class="mono gold">{g ? (p / g).toFixed(2) : '—'}</div>
        <div class="mono">{elo && elo.games > 0 ? Math.round(elo.rating) : '—'}</div>
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
        {@const turnOrderId = `${d.key}:turnOrder`}
        {@const matchupsId = `${d.key}:matchups`}
        {@const opponentTypesId = `${d.key}:opponentTypes`}
        {@const ratingId = `${d.key}:rating`}
        {@const trendId = `${d.key}:trend`}
        {@const historyId = `${d.key}:history`}
        {@const turnOrderOpen = isOpen(turnOrderId, true)}
        {@const matchupsOpen = isOpen(matchupsId, true)}
        {@const opponentTypesOpen = isOpen(opponentTypesId, false)}
        {@const ratingOpen = isOpen(ratingId, false)}
        {@const trendOpen = isOpen(trendId, false)}
        {@const historyOpen = isOpen(historyId, false)}
        {@const ratingTrend = deckRatingTrend(nights, d.deck, FORM_WINDOW)}
        <div class="aggrow" transition:slide={{ duration: 220 }}>
          <div class="subsection">
            <button
              type="button"
              class="sub-toggle"
              aria-expanded={turnOrderOpen}
              onclick={() => toggleSection(turnOrderId)}
            >
              <span class="agg-lab">Turn order</span>
              <span class="sub-chev">{turnOrderOpen ? '▴' : '▾'}</span>
            </button>
            {#if turnOrderOpen}
              <div transition:slide={{ duration: 200 }}>
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
            {/if}
          </div>
          <div class="subsection">
            <button
              type="button"
              class="sub-toggle"
              aria-expanded={matchupsOpen}
              onclick={() => toggleSection(matchupsId)}
            >
              <span class="agg-lab">Matchups</span>
              <span class="sub-chev">{matchupsOpen ? '▴' : '▾'}</span>
            </button>
            {#if matchupsOpen}
              <div transition:slide={{ duration: 200 }}>
                {#if opponents.length > 0}
                  <div class="mu-table">
                    <div class="mu-row mu-head">
                      <button type="button" onclick={() => toggleMatchupSort('name')}
                        >Opponent{matchupSortArrow('name')}</button
                      >
                      <button type="button" onclick={() => toggleMatchupSort('record')}
                        >Record{matchupSortArrow('record')}</button
                      >
                      <button type="button" onclick={() => toggleMatchupSort('score')}
                        >Score%{matchupSortArrow('score')}</button
                      >
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
                        <span
                          class="mu-val"
                          class:low={lowData}
                          style={!lowData ? `color: ${pctColor((ppgVal / 3) * 100)}` : ''}
                          >{lowData ? 'low data' : ppgVal.toFixed(2)}</span
                        >
                      </div>
                    {/each}
                  </div>
                {:else}
                  <div class="to-empty">No opponent decks logged yet.</div>
                {/if}
              </div>
            {/if}
          </div>
          <div class="subsection">
            <button
              type="button"
              class="sub-toggle"
              aria-expanded={opponentTypesOpen}
              onclick={() => toggleSection(opponentTypesId)}
            >
              <span class="agg-lab">Opponent types</span>
              <span class="sub-chev">{opponentTypesOpen ? '▴' : '▾'}</span>
            </button>
            {#if opponentTypesOpen}
              <div transition:slide={{ duration: 200 }}>
                {#if opponentTypes.length > 0}
                  <div class="mu-table">
                    <div class="mu-row mu-head">
                      <button type="button" onclick={() => toggleTypeSort('name')}>Type{typeSortArrow('name')}</button>
                      <button type="button" onclick={() => toggleTypeSort('record')}
                        >Record{typeSortArrow('record')}</button
                      >
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
                        <span
                          class="mu-val"
                          class:low={lowData}
                          style={!lowData ? `color: ${pctColor((ppgVal / 3) * 100)}` : ''}
                          >{lowData ? 'low data' : ppgVal.toFixed(2)}</span
                        >
                      </div>
                    {/each}
                  </div>
                {:else}
                  <div class="to-empty">No opponent types logged yet.</div>
                {/if}
              </div>
            {/if}
          </div>
          <div class="subsection">
            <button
              type="button"
              class="sub-toggle"
              aria-expanded={ratingOpen}
              onclick={() => toggleSection(ratingId)}
            >
              <span class="agg-lab">Rating</span>
              <span class="sub-chev">{ratingOpen ? '▴' : '▾'}</span>
            </button>
            {#if ratingOpen}
              <div transition:slide={{ duration: 200 }}>
                {#if elo && elo.games > 0}
                  <div class="to-grid">
                    <div class="to-cell">
                      <div class="to-lab">Elo rating</div>
                      <div class="to-rec">{Math.round(elo.rating)}</div>
                      <div class="to-ppg">{elo.games} rated {elo.games === 1 ? 'game' : 'games'}</div>
                    </div>
                    <div class="to-cell rating-trend-cell">
                      <div class="to-lab">Trend</div>
                      <div class="rating-spark">
                        <Sparkline values={ratingTrend} color={colorOf(d.type)} autoScale width={80} height={22} />
                      </div>
                    </div>
                  </div>
                {:else}
                  <div class="to-empty">
                    No Elo rating yet — needs at least one match with an opponent deck recorded.
                  </div>
                {/if}
              </div>
            {/if}
          </div>
          <div class="subsection">
            <button
              type="button"
              class="sub-toggle"
              aria-expanded={trendOpen}
              onclick={() => toggleSection(trendId)}
            >
              <span class="agg-lab">Trend</span>
              <span class="sub-chev">{trendOpen ? '▴' : '▾'}</span>
            </button>
            {#if trendOpen}
              <div transition:slide={{ duration: 200 }}>
                {#if d.history.length >= 2}
                  <TrendChart nights={d.history} avg={g ? (p / g).toFixed(2) : '—'} />
                {:else}
                  <div class="to-empty">Not enough nights yet for a trend — needs at least 2.</div>
                {/if}
              </div>
            {/if}
          </div>
          <div class="subsection">
            <button
              type="button"
              class="sub-toggle"
              aria-expanded={historyOpen}
              onclick={() => toggleSection(historyId)}
            >
              <span class="agg-lab">History ({d.history.length})</span>
              <span class="sub-chev">{historyOpen ? '▴' : '▾'}</span>
            </button>
            {#if historyOpen}
              <div class="hist-table" transition:slide={{ duration: 200 }}>
                {#each d.history as n (n.id)}
                  <div class="hist-row">
                    <span class="hist-date">{fmtDate(n.date)}</span>
                    <span class="hist-rec">{n.w}-{n.t}-{n.l}</span>
                    <span class="hist-ppg">{ppg(n).toFixed(2)}</span>
                    {#if n.notes}<span class="hist-notes">{n.notes}</span>{/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      {/if}
    {/each}
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
  .sec-chev {
    font-size: 11px;
  }
  .decktable {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    overflow: hidden;
  }
  .drow {
    display: grid;
    grid-template-columns: 1fr 92px 56px 64px 56px 48px 24px;
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
  .drow.head span:nth-child(6) {
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
  .rating-trend-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .rating-spark {
    display: flex;
    justify-content: center;
    margin-top: 2px;
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
  .subsection {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .sub-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-align: left;
  }
  .sub-toggle .agg-lab {
    margin-bottom: 0;
  }
  .sub-chev {
    color: var(--muted);
    font-size: 10px;
  }
  .sub-toggle:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 2px;
  }
  .hist-table {
    background: rgba(0, 0, 0, 0.18);
    border: 1px solid var(--line);
    border-radius: 10px;
    overflow: hidden;
  }
  .hist-row {
    display: grid;
    grid-template-columns: 74px 52px 40px 1fr;
    gap: 8px;
    align-items: center;
    padding: 7px 10px;
    border-bottom: 1px solid var(--line);
    font-size: 11.5px;
  }
  .hist-row:last-child {
    border-bottom: none;
  }
  .hist-date {
    color: var(--muted);
  }
  .hist-rec {
    font-family: var(--display);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .hist-ppg {
    font-family: var(--display);
    font-weight: 700;
    color: var(--gold);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  .hist-notes {
    color: var(--muted2);
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
</style>
