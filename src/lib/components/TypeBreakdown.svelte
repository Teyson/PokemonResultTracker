<script lang="ts">
  import type { Night } from '$lib/types';
  import { colorOf, ppg, games, pts } from '$lib/pokemon';
  import TypeIcon from '$lib/components/TypeIcon.svelte';

  let { nights }: { nights: Night[] } = $props();

  interface TypeAgg {
    type: string;
    w: number;
    t: number;
    l: number;
  }

  let types = $derived.by(() => {
    const map = new Map<string, TypeAgg>();
    for (const n of nights) {
      const agg = map.get(n.type) ?? { type: n.type, w: 0, t: 0, l: 0 };
      agg.w += n.w;
      agg.t += n.t;
      agg.l += n.l;
      map.set(n.type, agg);
    }
    return [...map.values()].sort((a, b) => ppg(b) - ppg(a));
  });
</script>

{#if types.length >= 2}
  <div class="section-title">By type</div>
  <div class="typetable">
    {#each types as t (t.type)}
      <div class="trow">
        <TypeIcon type={t.type} size={22} />
        <span class="tname">{t.type}</span>
        <span class="mono">{t.w}-{t.t}-{t.l}</span>
        <span class="mono gold">{games(t) ? ppg(t).toFixed(2) : '—'}</span>
        <div class="bar">
          <div class="bar-fill" style="width:{(ppg(t) / 3) * 100}%;background:{colorOf(t.type)}"></div>
        </div>
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
  .typetable {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    overflow: hidden;
  }
  .trow {
    display: grid;
    grid-template-columns: 22px 1fr 68px 44px;
    grid-template-rows: auto auto;
    column-gap: 10px;
    row-gap: 6px;
    align-items: center;
    padding: 10px 13px;
    border-bottom: 1px solid var(--line);
  }
  .trow:last-child {
    border-bottom: none;
  }
  .tname {
    font-weight: 600;
    font-size: 14px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mono {
    font-family: var(--display);
    font-weight: 600;
    font-size: 13px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .mono.gold {
    color: var(--gold);
  }
  .bar {
    grid-column: 1 / -1;
    height: 5px;
    border-radius: 3px;
    background: rgba(0, 0, 0, 0.22);
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    border-radius: 3px;
  }
</style>
