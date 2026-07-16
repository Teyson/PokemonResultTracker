<script lang="ts">
  import type { Night } from '$lib/types';
  import { fmtDate } from '$lib/pokemon';
  import { computeRecords } from '$lib/records';
  import { slide } from 'svelte/transition';

  let { nights }: { nights: Night[] } = $props();

  let records = $derived(computeRecords(nights));
  let open = $state(false);
</script>

{#if nights.length >= 3}
  <div class="section-title toggle" role="button" tabindex="0" onclick={() => (open = !open)} onkeydown={(e) => e.key === 'Enter' && (open = !open)}>
    Records
    <span class="chev">{open ? '▴' : '▾'}</span>
  </div>
  {#if open}
    <div class="records" transition:slide={{ duration: 220 }}>
      <div class="card">
        <div class="v">{records.currentNightStreak}</div>
        <div class="k">Current streak</div>
        <div class="sub">nights won in a row</div>
      </div>
      <div class="card">
        <div class="v">{records.longestNightStreak}</div>
        <div class="k">Best streak</div>
        <div class="sub">longest run of winning nights</div>
      </div>
      {#if records.hasMatchData}
        <div class="card">
          <div class="v">{records.longestMatchWinStreak}</div>
          <div class="k">Match win streak</div>
          <div class="sub">longest run of match wins</div>
        </div>
        <div class="card">
          <div class="v">{records.longestMatchUnbeatenStreak}</div>
          <div class="k">Unbeaten streak</div>
          <div class="sub">wins and ties, no losses</div>
        </div>
      {/if}
      <div class="card">
        <div class="v">{records.totalNights}</div>
        <div class="k">Nights logged</div>
        <div class="sub">all-time</div>
      </div>
      <div class="card">
        <div class="v">{records.gamesMilestone.total}</div>
        <div class="k">Games played</div>
        <div class="sub">
          {#if records.gamesMilestone.next !== null}
            {records.gamesMilestone.remaining} to {records.gamesMilestone.next}
          {:else}
            all-time
          {/if}
        </div>
      </div>
      {#if records.bestNight}
        <div class="card best">
          <div class="v gold">{records.bestNight.ppg.toFixed(2)}</div>
          <div class="k">Best night</div>
          <div class="sub">{records.bestNight.night.deck} · {fmtDate(records.bestNight.night.date)}</div>
        </div>
      {/if}
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
  .chev {
    font-size: 11px;
  }
  .records {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }
  .card {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 12px 10px;
    text-align: center;
  }
  .card.best {
    grid-column: 1 / -1;
  }
  .v {
    font-family: var(--display);
    font-weight: 700;
    font-size: 22px;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .v.gold {
    color: var(--gold);
  }
  .k {
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
    margin-top: 7px;
  }
  .sub {
    font-size: 11px;
    color: var(--muted2);
    margin-top: 3px;
  }
</style>
