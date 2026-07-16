<script lang="ts">
  import type { Night } from '$lib/types';
  import { colorOf, ppg, fmtShort } from '$lib/pokemon';

  let { nights, avg }: { nights: Night[]; avg: string } = $props();

  const BW = 34;
  const GAP = 10;
  const H = 88;
  const TOP = 16;

  // Nights arrive newest-first from the API; the chart reads newest-to-oldest, left to right.
  let chrono = $derived(nights);
  let width = $derived(chrono.length * (BW + GAP) - GAP + 8);

  function barHeight(n: Night): number {
    return Math.max(3, (ppg(n) / 3) * (H - TOP - 16));
  }
  function barX(i: number): number {
    return 4 + i * (BW + GAP);
  }
  function barY(n: Night): number {
    return TOP + (H - TOP - 16 - barHeight(n));
  }
  let avgY = $derived(TOP + (H - TOP - 16) * (1 - (avg === '—' ? 0 : Number(avg) / 3)));
</script>

<div class="trend">
  <div class="trend-head">
    <span class="t">Pts / game by night</span>
    <span class="avg">avg <b>{avg}</b></span>
  </div>
  <div class="chart-scroll">
    <svg width={width} height={H + 4} viewBox="0 0 {width} {H + 4}">
      {#if avg !== '—'}
        <line
          x1="0"
          y1={avgY}
          x2={width}
          y2={avgY}
          stroke="#f6c945"
          stroke-width="1"
          stroke-dasharray="3 4"
          opacity="0.55"
        />
      {/if}
      {#each chrono as n, i (n.id)}
        <rect x={barX(i)} y={barY(n)} width={BW} height={barHeight(n)} rx="4" fill={colorOf(n.type)} opacity="0.92" />
        <text
          x={barX(i) + BW / 2}
          y={barY(n) - 4}
          text-anchor="middle"
          fill="#c9cce0"
          font-size="9"
          font-family="'Chakra Petch',sans-serif"
          font-weight="600">{ppg(n).toFixed(1)}</text
        >
        <text x={barX(i) + BW / 2} y={H} text-anchor="middle" fill="#767c96" font-size="9">{fmtShort(n.date)}</text>
      {/each}
    </svg>
  </div>
</div>

<style>
  .trend {
    margin-top: 14px;
    position: relative;
  }
  .trend-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 8px;
  }
  .trend-head .t {
    font-family: var(--display);
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .trend-head .avg {
    font-size: 11px;
    color: var(--muted);
  }
  .trend-head .avg b {
    color: var(--gold);
    font-family: var(--display);
  }
  .chart-scroll {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    padding-bottom: 2px;
  }
</style>
