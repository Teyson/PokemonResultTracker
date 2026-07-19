<script lang="ts">
  import type { Season, LeaderboardEntry } from '$lib/types';

  let { entries, leagueName }: { entries: { season: Season; champion: LeaderboardEntry | null }[]; leagueName: string } =
    $props();
</script>

{#if entries.length > 0}
  <div class="section-title">Hall of fame{leagueName ? ` · ${leagueName}` : ''}</div>
  <div class="hof-scroll">
    <div class="hof">
      {#each entries as e (e.season.id)}
        <div class="card">
          <div class="season">{e.season.name}</div>
          {#if e.champion}
            <div class="champion">🏆 {e.champion.displayName}</div>
            <div class="record">{e.champion.w}-{e.champion.t}-{e.champion.l}</div>
          {:else}
            <div class="champion muted">No standings</div>
          {/if}
        </div>
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
  .hof-scroll {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    margin-bottom: 22px;
  }
  .hof {
    display: flex;
    gap: 10px;
    padding-bottom: 2px;
  }
  .card {
    flex: 0 0 auto;
    min-width: 128px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 10px 12px;
    text-align: center;
  }
  .season {
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .champion {
    font-family: var(--display);
    font-weight: 700;
    font-size: 13.5px;
    margin-top: 7px;
    white-space: nowrap;
  }
  .champion.muted {
    color: var(--muted2);
    font-weight: 500;
    font-size: 12px;
  }
  .record {
    font-size: 11px;
    color: var(--muted2);
    margin-top: 3px;
  }
</style>
