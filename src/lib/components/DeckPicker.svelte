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
</script>

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
    {#each visibleDecks as d (d.id ?? d.name)}
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
