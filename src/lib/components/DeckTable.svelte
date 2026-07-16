<script lang="ts">
  import type { Night } from '$lib/types';
  import { colorOf, ppg } from '$lib/pokemon';

  let { nights }: { nights: Night[] } = $props();

  interface WTL {
    w: number;
    t: number;
    l: number;
  }

  interface DeckAgg {
    deck: string;
    type: string;
    w: number;
    t: number;
    l: number;
    first: WTL;
    second: WTL;
  }

  function emptyWtl(): WTL {
    return { w: 0, t: 0, l: 0 };
  }

  let decks = $derived.by(() => {
    const map = new Map<string, DeckAgg>();
    for (const n of nights) {
      const k = n.deck.trim().toLowerCase();
      const agg = map.get(k) ?? { deck: n.deck, type: n.type, w: 0, t: 0, l: 0, first: emptyWtl(), second: emptyWtl() };
      agg.w += n.w;
      agg.t += n.t;
      agg.l += n.l;
      for (const m of n.matches ?? []) {
        if (m.wentFirst === undefined) continue;
        const bucket = m.wentFirst ? agg.first : agg.second;
        if (m.result === 'W') bucket.w++;
        else if (m.result === 'T') bucket.t++;
        else bucket.l++;
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
</script>

{#if decks.length >= 2}
  <div class="section-title">By deck</div>
  <div class="decktable">
    <div class="drow head">
      <span>Deck</span><span>Record</span><span>Pts</span><span>PPG</span><span></span>
    </div>
    {#each decks as d (d.deck)}
      {@const g = d.w + d.t + d.l}
      {@const p = d.w * 3 + d.t}
      {@const key = d.deck.trim().toLowerCase()}
      {@const hasTurnOrder = games(d.first) + games(d.second) >= 3}
      <div class="drow">
        <div class="dname"><span class="dot" style="background:{colorOf(d.type)}"></span><span>{d.deck}</span></div>
        <div class="mono">{d.w}-{d.t}-{d.l}</div>
        <div class="mono">{p}</div>
        <div class="mono gold">{g ? (p / g).toFixed(2) : '—'}</div>
        {#if hasTurnOrder}
          <button
            type="button"
            class="chev"
            aria-expanded={expanded.has(key)}
            aria-label="Toggle turn-order breakdown for {d.deck}"
            onclick={() => toggleExpand(key)}>{expanded.has(key) ? '▴' : '▾'}</button
          >
        {:else}
          <span></span>
        {/if}
      </div>
      {#if hasTurnOrder && expanded.has(key)}
        <div class="turnrow">
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
    grid-template-columns: 1fr auto auto auto auto;
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
  .drow .dname span:last-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
  .turnrow {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
    padding: 0 13px 11px;
    border-bottom: 1px solid var(--line);
  }
  .turnrow:last-child {
    border-bottom: none;
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
</style>
