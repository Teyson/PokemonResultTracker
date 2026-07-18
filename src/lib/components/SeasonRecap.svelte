<script lang="ts">
  import type { Season, LeaderboardEntry } from '$lib/types';
  import { ppg, games } from '$lib/pokemon';
  import { slide } from 'svelte/transition';

  let { season, entries }: { season: Season; entries: LeaderboardEntry[] } = $props();

  const MEDALS = ['🥇', '🥈', '🥉'];

  let open = $state(true);

  let top3 = $derived(entries.slice(0, 3));
  let totals = $derived(
    entries.reduce((a, e) => ({ nights: a.nights + e.nights, games: a.games + games(e) }), { nights: 0, games: 0 })
  );
</script>

<div class="section-title toggle" role="button" tabindex="0" onclick={() => (open = !open)} onkeydown={(e) => e.key === 'Enter' && (open = !open)}>
  Season recap · {season.name}
  <span class="chev">{open ? '▴' : '▾'}</span>
</div>
{#if open}
  <div class="recap" transition:slide={{ duration: 220 }}>
    {#if top3.length > 0}
      <div class="standings">
        {#each top3 as e, i (e.login)}
          <div class="row">
            <span class="medal">{MEDALS[i]}</span>
            <span class="login">{e.login}</span>
            <span class="mono">{e.w}-{e.t}-{e.l}</span>
            <span class="mono gold">{ppg(e).toFixed(2)}</span>
          </div>
        {/each}
      </div>
    {:else}
      <div class="empty">No league nights logged this season.</div>
    {/if}
    <div class="totals">
      <div class="card">
        <div class="v">{totals.nights}</div>
        <div class="k">Nights logged</div>
      </div>
      <div class="card">
        <div class="v">{totals.games}</div>
        <div class="k">Games played</div>
      </div>
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
  .recap {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 12px;
    margin-bottom: 22px;
  }
  .standings {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .row {
    display: grid;
    grid-template-columns: 22px 1fr 70px 56px;
    align-items: center;
    gap: 8px;
    padding: 6px 4px;
    font-size: 12.5px;
  }
  .medal {
    font-size: 15px;
  }
  .login {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mono {
    font-family: var(--display);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  .mono.gold {
    color: var(--gold);
  }
  .empty {
    color: var(--muted);
    font-size: 12.5px;
    text-align: center;
    padding: 8px;
  }
  .totals {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--line);
  }
  .card {
    text-align: center;
  }
  .v {
    font-family: var(--display);
    font-weight: 700;
    font-size: 18px;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .k {
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
    margin-top: 5px;
  }
</style>
