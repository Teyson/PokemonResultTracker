<script lang="ts">
  import { getContext } from 'svelte';
  import type { AuthContext, DeckSummary } from '$lib/types';
  import { api } from '$lib/api';
  import { toast } from '$lib/toast.svelte';
  import { TYPES, colorOf } from '$lib/pokemon';
  import TypeIcon from '$lib/components/TypeIcon.svelte';
  import Toast from '$lib/components/Toast.svelte';
  import Masthead from '$lib/components/Masthead.svelte';

  const auth = getContext<AuthContext>('auth');
  let isAdmin = $derived(auth.isAdmin);

  let decksList = $state<DeckSummary[]>([]);
  let loaded = $state(false);
  let search = $state('');

  type SortKey = 'deck' | 'owner' | 'nights' | 'opponent';
  let sort = $state<{ key: SortKey; dir: 1 | -1 }>({ key: 'deck', dir: 1 });

  let editingId = $state<string | null>(null);
  let editName = $state('');
  let editType = $state('Colorless');
  let saving = $state(false);

  let mergingId = $state<string | null>(null);
  let mergeTargetId = $state('');
  let merging = $state(false);

  $effect(() => {
    if (isAdmin && !loaded) reload();
  });

  async function reload() {
    try {
      decksList = (await api<DeckSummary[]>('/api/decks')) ?? [];
      loaded = true;
    } catch (e) {
      toast(`Could not load decks: ${(e as Error).message}`, true);
    }
  }

  function isDeletable(d: DeckSummary): boolean {
    return (d.nightsCount ?? 0) === 0 && (d.opponentCount ?? 0) === 0;
  }

  function toggleSort(key: SortKey) {
    sort = sort.key === key ? { key, dir: sort.dir === 1 ? -1 : 1 } : { key, dir: key === 'deck' || key === 'owner' ? 1 : -1 };
  }

  function sortArrow(key: SortKey): string {
    if (sort.key !== key) return '';
    return sort.dir === 1 ? ' ▲' : ' ▼';
  }

  let filteredDecks = $derived.by(() => {
    const q = search.trim().toLowerCase();
    const rows = q
      ? decksList.filter((d) => d.name.toLowerCase().includes(q) || (d.ownerLogin ?? '').toLowerCase().includes(q))
      : decksList.slice();
    const { key, dir } = sort;
    rows.sort((a, b) => {
      let cmp = 0;
      if (key === 'deck') cmp = a.name.localeCompare(b.name);
      else if (key === 'owner') cmp = (a.ownerLogin ?? '').localeCompare(b.ownerLogin ?? '');
      else if (key === 'nights') cmp = (a.nightsCount ?? 0) - (b.nightsCount ?? 0);
      else cmp = (a.opponentCount ?? 0) - (b.opponentCount ?? 0);
      return cmp * dir;
    });
    return rows;
  });

  function startRename(d: DeckSummary) {
    mergingId = null;
    editingId = d.id;
    editName = d.name;
    editType = d.type;
  }

  function cancelRename() {
    editingId = null;
  }

  async function saveRename(d: DeckSummary) {
    const name = editName.trim();
    if (!name) return;
    saving = true;
    try {
      const updated = await api<{ id: string; name: string; type: string }>(`/api/decks/${encodeURIComponent(d.id)}`, {
        method: 'PUT',
        body: JSON.stringify({ name, type: editType })
      });
      if (updated) {
        decksList = decksList.map((x) => (x.id === d.id ? { ...x, name: updated.name, type: updated.type } : x));
      }
      editingId = null;
      toast(`Renamed to ${name}`);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      saving = false;
    }
  }

  function startMerge(d: DeckSummary) {
    editingId = null;
    mergingId = d.id;
    mergeTargetId = '';
  }

  function cancelMerge() {
    mergingId = null;
  }

  async function confirmMerge(d: DeckSummary) {
    const target = decksList.find((x) => x.id === mergeTargetId);
    if (!target) return;
    if (
      !confirm(
        `Merge "${d.name}" into "${target.name}"? Every night and match logged with ${d.name} will move to ${target.name}, then ${d.name} is deleted. This can't be undone.`
      )
    ) {
      return;
    }
    merging = true;
    try {
      await api(`/api/decks/${encodeURIComponent(d.id)}/merge`, {
        method: 'POST',
        body: JSON.stringify({ targetId: Number(target.id) })
      });
      mergingId = null;
      await reload();
      toast(`Merged into ${target.name}`);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      merging = false;
    }
  }

  async function deleteDeck(d: DeckSummary) {
    if (!confirm(`Delete "${d.name}"? This can't be undone.`)) return;
    try {
      await api(`/api/decks/${encodeURIComponent(d.id)}`, { method: 'DELETE' });
      await reload();
      toast(`Deleted ${d.name}`);
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
</script>

<svelte:head>
  <title>Pokémon Result Tracker · Decks</title>
</svelte:head>

{#if !auth.loading}
  {#if !isAdmin}
    <div class="denied">
      <h1>Members only</h1>
      <p>This page is for the league admin. If that should be you, ask to be granted the admin role.</p>
      <a href="/">← Back to the tracker</a>
    </div>
  {:else}
    <div class="wrap">
      <Masthead {isAdmin} principal={auth.principal} alias={auth.alias} />
      <h2>Deck registry</h2>
      <div class="sub">
        Every deck ever logged or picked as an opponent. Rename a typo, merge duplicates into one deck (moves their
        nights and match history over), or delete a deck no one has used yet.
      </div>

      {#if !loaded}
        <div class="empty">Loading…</div>
      {:else if decksList.length === 0}
        <div class="empty">No decks yet.</div>
      {:else}
        <input
          type="text"
          class="search"
          placeholder="Search by deck or owner…"
          autocomplete="off"
          spellcheck="false"
          bind:value={search}
        />
        <div class="dtable-scroll">
          <div class="dtable">
            <div class="drow head">
              <button type="button" onclick={() => toggleSort('deck')}>Deck{sortArrow('deck')}</button>
              <button type="button" onclick={() => toggleSort('owner')}>Owner{sortArrow('owner')}</button>
              <button type="button" onclick={() => toggleSort('nights')}>Nights{sortArrow('nights')}</button>
              <button type="button" onclick={() => toggleSort('opponent')}>Opponent{sortArrow('opponent')}</button>
              <span></span>
            </div>
            {#each filteredDecks as d (d.id)}
              <div class="drow">
                <span class="cell-deck"><TypeIcon type={d.type} size={16} />{d.name}</span>
                <span class="cell-owner">{d.ownerLogin ?? 'Unowned'}</span>
                <span class="mono">{d.nightsCount ?? 0}</span>
                <span class="mono">{d.opponentCount ?? 0}</span>
                <div class="actions">
                  <button type="button" class="act" title="Rename" onclick={() => startRename(d)}>✎</button>
                  <button type="button" class="act" title="Merge into another deck" onclick={() => startMerge(d)}>⇄</button>
                  <button
                    type="button"
                    class="act danger"
                    title={isDeletable(d) ? 'Delete' : 'Still in use — delete disabled'}
                    disabled={!isDeletable(d)}
                    onclick={() => deleteDeck(d)}>✕</button
                  >
                </div>
              </div>
              {#if editingId === d.id}
                <div class="panel">
                  <input
                    type="text"
                    placeholder="Deck name"
                    autocomplete="off"
                    bind:value={editName}
                    onkeydown={(e) => e.key === 'Enter' && saveRename(d)}
                  />
                  <div class="swatches">
                    {#each TYPES as [tname] (tname)}
                      <button
                        type="button"
                        class="sw"
                        style="color:{colorOf(tname)}"
                        aria-pressed={editType === tname}
                        title={tname}
                        onclick={() => (editType = tname)}
                      >
                        <TypeIcon type={tname} size={22} />
                      </button>
                    {/each}
                  </div>
                  <div class="panel-actions">
                    <button type="button" class="ghost" onclick={cancelRename}>Cancel</button>
                    <button type="button" class="primary" disabled={saving || !editName.trim()} onclick={() => saveRename(d)}
                      >Save</button
                    >
                  </div>
                </div>
              {:else if mergingId === d.id}
                <div class="panel">
                  <div class="panel-label">Merge "{d.name}" into…</div>
                  <select bind:value={mergeTargetId}>
                    <option value="">Pick a deck</option>
                    {#each decksList.filter((x) => x.id !== d.id) as opt (opt.id)}
                      <option value={opt.id}>{opt.name}{opt.ownerLogin ? ` · ${opt.ownerLogin}` : ' · Unowned'}</option>
                    {/each}
                  </select>
                  <div class="panel-actions">
                    <button type="button" class="ghost" onclick={cancelMerge}>Cancel</button>
                    <button type="button" class="primary" disabled={merging || !mergeTargetId} onclick={() => confirmMerge(d)}
                      >Merge</button
                    >
                  </div>
                </div>
              {/if}
            {/each}
            {#if filteredDecks.length === 0}
              <div class="noresults">No decks match "{search}".</div>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  {/if}
{/if}

<Toast />

<style>
  .wrap {
    max-width: 680px;
    margin: 0 auto;
  }
  h2 {
    font-family: var(--display);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    font-size: 20px;
    margin: 0 0 14px;
  }
  .sub {
    color: var(--muted);
    font-size: 12.5px;
    margin-bottom: 20px;
    line-height: 1.5;
  }
  .search {
    width: 100%;
    box-sizing: border-box;
    background: var(--ink);
    border: 1px solid var(--line);
    color: var(--text);
    border-radius: 9px;
    padding: 9px 12px;
    font-size: 13px;
    font-family: inherit;
    margin-bottom: 10px;
  }
  .search::placeholder {
    color: var(--muted2);
  }
  .search:focus {
    outline: none;
    border-color: var(--red);
    box-shadow: 0 0 0 3px rgba(239, 47, 66, 0.16);
  }
  .dtable-scroll {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
  }
  .dtable {
    min-width: 560px;
  }
  .drow {
    display: grid;
    grid-template-columns: 1fr 130px 64px 84px 92px;
    gap: 10px;
    align-items: center;
    padding: 10px 13px;
    border-bottom: 1px solid var(--line);
    font-size: 12.5px;
  }
  .drow:last-child {
    border-bottom: none;
  }
  .drow.head {
    background: rgba(0, 0, 0, 0.2);
  }
  .drow.head button {
    background: none;
    border: none;
    color: var(--muted);
    font-family: inherit;
    font-size: 9.5px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    text-align: left;
    padding: 0;
    cursor: pointer;
  }
  .drow.head button:hover {
    color: var(--text);
  }
  .cell-deck {
    display: flex;
    align-items: center;
    gap: 7px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cell-owner {
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mono {
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  .actions {
    display: flex;
    gap: 5px;
    justify-content: flex-end;
  }
  .act {
    flex: 0 0 auto;
    width: 26px;
    height: 26px;
    border-radius: 7px;
    border: 1px solid var(--line);
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    font-size: 12px;
  }
  .act:hover:not(:disabled) {
    color: var(--text);
    border-color: var(--muted2);
  }
  .act:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 2px;
  }
  .act.danger:hover:not(:disabled) {
    color: var(--red);
    border-color: var(--red);
  }
  .act:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .panel {
    padding: 12px 13px 14px;
    border-bottom: 1px solid var(--line);
    background: rgba(0, 0, 0, 0.18);
  }
  .panel input,
  .panel select {
    width: 100%;
    box-sizing: border-box;
    background: var(--ink);
    border: 1px solid var(--line);
    color: var(--text);
    border-radius: 9px;
    padding: 9px 12px;
    font-size: 13.5px;
    font-family: inherit;
  }
  .panel input:focus,
  .panel select:focus {
    outline: none;
    border-color: var(--red);
    box-shadow: 0 0 0 3px rgba(239, 47, 66, 0.16);
  }
  .panel-label {
    font-size: 11.5px;
    color: var(--muted);
    margin-bottom: 8px;
  }
  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 9px;
  }
  .sw {
    width: 22px;
    height: 22px;
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
  .panel-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 10px;
  }
  .panel-actions .ghost {
    border: 1px solid var(--line);
    background: transparent;
    color: var(--muted);
    border-radius: 8px;
    padding: 8px 14px;
    font-family: inherit;
    font-size: 12.5px;
    cursor: pointer;
  }
  .panel-actions .primary {
    border: none;
    border-radius: 8px;
    padding: 8px 16px;
    font-family: var(--display);
    font-weight: 700;
    letter-spacing: 0.04em;
    font-size: 12px;
    cursor: pointer;
    background: linear-gradient(180deg, var(--red) 0%, var(--red-deep) 100%);
    color: #fff;
  }
  .panel-actions .primary:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .noresults {
    color: var(--muted);
    font-size: 12.5px;
    text-align: center;
    padding: 16px;
  }
  .empty {
    color: var(--muted);
    font-size: 13px;
    text-align: center;
    padding: 18px;
  }
  .denied {
    max-width: 400px;
    margin: 12vh auto 0;
    text-align: center;
  }
  .denied h1 {
    margin-bottom: 10px;
  }
  .denied p {
    color: var(--muted);
    font-size: 14px;
    line-height: 1.6;
    margin-bottom: 22px;
  }
  .denied a {
    display: inline-block;
    color: var(--muted);
    text-decoration: none;
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 11px 22px;
    font-size: 13px;
  }
</style>
