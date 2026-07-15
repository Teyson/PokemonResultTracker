<script lang="ts">
  import type { Night } from '$lib/types';
  import TrendChart from './TrendChart.svelte';

  let { nights }: { nights: Night[] } = $props();

  let totals = $derived(
    nights.reduce((a, n) => ({ w: a.w + n.w, t: a.t + n.t, l: a.l + n.l }), { w: 0, t: 0, l: 0 })
  );
  let g = $derived(totals.w + totals.t + totals.l);
  let P = $derived(totals.w * 3 + totals.t);
  let avgPpg = $derived(g ? (P / g).toFixed(2) : '—');
</script>

<div class="board">
  <div class="board-label">Season record</div>
  <div class="wtl">
    <div class="cell w"><div class="num">{totals.w}</div><div class="tag">Wins</div></div>
    <div class="cell t"><div class="num">{totals.t}</div><div class="tag">Ties</div></div>
    <div class="cell l"><div class="num">{totals.l}</div><div class="tag">Losses</div></div>
  </div>
  <div class="readouts">
    <div class="readout"><div class="v">{g}</div><div class="k">Games</div></div>
    <div class="readout"><div class="v hero">{P}</div><div class="k">Points</div></div>
    <div class="readout"><div class="v hero">{avgPpg}</div><div class="k">Pts / game</div></div>
  </div>
  {#if nights.length >= 2}
    <TrendChart {nights} avg={avgPpg} />
  {/if}
</div>

<style>
  .board {
    background: linear-gradient(180deg, var(--panel) 0%, var(--ink2) 100%);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 18px 16px 16px;
    margin-bottom: 14px;
    position: relative;
    overflow: hidden;
  }
  .board::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image: radial-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px);
    background-size: 14px 14px;
    pointer-events: none;
  }
  .board-label {
    font-family: var(--display);
    font-size: 11px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 12px;
    position: relative;
  }
  .wtl {
    display: flex;
    gap: 10px;
    position: relative;
  }
  .wtl .cell {
    flex: 1;
    text-align: center;
    background: rgba(0, 0, 0, 0.22);
    border-radius: 11px;
    padding: 11px 4px 9px;
    border: 1px solid var(--line);
  }
  .wtl .num {
    font-family: var(--display);
    font-weight: 700;
    font-size: 34px;
    line-height: 1;
    letter-spacing: 0.02em;
    font-variant-numeric: tabular-nums;
  }
  .wtl .tag {
    font-size: 10px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    margin-top: 6px;
    color: var(--muted);
  }
  .wtl .w .num {
    color: var(--win);
  }
  .wtl .t .num {
    color: var(--tie);
  }
  .wtl .l .num {
    color: var(--loss);
  }
  .readouts {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin-top: 13px;
    position: relative;
  }
  .readout {
    background: rgba(0, 0, 0, 0.18);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 10px 8px;
    text-align: center;
  }
  .readout .v {
    font-family: var(--display);
    font-weight: 600;
    font-size: 20px;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .readout .v.hero {
    color: var(--gold);
  }
  .readout .k {
    font-size: 9.5px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
    margin-top: 6px;
  }
</style>
