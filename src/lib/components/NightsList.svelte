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
</script>

{#if nights.length === 0}
  <div class="card empty">No nights logged yet.<br />Fill in above and hit <b>Log night</b>.</div>
{:else}
  {#each nights as n (n.id)}
    <div class="night">
      <div class="spine" style="background:{colorOf(n.type)}"></div>
      <div class="body">
        <div class="top">
          <span class="deck">{n.deck}</span>
          <span class="chip" style="background:{colorOf(n.type)}22;color:{colorOf(n.type)}">{n.type}</span>
        </div>
        <div class="date">
          {fmtDate(n.date)}
          {#if showOwner}<span class="owner">· {n.createdBy}</span>{/if}
        </div>
        {#if n.matches && n.matches.length > 0}
          <div class="matchstrip" aria-label="Match results">
            {#each n.matches as m (m.roundNo)}
              <span class="mchip {m.result.toLowerCase()}">{m.result}</span>
            {/each}
          </div>
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
  {/each}
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
    align-items: center;
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
    flex-wrap: wrap;
    gap: 3px;
    margin-top: 6px;
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
</style>
