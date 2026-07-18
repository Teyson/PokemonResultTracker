<script lang="ts">
  import type { Season } from '$lib/types';

  let {
    seasons,
    selectedSeasonId,
    onSelect
  }: { seasons: Season[]; selectedSeasonId: string | 'all'; onSelect: (id: string | 'all') => void } = $props();

  // Keep the pill row from growing without bound as seasons accumulate over
  // the years — only the most recent few are always-visible pills; older ones
  // live behind a "More" dropdown instead of wrapping into extra rows.
  const VISIBLE_SEASON_COUNT = 3;

  let moreOpen = $state(false);
  let el: HTMLDivElement | undefined = $state();

  let visibleSeasons = $derived(seasons.slice(0, VISIBLE_SEASON_COUNT));
  let overflowSeasons = $derived(seasons.slice(VISIBLE_SEASON_COUNT));
  let selectedOverflowSeason = $derived(overflowSeasons.find((s) => s.id === selectedSeasonId) ?? null);

  function pick(id: string | 'all') {
    onSelect(id);
    moreOpen = false;
  }

  function onDocClick(e: MouseEvent) {
    if (moreOpen && el && !el.contains(e.target as Node)) moreOpen = false;
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') moreOpen = false;
  }
</script>

<svelte:window onclick={onDocClick} onkeydown={onKeydown} />

{#if seasons.length > 0}
  <div class="season-switcher" bind:this={el}>
    <button class="pill" class:active={selectedSeasonId === 'all'} onclick={() => pick('all')}>All time</button>
    {#each visibleSeasons as s (s.id)}
      <button class="pill" class:active={selectedSeasonId === s.id} onclick={() => pick(s.id)}>{s.name}</button>
    {/each}
    {#if overflowSeasons.length > 0}
      <div class="more-wrap">
        <button
          class="pill more-trigger"
          class:active={selectedOverflowSeason !== null}
          aria-haspopup="true"
          aria-expanded={moreOpen}
          onclick={() => (moreOpen = !moreOpen)}
        >
          {selectedOverflowSeason ? selectedOverflowSeason.name : 'More'}
          <span class="chev-sm">▾</span>
        </button>
        {#if moreOpen}
          <div class="more-menu">
            {#each overflowSeasons as s (s.id)}
              <button class="more-item" class:active={selectedSeasonId === s.id} onclick={() => pick(s.id)}>{s.name}</button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .season-switcher {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .season-switcher .pill {
    flex: 0 0 auto;
    font-family: inherit;
    font-size: 11.5px;
    letter-spacing: 0.02em;
    color: var(--muted);
    background: transparent;
    border: 1px solid var(--line);
    border-radius: 20px;
    padding: 5px 13px;
    cursor: pointer;
    white-space: nowrap;
  }
  .season-switcher .pill.active {
    color: var(--text);
    border-color: var(--muted2);
    background: var(--panel2);
  }
  .more-wrap {
    position: relative;
    flex: 0 0 auto;
  }
  .more-trigger {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .chev-sm {
    font-size: 8px;
    color: var(--muted2);
    line-height: 1;
    transition: transform 0.15s;
  }
  .more-trigger[aria-expanded='true'] .chev-sm {
    transform: rotate(180deg);
  }
  .more-menu {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 20;
    display: flex;
    flex-direction: column;
    max-height: 260px;
    overflow-y: auto;
    min-width: 160px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 6px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
  }
  .more-item {
    font-family: inherit;
    font-size: 12.5px;
    color: var(--text);
    text-decoration: none;
    border: none;
    background: transparent;
    border-radius: 7px;
    padding: 8px 10px;
    white-space: nowrap;
    text-align: left;
    cursor: pointer;
  }
  .more-item:hover {
    background: var(--panel2);
  }
  .more-item.active {
    color: var(--gold);
  }
</style>
