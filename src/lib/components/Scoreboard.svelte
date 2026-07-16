<script lang="ts">
  import type { Night } from '$lib/types';
  import { ppg, rollingPpg } from '$lib/pokemon';
  import TrendChart from './TrendChart.svelte';

  let { nights }: { nights: Night[] } = $props();

  let totals = $derived(
    nights.reduce((a, n) => ({ w: a.w + n.w, t: a.t + n.t, l: a.l + n.l }), { w: 0, t: 0, l: 0 })
  );
  let g = $derived(totals.w + totals.t + totals.l);
  let P = $derived(totals.w * 3 + totals.t);
  let seasonPpg = $derived(g ? P / g : 0);
  let avgPpg = $derived(g ? seasonPpg.toFixed(2) : '—');

  const FORM_WINDOW = 5;
  let formPpg = $derived(nights.length >= FORM_WINDOW ? rollingPpg(nights, FORM_WINDOW) : null);
  let formDelta = $derived(formPpg !== null ? formPpg - seasonPpg : 0);

  /** Splits every match with a recorded turn order into going-first / going-second W/T/L totals. */
  function turnOrderTotals(list: Night[]): { first: { w: number; t: number; l: number }; second: { w: number; t: number; l: number } } {
    const first = { w: 0, t: 0, l: 0 };
    const second = { w: 0, t: 0, l: 0 };
    for (const n of list) {
      for (const m of n.matches ?? []) {
        if (m.wentFirst === undefined) continue;
        const bucket = m.wentFirst ? first : second;
        if (m.result === 'W') bucket.w++;
        else if (m.result === 'T') bucket.t++;
        else bucket.l++;
      }
    }
    return { first, second };
  }

  let turnOrder = $derived(turnOrderTotals(nights));
  let firstGames = $derived(turnOrder.first.w + turnOrder.first.t + turnOrder.first.l);
  let secondGames = $derived(turnOrder.second.w + turnOrder.second.t + turnOrder.second.l);
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
  {#if firstGames + secondGames >= 3}
    <div class="turnorder">
      <div class="to-cell">
        <div class="to-lab">Going first</div>
        <div class="to-rec">{turnOrder.first.w}–{turnOrder.first.t}–{turnOrder.first.l}</div>
        <div class="to-ppg">{firstGames ? ppg(turnOrder.first).toFixed(2) : '—'} <span>ppg</span></div>
      </div>
      <div class="to-cell">
        <div class="to-lab">Going second</div>
        <div class="to-rec">{turnOrder.second.w}–{turnOrder.second.t}–{turnOrder.second.l}</div>
        <div class="to-ppg">{secondGames ? ppg(turnOrder.second).toFixed(2) : '—'} <span>ppg</span></div>
      </div>
    </div>
  {/if}
  {#if formPpg !== null}
    <div class="form">
      <div class="form-lab">Last {FORM_WINDOW} nights</div>
      <div class="form-val">
        {formPpg.toFixed(2)} <span>ppg</span>
        {#if Math.abs(formDelta) >= 0.01}
          <span class="arrow" class:up={formDelta > 0} class:down={formDelta < 0}
            >{formDelta > 0 ? '▲' : '▼'} {Math.abs(formDelta).toFixed(2)} vs season</span
          >
        {:else}
          <span class="arrow flat">on pace with season</span>
        {/if}
      </div>
    </div>
  {/if}
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
    color: var(--win-text);
  }
  .wtl .t .num {
    color: var(--tie-text);
  }
  .wtl .l .num {
    color: var(--loss-text);
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
  .turnorder {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
    margin-top: 10px;
    position: relative;
  }
  .to-cell {
    background: rgba(0, 0, 0, 0.18);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 9px 8px;
    text-align: center;
  }
  .to-lab {
    font-size: 9.5px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 5px;
  }
  .to-rec {
    font-family: var(--display);
    font-weight: 700;
    font-size: 15px;
    font-variant-numeric: tabular-nums;
  }
  .to-ppg {
    font-size: 11px;
    color: var(--muted);
    margin-top: 3px;
    font-variant-numeric: tabular-nums;
  }
  .to-ppg span {
    font-size: 9px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .form {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: 10px;
    padding: 9px 12px;
    background: rgba(0, 0, 0, 0.18);
    border: 1px solid var(--line);
    border-radius: 10px;
    position: relative;
  }
  .form-lab {
    font-size: 9.5px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .form-val {
    font-family: var(--display);
    font-weight: 700;
    font-size: 15px;
    font-variant-numeric: tabular-nums;
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .form-val > span:first-of-type {
    font-family: inherit;
    font-weight: 400;
    font-size: 9px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .arrow {
    font-family: inherit;
    font-weight: 600;
    font-size: 11px;
    letter-spacing: normal;
    text-transform: none;
  }
  .arrow.up {
    color: var(--win-text);
  }
  .arrow.down {
    color: var(--loss-text);
  }
  .arrow.flat {
    color: var(--muted);
    font-weight: 400;
  }
</style>
