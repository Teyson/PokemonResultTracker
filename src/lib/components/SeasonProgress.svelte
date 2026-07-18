<script lang="ts">
  import type { Season } from '$lib/types';
  import { seasonProgress, currentSeasonId, todayISO, fmtDate } from '$lib/pokemon';

  let { seasons, selectedSeason }: { seasons: Season[]; selectedSeason: Season | null } = $props();

  let today = todayISO();
  let progress = $derived(selectedSeason ? seasonProgress(selectedSeason, today) : null);
  // "All time" is selected but a season is currently running: showing progress
  // for a season the user didn't pick would be misleading, so stay silent.
  let isOffSeason = $derived(!selectedSeason && seasons.length > 0 && currentSeasonId(seasons, today) === null);
</script>

{#if selectedSeason && progress}
  <div class="season-progress" class:final={progress.isFinalStretch}>
    <b>{selectedSeason.name}</b>
    <span>week {progress.weekNumber}{progress.totalWeeks ? ` of ${progress.totalWeeks}` : ''}</span>
    {#if progress.totalWeeks !== null && selectedSeason.endsOn}
      <span>
        {#if progress.isFinalStretch}
          {progress.weeksLeft === 0 ? 'final week' : `${progress.weeksLeft} week${progress.weeksLeft === 1 ? '' : 's'} left`}
        {:else}
          ends {fmtDate(selectedSeason.endsOn)}
        {/if}
      </span>
    {/if}
  </div>
{:else if isOffSeason}
  <div class="season-progress off">Off-season — no active season right now</div>
{/if}

<style>
  .season-progress {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 7px;
    font-size: 11.5px;
    color: var(--muted);
    margin: -4px 2px 14px;
  }
  .season-progress b {
    color: var(--text);
    font-weight: 600;
  }
  .season-progress span::before {
    content: '· ';
  }
  .season-progress.final span:last-child {
    color: var(--gold);
  }
  .season-progress.off {
    color: var(--muted2);
    font-style: italic;
  }
</style>
