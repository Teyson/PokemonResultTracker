<script lang="ts">
  import type { Night } from '$lib/types';
  import { colorOf } from '$lib/pokemon';

  let { nights }: { nights: Night[] } = $props();

  interface DeckAgg {
    deck: string;
    type: string;
    w: number;
    t: number;
    l: number;
  }

  let decks = $derived.by(() => {
    const map = new Map<string, DeckAgg>();
    for (const n of nights) {
      const k = n.deck.trim().toLowerCase();
      const agg = map.get(k) ?? { deck: n.deck, type: n.type, w: 0, t: 0, l: 0 };
      agg.w += n.w;
      agg.t += n.t;
      agg.l += n.l;
      map.set(k, agg);
    }
    return [...map.values()].sort((a, b) => {
      const ga = a.w + a.t + a.l;
      const gb = b.w + b.t + b.l;
      return (b.w * 3 + b.t) / (gb || 1) - (a.w * 3 + a.t) / (ga || 1);
    });
  });
</script>

{#if decks.length >= 2}
  <div class="section-title">By deck</div>
  <div class="decktable">
    <div class="drow head">
      <span>Deck</span><span>Record</span><span>Pts</span><span>PPG</span>
    </div>
    {#each decks as d (d.deck)}
      {@const g = d.w + d.t + d.l}
      {@const p = d.w * 3 + d.t}
      <div class="drow">
        <div class="dname"><span class="dot" style="background:{colorOf(d.type)}"></span><span>{d.deck}</span></div>
        <div class="mono">{d.w}-{d.t}-{d.l}</div>
        <div class="mono">{p}</div>
        <div class="mono gold">{g ? (p / g).toFixed(2) : '—'}</div>
      </div>
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
    grid-template-columns: 1fr auto auto auto;
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
</style>
