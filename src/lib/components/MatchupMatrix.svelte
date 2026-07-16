<script lang="ts">
  import type { Night } from '$lib/types';
  import { colorOf } from '$lib/pokemon';

  let { nights }: { nights: Night[] } = $props();

  interface Cell {
    name: string;
    w: number;
    t: number;
    l: number;
  }
  interface Row {
    name: string;
    type: string;
    total: number;
    opponents: Map<string, Cell>;
  }
  interface Col {
    key: string;
    name: string;
    total: number;
  }

  let matrix = $derived.by(() => {
    const rowMap = new Map<string, Row>();
    const colTotals = new Map<string, Col>();

    for (const n of nights) {
      for (const m of n.matches ?? []) {
        if (!m.opponentDeck) continue;
        const rk = n.deck.trim().toLowerCase();
        const ck = m.opponentDeck.trim().toLowerCase();

        const row = rowMap.get(rk) ?? { name: n.deck, type: n.type, total: 0, opponents: new Map() };
        const cell = row.opponents.get(ck) ?? { name: m.opponentDeck, w: 0, t: 0, l: 0 };
        if (m.result === 'W') cell.w++;
        else if (m.result === 'T') cell.t++;
        else cell.l++;
        row.opponents.set(ck, cell);
        row.total++;
        rowMap.set(rk, row);

        const col = colTotals.get(ck) ?? { key: ck, name: m.opponentDeck, total: 0 };
        col.total++;
        colTotals.set(ck, col);
      }
    }

    const rows = [...rowMap.values()].sort((a, b) => b.total - a.total);
    const cols = [...colTotals.values()].sort((a, b) => b.total - a.total);
    return { rows, cols };
  });

  function games(c: Cell): number {
    return c.w + c.t + c.l;
  }

  // Score rate on the same 0-3 ppg scale used everywhere else in the app, expressed as a percent.
  function scorePct(c: Cell): number {
    const g = games(c);
    return g ? Math.round(((c.w * 3 + c.t) / (g * 3)) * 100) : 0;
  }
</script>

{#if matrix.rows.length > 0}
  <div class="section-title">Matchups</div>
  <div class="matrix-scroll">
    <div class="matrix" style="grid-template-columns: 118px repeat({matrix.cols.length}, 82px)">
      <div class="cell corner"></div>
      {#each matrix.cols as col (col.key)}
        <div class="cell colhead"><span>{col.name}</span></div>
      {/each}
      {#each matrix.rows as row (row.name)}
        <div class="cell rowhead">
          <span class="dot" style="background:{colorOf(row.type)}"></span><span>{row.name}</span>
        </div>
        {#each matrix.cols as col (col.key)}
          {@const cell = row.opponents.get(col.key)}
          {@const g = cell ? games(cell) : 0}
          {@const lowData = cell !== undefined && g < 3}
          <div
            class="cell data"
            class:low={lowData}
            style={cell && !lowData
              ? `background: color-mix(in srgb, color-mix(in srgb, var(--win) ${scorePct(cell)}%, var(--loss)) 32%, transparent)`
              : ''}
          >
            {#if cell}
              <span class="rec">{cell.w}-{cell.t}-{cell.l}</span>
              <span class="pct">{lowData ? 'low data' : `${scorePct(cell)}%`}</span>
            {:else}
              <span class="dash">—</span>
            {/if}
          </div>
        {/each}
      {/each}
    </div>
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
  .matrix-scroll {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
  }
  .matrix {
    display: grid;
    width: max-content;
    min-width: 100%;
  }
  .cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 8px 6px;
    border-bottom: 1px solid var(--line);
    border-right: 1px solid var(--line);
    min-width: 0;
    text-align: center;
  }
  .corner {
    background: rgba(0, 0, 0, 0.2);
  }
  .colhead {
    background: rgba(0, 0, 0, 0.2);
    font-size: 10px;
    letter-spacing: 0.03em;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .colhead span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }
  .rowhead {
    flex-direction: row;
    justify-content: flex-start;
    align-items: center;
    gap: 7px;
    font-weight: 600;
    font-size: 13px;
    text-align: left;
    background: rgba(0, 0, 0, 0.12);
  }
  .rowhead span:last-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rowhead .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex: 0 0 auto;
  }
  .data .rec {
    font-family: var(--display);
    font-weight: 600;
    font-size: 12.5px;
    font-variant-numeric: tabular-nums;
  }
  .data .pct {
    font-size: 9.5px;
    color: var(--muted);
  }
  .data.low {
    opacity: 0.55;
  }
  .data .dash {
    color: var(--muted2);
  }
</style>
