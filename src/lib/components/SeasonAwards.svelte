<script lang="ts">
  import type { Season, LeaderboardEntry, Night } from '$lib/types';
  import { fmtDate } from '$lib/pokemon';
  import { personalSeasonAwards } from '$lib/seasonAwards';

  let {
    season,
    entries,
    nights,
    myLogin,
    ended
  }: { season: Season; entries: LeaderboardEntry[]; nights: Night[]; myLogin: string; ended: boolean } = $props();

  let awards = $derived(personalSeasonAwards(nights, season));
  let champion = $derived(entries[0] ?? null);
  let isChampion = $derived(champion !== null && champion.login === myLogin);
  let myRank = $derived(entries.findIndex((e) => e.login === myLogin) + 1);
</script>

<div class="section-title">
  Season awards
  <span class="tag" class:final={ended}>{ended ? 'Final' : 'Provisional'}</span>
</div>
<div class="awards">
  <div class="card champion" class:mine={isChampion}>
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
  .tag {
    font-family: inherit;
    letter-spacing: normal;
    text-transform: none;
    font-size: 10px;
    color: var(--muted2);
    border: 1px solid var(--line);
    border-radius: 20px;
    padding: 2px 9px;
  }
  .tag.final {
    color: var(--gold);
    border-color: rgba(246, 201, 69, 0.35);
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
  .card.champion.mine {
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
