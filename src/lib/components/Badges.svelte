<script lang="ts">
  import type { Night } from '$lib/types';
  import { fmtDate } from '$lib/pokemon';
  import { computeBadges, type Badge } from '$lib/achievements';
  import { slide } from 'svelte/transition';

  let { nights }: { nights: Night[] } = $props();

  let badges = $derived(computeBadges(nights));
  let earnedCount = $derived(badges.filter((b) => b.earned).length);
  let open = $state(false);
  let showAll = $state(false);

  // Collapsed view: every earned badge plus the 3 unearned ones you're
  // closest to, so the grid stays scannable as the badge list grows.
  const CLOSEST_UNEARNED = 3;

  function closeness(b: Badge): number {
    return b.progress ? b.progress.current / b.progress.target : 0;
  }

  let closestIds = $derived(
    new Set(
      badges
        .filter((b) => !b.earned)
        .sort((a, b) => closeness(b) - closeness(a))
        .slice(0, CLOSEST_UNEARNED)
        .map((b) => b.id)
    )
  );
  let visible = $derived(showAll ? badges : badges.filter((b) => b.earned || closestIds.has(b.id)));
  let collapsible = $derived(badges.some((b) => !b.earned && !closestIds.has(b.id)));
</script>

{#if nights.length > 0}
  <div class="section-title toggle" role="button" tabindex="0" onclick={() => (open = !open)} onkeydown={(e) => e.key === 'Enter' && (open = !open)}>
    Badges
    <span class="count">{earnedCount}/{badges.length}</span>
    <span class="chev">{open ? '▴' : '▾'}</span>
  </div>
  {#if open}
    <div class="badges" transition:slide={{ duration: 220 }}>
      {#each visible as b (b.id)}
        <div class="card" class:earned={b.earned}>
          <div class="emoji">{b.emoji}</div>
          <div class="name">{b.name}</div>
          <div class="desc">{b.description}</div>
          {#if b.earned}
            <div class="status earned-on">{fmtDate(b.earnedOn ?? '')}</div>
          {:else if b.progress}
            <div class="bar">
              <div class="fill" style="width: {(100 * b.progress.current) / b.progress.target}%"></div>
            </div>
            <div class="status">{b.progress.current}/{b.progress.target}</div>
          {:else}
            <div class="status">not yet</div>
          {/if}
        </div>
      {/each}
    </div>
    {#if collapsible}
      <button class="show-all" transition:slide={{ duration: 220 }} onclick={() => (showAll = !showAll)}>
        {showAll ? 'Show fewer' : `Show all ${badges.length} badges`}
      </button>
    {/if}
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
  .count {
    font-family: inherit;
    letter-spacing: normal;
    text-transform: none;
    font-size: 11px;
    color: var(--muted2);
  }
  .chev {
    font-size: 11px;
  }
  .badges {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 10px;
  }
  .card {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 12px 10px;
    text-align: center;
    opacity: 0.55;
    filter: grayscale(0.8);
  }
  .card.earned {
    opacity: 1;
    filter: none;
    border-color: rgba(246, 201, 69, 0.35);
  }
  .emoji {
    font-size: 22px;
    line-height: 1;
  }
  .name {
    font-family: var(--display);
    font-weight: 700;
    font-size: 12.5px;
    margin-top: 7px;
  }
  .desc {
    font-size: 10.5px;
    color: var(--muted2);
    margin-top: 3px;
    line-height: 1.35;
  }
  .bar {
    height: 4px;
    border-radius: 2px;
    background: var(--panel2);
    margin-top: 8px;
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: var(--gold);
    border-radius: 2px;
  }
  .status {
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
    margin-top: 6px;
  }
  .status.earned-on {
    color: var(--gold);
  }
  .show-all {
    display: block;
    margin: 10px auto 0;
    font-family: inherit;
    font-size: 10.5px;
    letter-spacing: 0.04em;
    color: var(--muted);
    background: transparent;
    border: 1px solid var(--line);
    border-radius: 20px;
    padding: 4px 12px;
    cursor: pointer;
  }
  .show-all:hover {
    color: var(--text);
    border-color: var(--muted2);
  }
</style>
