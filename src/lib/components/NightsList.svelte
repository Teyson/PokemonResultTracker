<script lang="ts">
  import type { Night } from '$lib/types';
  import { colorOf, pts, ppg, fmtDate } from '$lib/pokemon';

  let {
    nights,
    showOwner = false,
    onEdit,
    onDelete
  }: {
    nights: Night[];
    showOwner?: boolean;
    onEdit: (n: Night) => void;
    onDelete: (n: Night) => void;
  } = $props();

  function confirmDelete(n: Night) {
    if (confirm(`Delete ${n.deck} — ${fmtDate(n.date)}?`)) onDelete(n);
  }

  let expanded = $state<Set<string>>(new Set());

  function toggleExpand(id: string) {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expanded = next;
  }

  const PAGE_SIZES = [5, 10, 25, 50, 100, Infinity];

  let pageSize = $state(5);
  let page = $state(1);

  let totalPages = $derived(Math.max(1, Math.ceil(nights.length / pageSize)));
  let pagedNights = $derived(nights.slice((page - 1) * pageSize, page * pageSize));

  $effect(() => {
    if (page > totalPages) page = totalPages;
  });

  function setPageSize(value: string) {
    pageSize = value === 'all' ? Infinity : Number(value);
    page = 1;
  }
</script>

{#if nights.length === 0}
  <div class="card empty">No nights logged yet.<br />Fill in above and hit <b>Log night</b>.</div>
{:else}
  {#each pagedNights as n (n.id)}
    <div class="night">
      <div class="spine" style="background:{colorOf(n.type)}"></div>
      <div class="content">
        <div class="mainrow">
          <div class="body">
            <div class="top">
              <span class="deck">{n.deck}</span>
              <span class="chip" style="background:{colorOf(n.type)}22;color:{colorOf(n.type)}">{n.type}</span>
              <span class="chip nighttype" class:casual={!n.isLeagueNight}>{n.isLeagueNight ? 'League' : 'Casual'}</span>
            </div>
            <div class="date">
              {fmtDate(n.date)}
              {#if showOwner}<span class="owner">· {n.createdByDisplay}</span>{/if}
            </div>
            {#if n.matches && n.matches.length > 0}
              <button
                type="button"
                class="matchstrip"
                aria-expanded={expanded.has(n.id)}
                aria-label="Toggle match details"
                onclick={() => toggleExpand(n.id)}
              >
                {#each n.matches as m (m.roundNo)}
                  <span class="mchip {m.result.toLowerCase()}">{m.result}</span>
                {/each}
                <span class="chev">{expanded.has(n.id) ? '▴' : '▾'}</span>
              </button>
            {/if}
          </div>
          <div class="stats">
            <div class="record">{n.w}<span class="s">–</span>{n.t}<span class="s">–</span>{n.l}</div>
            <div class="ppg"><div class="v">{ppg(n).toFixed(2)}</div><div class="k">{pts(n)} pts</div></div>
            <div class="rowbtns">
              <button title="Edit" aria-label="Edit night" onclick={() => onEdit(n)}>✎</button>
              <button class="del" title="Delete" aria-label="Delete night" onclick={() => confirmDelete(n)}>✕</button>
            </div>
          </div>
        </div>
        {#if expanded.has(n.id) && n.matches && n.matches.length > 0}
          <div class="matchdetail">
            {#each n.matches as m (m.roundNo)}
              <div class="mrow">
                <span class="mchip lg {m.result.toLowerCase()}">{m.result}</span>
                <span class="rn">R{m.roundNo}</span>
                {#if m.wentFirst !== undefined}
                  <span class="orderpill">{m.wentFirst ? '1st' : '2nd'}</span>
                {/if}
                {#if m.opponentDeck}
                  <span
                    class="vspill"
                    style="background:{colorOf(m.opponentType ?? 'Colorless')}22;color:{colorOf(
                      m.opponentType ?? 'Colorless'
                    )}">vs {m.opponentDeck}</span
                  >
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/each}
  <div class="pagination">
    <label class="pagesize">
      Show
      <select value={pageSize === Infinity ? 'all' : String(pageSize)} onchange={(e) => setPageSize(e.currentTarget.value)}>
        {#each PAGE_SIZES as size}
          <option value={size === Infinity ? 'all' : String(size)}>{size === Infinity ? 'All' : size}</option>
        {/each}
      </select>
      per page
    </label>
    {#if totalPages > 1}
      <div class="pager">
        <button type="button" aria-label="Previous page" disabled={page <= 1} onclick={() => (page -= 1)}>‹</button>
        <span class="pageinfo">Page {page} of {totalPages}</span>
        <button type="button" aria-label="Next page" disabled={page >= totalPages} onclick={() => (page += 1)}>›</button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .card {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 15px;
  }
  .empty {
    text-align: center;
    color: var(--muted);
    padding: 26px 16px;
    font-size: 13.5px;
    line-height: 1.6;
  }
  .night {
    display: flex;
    gap: 12px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 12px 13px 12px 0;
    margin-bottom: 9px;
    overflow: hidden;
    position: relative;
  }
  .spine {
    width: 5px;
    align-self: stretch;
    flex: 0 0 auto;
    border-radius: 0 3px 3px 0;
  }
  .night .content {
    flex: 1;
    min-width: 0;
  }
  .night .mainrow {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .night .body {
    flex: 1;
    min-width: 0;
  }
  .night .top {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .night .deck {
    font-weight: 600;
    font-size: 15px;
  }
  .chip {
    font-size: 9.5px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 2px 7px;
    border-radius: 20px;
    font-weight: 600;
  }
  .chip.nighttype {
    background: rgba(246, 201, 69, 0.15);
    color: var(--gold);
  }
  .chip.nighttype.casual {
    background: var(--panel2);
    color: var(--muted);
  }
  .night .date {
    font-size: 11.5px;
    color: var(--muted);
    margin-top: 3px;
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .night .owner {
    color: var(--muted2);
  }
  .matchstrip {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 3px;
    margin-top: 6px;
    border: none;
    background: transparent;
    padding: 0;
    cursor: pointer;
    font-family: inherit;
  }
  .matchstrip:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 2px;
  }
  .chev {
    color: var(--muted);
    font-size: 9px;
    margin-left: 3px;
  }
  .mchip {
    width: 16px;
    height: 16px;
    border-radius: 4px;
    font-size: 9px;
    font-weight: 700;
    font-family: var(--display);
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }
  .mchip.lg {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    font-size: 11px;
    flex: 0 0 auto;
  }
  .mchip.w {
    background: var(--win);
    color: #08110a;
  }
  .mchip.t {
    background: var(--tie);
    color: #191104;
  }
  .mchip.l {
    background: var(--loss);
    color: #fff;
  }
  .matchdetail {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .mrow {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .mrow .rn {
    font-size: 11px;
    color: var(--muted);
    flex: 0 0 auto;
  }
  .vspill {
    font-size: 10.5px;
    padding: 2px 8px;
    border-radius: 20px;
    font-weight: 600;
  }
  .orderpill {
    font-size: 10px;
    padding: 2px 7px;
    border-radius: 20px;
    font-weight: 600;
    color: var(--muted);
    border: 1px solid var(--line);
    flex: 0 0 auto;
  }
  .night .stats {
    display: flex;
    align-items: center;
    gap: 14px;
    flex: 0 0 auto;
  }
  .night .record {
    font-family: var(--display);
    font-weight: 700;
    font-size: 17px;
    letter-spacing: 0.02em;
    font-variant-numeric: tabular-nums;
  }
  .night .record .s {
    color: var(--muted2);
    margin: 0 1px;
  }
  .night .ppg {
    text-align: right;
  }
  .night .ppg .v {
    font-family: var(--display);
    font-weight: 600;
    font-size: 16px;
    color: var(--gold);
    font-variant-numeric: tabular-nums;
  }
  .night .ppg .k {
    font-size: 8.5px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .rowbtns {
    display: flex;
    flex-direction: column;
    gap: 5px;
    flex: 0 0 auto;
  }
  .rowbtns button {
    width: 30px;
    height: 26px;
    border-radius: 7px;
    border: 1px solid var(--line);
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    font-size: 13px;
    line-height: 1;
  }
  .rowbtns button:active {
    background: var(--panel2);
  }
  .rowbtns button.del:active {
    background: var(--red-deep);
    color: #fff;
  }
  .rowbtns button:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 2px;
  }
  @media (max-width: 440px) {
    .night {
      gap: 9px;
    }
    .night .stats {
      gap: 10px;
    }
  }
  .pagination {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin-top: 4px;
    padding: 4px 2px;
    font-size: 12px;
    color: var(--muted);
  }
  .pagesize {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .pagesize select {
    font-family: inherit;
    font-size: 12px;
    color: var(--text);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 7px;
    padding: 3px 6px;
    cursor: pointer;
  }
  .pager {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .pageinfo {
    font-variant-numeric: tabular-nums;
  }
  .pager button {
    width: 26px;
    height: 26px;
    border-radius: 7px;
    border: 1px solid var(--line);
    background: transparent;
    color: var(--text);
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
  }
  .pager button:disabled {
    color: var(--muted2);
    cursor: default;
    opacity: 0.5;
  }
  .pager button:not(:disabled):active {
    background: var(--panel2);
  }
  .pager button:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 2px;
  }
</style>
