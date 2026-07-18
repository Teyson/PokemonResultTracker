<script lang="ts">
  import type { Season, LeaderboardEntry, BestDeck, Night } from '$lib/types';
  import { fmtDate, ppg } from '$lib/pokemon';
  import { personalSeasonAwards } from '$lib/seasonAwards';
  import { slide } from 'svelte/transition';

  let {
    season,
    entries,
    bestDeck,
    nights,
    myLogin
  }: { season: Season; entries: LeaderboardEntry[]; bestDeck: BestDeck | null; nights: Night[]; myLogin: string } = $props();

  let open = $state(true);

  let awards = $derived(personalSeasonAwards(nights, season));
  let champion = $derived(entries[0] ?? null);
  let isChampion = $derived(champion !== null && champion.login === myLogin);
  let myRank = $derived(entries.findIndex((e) => e.login === myLogin) + 1);

  // Ties keep whoever's ranked higher (entries arrives pre-ranked) — simplest
  // deterministic pick without a second, competing tie-break rule.
  let mostAttended = $derived.by(() => {
    let best: LeaderboardEntry | null = null;
    for (const e of entries) {
      if (!best || e.nights > best.nights) best = e;
    }
    return best;
  });
  let isMostAttended = $derived(mostAttended !== null && mostAttended.login === myLogin);
  let isBestDeckOwner = $derived(bestDeck !== null && bestDeck.ownerLogin === myLogin);
</script>

<div class="section-title toggle" role="button" tabindex="0" onclick={() => (open = !open)} onkeydown={(e) => e.key === 'Enter' && (open = !open)}>
  Season awards
  <span class="chev">{open ? '▴' : '▾'}</span>
</div>
{#if open}
  <div class="awards" transition:slide={{ duration: 220 }}>
    <div class="card" class:mine={isChampion}>
      <div class="emoji">🏆</div>
      <div class="v name">{champion ? champion.login : '—'}</div>
      <div class="k">Champion</div>
      {#if champion}
        {#if isChampion}
          <div class="sub gold">That's you!</div>
        {:else if myRank > 0}
          <div class="sub">You're #{myRank}</div>
        {/if}
      {:else}
        <div class="sub">No league nights yet</div>
      {/if}
    </div>
    {#if mostAttended}
      <div class="card" class:mine={isMostAttended}>
        <div class="v name">{mostAttended.login}</div>
        <div class="k">Most nights attended</div>
        <div class="sub">{mostAttended.nights} night{mostAttended.nights === 1 ? '' : 's'}</div>
        {#if isMostAttended}
          <div class="sub gold">That's you!</div>
        {/if}
      </div>
    {/if}
    {#if bestDeck}
      <div class="card" class:mine={isBestDeckOwner}>
        <div class="v gold">{ppg(bestDeck).toFixed(2)}</div>
        <div class="k">Best deck</div>
        <div class="sub">{bestDeck.deck} · {bestDeck.ownerLogin} · {bestDeck.w}-{bestDeck.t}-{bestDeck.l}</div>
        {#if isBestDeckOwner}
          <div class="sub gold">That's you!</div>
        {/if}
      </div>
    {/if}
    <div class="card">
      <div class="v">{awards.nightsPlayed}</div>
      <div class="k">Your nights</div>
      <div class="sub">league nights this season</div>
    </div>
    {#if awards.bestDeck}
      <div class="card">
        <div class="v gold">{awards.bestDeck.ppg.toFixed(2)}</div>
        <div class="k">Your best deck</div>
        <div class="sub">{awards.bestDeck.deck} · {awards.bestDeck.w}-{awards.bestDeck.t}-{awards.bestDeck.l}</div>
      </div>
    {/if}
    {#if awards.biggestNight}
      <div class="card">
        <div class="v gold">{awards.biggestNight.ppg.toFixed(2)}</div>
        <div class="k">Your biggest night</div>
        <div class="sub">{awards.biggestNight.night.deck} · {fmtDate(awards.biggestNight.night.date)}</div>
      </div>
    {/if}
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
  .awards {
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
  .card.mine {
    border-color: rgba(246, 201, 69, 0.35);
  }
  .emoji {
    font-size: 20px;
    line-height: 1;
  }
  .v {
    font-family: var(--display);
    font-weight: 700;
    font-size: 18px;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    margin-top: 6px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .v.gold {
    color: var(--gold);
    font-size: 22px;
    margin-top: 0;
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
  .sub.gold {
    color: var(--gold);
    font-weight: 600;
  }
</style>
