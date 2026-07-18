<script lang="ts">
  import { TYPES, colorOf } from '$lib/pokemon';
  import TypeIcon from './TypeIcon.svelte';

  export interface DeckOption {
    id?: string;
    name: string;
    type: string;
    owner?: string | null;
    timesPlayedAgainst?: number;
    lastPlayedAgainst?: string | null;
  }

  type SortMode = 'name' | 'owner' | 'recent' | 'most';

  let {
    decks,
    label,
    idPrefix,
    selectedName,
    selectedId,
    isNew,
    newName,
    type,
    clearable = false,
    searchable = false,
    onSelect,
    onSelectNew,
    onClear,
    onNewNameInput,
    onTypeSelect
  }: {
    decks: DeckOption[];
    label: string;
    idPrefix: string;
    selectedName: string;
    selectedId?: string;
    isNew: boolean;
    newName: string;
    type: string;
    clearable?: boolean;
    searchable?: boolean;
    onSelect: (d: DeckOption) => void;
    onSelectNew: () => void;
    onClear?: () => void;
    onNewNameInput: (v: string) => void;
    onTypeSelect: (t: string) => void;
  } = $props();

  let search = $state('');
  let sortMode = $state<SortMode>('most');

  let visibleDecks = $derived.by(() => {
    if (!searchable) return decks;
    const q = search.trim().toLowerCase();
    const filtered = q
      ? decks.filter((d) => d.name.toLowerCase().includes(q) || (d.owner ?? '').toLowerCase().includes(q))
      : decks;
    const sorted = [...filtered];
    switch (sortMode) {
      case 'name':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'owner':
        sorted.sort((a, b) => (a.owner ?? '').localeCompare(b.owner ?? '') || a.name.localeCompare(b.name));
        break;
      case 'recent':
        sorted.sort(
          (a, b) =>
            (b.lastPlayedAgainst ?? '').localeCompare(a.lastPlayedAgainst ?? '') || a.name.localeCompare(b.name)
        );
        break;
      case 'most':
        sorted.sort((a, b) => (b.timesPlayedAgainst ?? 0) - (a.timesPlayedAgainst ?? 0) || a.name.localeCompare(b.name));
        break;
    }
    return sorted;
  });

  // The plain (non-searchable) chip row — used for the player's own decks —
  // only ever shows the first few chips, same "More" pill + dropdown pattern
  // as SeasonSwitcher.svelte. The caller is responsible for the order (own-
  // deck lists are pre-sorted by recency in NightForm.svelte); this component
  // only decides where to cut the row.
  const VISIBLE_OWN_DECK_COUNT = 3;
  let ownVisibleDecks = $derived(decks.slice(0, VISIBLE_OWN_DECK_COUNT));
  let ownOverflowDecks = $derived(decks.slice(VISIBLE_OWN_DECK_COUNT));
  let selectedOverflowDeck = $derived(
    ownOverflowDecks.find((d) => (d.id ? d.id === selectedId : d.name === selectedName)) ?? null
  );

  let moreOpen = $state(false);
  let moreEl: HTMLDivElement | undefined = $state();

  function pickOverflow(d: DeckOption) {
    onSelect(d);
    moreOpen = false;
  }

  function onDocClick(e: MouseEvent) {
    if (moreOpen && moreEl && !moreEl.contains(e.target as Node)) moreOpen = false;
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') moreOpen = false;
  }
</script>

<svelte:window onclick={onDocClick} onkeydown={onKeydown} />

<div class="field">
  <span class="field-label" id="{idPrefix}Label">{label}</span>
  {#if searchable}
    <div class="pickertools">
      <input
        type="text"
        class="search"
        placeholder="Search by deck or owner…"
        autocomplete="off"
        value={search}
        oninput={(e) => (search = (e.currentTarget as HTMLInputElement).value)}
      />
      <select class="sort" value={sortMode} onchange={(e) => (sortMode = e.currentTarget.value as SortMode)}>
        <option value="most">Most played against</option>
        <option value="recent">Recently played against</option>
        <option value="name">Name (A–Z)</option>
        <option value="owner">Owner (A–Z)</option>
      </select>
    </div>
  {/if}
  <div class="deckchips" class:scrollable={searchable} role="group" aria-labelledby="{idPrefix}Label">
    {#if clearable}
      <button type="button" class="dchip clear" aria-pressed={!isNew && !selectedName} onclick={onClear}>None</button>
    {/if}
    {#each (searchable ? visibleDecks : ownVisibleDecks) as d (d.id ?? d.name)}
      <button
        type="button"
        class="dchip"
        aria-pressed={!isNew && (d.id ? d.id === selectedId : selectedName === d.name)}
        onclick={() => onSelect(d)}
      >
        <TypeIcon type={d.type} size={16} />{d.name}
        {#if d.owner}<span class="chipowner">· {d.owner}</span>{/if}
        {#if d.timesPlayedAgainst}<span class="chipcount">×{d.timesPlayedAgainst}</span>{/if}
      </button>
    {/each}
    {#if !searchable && ownOverflowDecks.length > 0}
      <div class="more-wrap" bind:this={moreEl}>
        <button
          type="button"
          class="dchip more-trigger"
          aria-pressed={!isNew && selectedOverflowDeck !== null}
          aria-haspopup="true"
          aria-expanded={moreOpen}
          onclick={() => (moreOpen = !moreOpen)}
        >
          {#if selectedOverflowDeck}<TypeIcon type={selectedOverflowDeck.type} size={16} />{/if}{selectedOverflowDeck
            ? selectedOverflowDeck.name
            : 'More'}
          <span class="chev-sm">▾</span>
        </button>
        {#if moreOpen}
          <div class="more-menu">
            {#each ownOverflowDecks as d (d.id ?? d.name)}
              <button
                type="button"
                class="more-item"
                class:active={!isNew && (d.id ? d.id === selectedId : selectedName === d.name)}
                onclick={() => pickOverflow(d)}
              >
                <TypeIcon type={d.type} size={16} />{d.name}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
    <button type="button" class="dchip new" aria-pressed={isNew} onclick={onSelectNew}>+ New deck</button>
  </div>
  {#if isNew}
    <input
      type="text"
      placeholder="New deck name"
      autocomplete="off"
      style="margin-top:9px;"
      value={newName}
      oninput={(e) => onNewNameInput((e.currentTarget as HTMLInputElement).value)}
    />
    <div class="swatches" role="group" aria-labelledby="{idPrefix}Label" style="margin-top:9px;">
      {#each TYPES as [tname] (tname)}
        <button
          type="button"
          class="sw"
          style="color:{colorOf(tname)}"
          aria-pressed={type === tname}
          title={tname}
          onclick={() => onTypeSelect(tname)}
        >
          <TypeIcon type={tname} size={26} />
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .field {
    flex: 1;
    min-width: 0;
    margin-bottom: 13px;
  }
  .field-label {
    display: block;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 6px;
  }
  .pickertools {
    display: flex;
    gap: 7px;
    margin-bottom: 9px;
  }
  .pickertools .search {
    flex: 1;
    min-width: 0;
  }
  .pickertools .sort {
    flex: 0 0 auto;
    font-family: inherit;
    font-size: 12px;
    color: var(--text);
    background: var(--ink);
    border: 1px solid var(--line);
    border-radius: 9px;
    padding: 0 8px;
    cursor: pointer;
  }
  .deckchips {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }
  .deckchips.scrollable {
    max-height: 220px;
    overflow-y: auto;
    padding-right: 2px;
  }
  .dchip {
    display: flex;
    align-items: center;
    gap: 7px;
    background: var(--ink);
    border: 1px solid var(--line);
    color: var(--text);
    border-radius: 22px;
    padding: 9px 14px;
    font-size: 13.5px;
    cursor: pointer;
    font-family: inherit;
    transition: transform 0.07s;
  }
  .dchip:active {
    transform: scale(0.96);
  }
  .dchip:focus-visible {
    outline: 2px solid var(--red);
    outline-offset: 2px;
  }
  .dchip[aria-pressed='true'] {
    border-color: var(--red);
    background: rgba(239, 47, 66, 0.13);
    box-shadow: 0 0 0 2px rgba(239, 47, 66, 0.2);
  }
  .chipowner {
    color: var(--muted2);
    font-weight: 400;
  }
  .chipcount {
    color: var(--muted);
    font-size: 11.5px;
  }
  .dchip.new {
    border-style: dashed;
    color: var(--muted);
  }
  .dchip.new[aria-pressed='true'] {
    border-color: var(--gold);
    color: var(--gold);
    background: rgba(246, 201, 69, 0.1);
    box-shadow: none;
  }
  .dchip.clear {
    color: var(--muted);
  }
  .dchip.clear[aria-pressed='true'] {
    border-color: var(--line);
    background: var(--panel2);
    box-shadow: none;
    color: var(--text);
  }
  .more-wrap {
    position: relative;
    flex: 0 0 auto;
  }
  .more-trigger {
    display: inline-flex;
    align-items: center;
    gap: 7px;
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
    min-width: 180px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 6px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
  }
  .more-item {
    display: flex;
    align-items: center;
    gap: 7px;
    font-family: inherit;
    font-size: 12.5px;
    color: var(--text);
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
  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }
  .sw {
    width: 26px;
    height: 26px;
    box-sizing: content-box;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.08s;
    padding: 0;
    background: none;
  }
  .sw:active {
    transform: scale(0.9);
  }
  .sw:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 2px;
  }
  .sw[aria-pressed='true'] {
    border-color: var(--text);
    box-shadow:
      0 0 0 2px var(--ink),
      0 0 0 4px currentColor;
  }
</style>
