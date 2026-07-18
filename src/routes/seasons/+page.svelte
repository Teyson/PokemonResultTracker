<script lang="ts">
  import { getContext } from 'svelte';
  import type { AuthContext, Season } from '$lib/types';
  import { api } from '$lib/api';
  import { toast } from '$lib/toast.svelte';
  import { fmtDate } from '$lib/pokemon';
  import Toast from '$lib/components/Toast.svelte';
  import Masthead from '$lib/components/Masthead.svelte';

  const auth = getContext<AuthContext>('auth');
  let isAdmin = $derived(auth.isAdmin);

  let seasonsList = $state<Season[]>([]);
  let loaded = $state(false);

  let newName = $state('');
  let newStart = $state('');
  let newEnd = $state('');
  let adding = $state(false);

  let editingId = $state<string | null>(null);
  let editName = $state('');
  let editStart = $state('');
  let editEnd = $state('');
  let saving = $state(false);

  $effect(() => {
    if (isAdmin && !loaded) reload();
  });

  async function reload() {
    try {
      seasonsList = (await api<Season[]>('/api/seasons')) ?? [];
      loaded = true;
    } catch (e) {
      toast(`Could not load seasons: ${(e as Error).message}`, true);
    }
  }

  async function addSeason() {
    const name = newName.trim();
    if (!name || !newStart) return;
    adding = true;
    try {
      await api('/api/seasons', {
        method: 'POST',
        body: JSON.stringify({ name, startsOn: newStart, endsOn: newEnd || null })
      });
      newName = '';
      newStart = '';
      newEnd = '';
      await reload();
      toast(`Added ${name}`);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      adding = false;
    }
  }

  function startEdit(s: Season) {
    editingId = s.id;
    editName = s.name;
    editStart = s.startsOn;
    editEnd = s.endsOn ?? '';
  }

  function cancelEdit() {
    editingId = null;
  }

  async function saveEdit(s: Season) {
    const name = editName.trim();
    if (!name || !editStart) return;
    saving = true;
    try {
      await api(`/api/seasons/${encodeURIComponent(s.id)}`, {
        method: 'PUT',
        body: JSON.stringify({ name, startsOn: editStart, endsOn: editEnd || null })
      });
      editingId = null;
      await reload();
      toast(`Saved ${name}`);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      saving = false;
    }
  }

  async function deleteSeason(s: Season) {
    if (!confirm(`Delete "${s.name}"? Nights logged during this range aren't deleted — they just won't have a season to show under anymore.`)) {
      return;
    }
    try {
      await api(`/api/seasons/${encodeURIComponent(s.id)}`, { method: 'DELETE' });
      await reload();
      toast(`Deleted ${s.name}`);
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  let sortedSeasons = $derived([...seasonsList].sort((a, b) => (a.startsOn < b.startsOn ? 1 : a.startsOn > b.startsOn ? -1 : 0)));
</script>

<svelte:head>
  <title>Pokémon Result Tracker · Seasons</title>
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
      <h2>Seasons</h2>
      <div class="sub">
        Partition play into named seasons so the scoreboard and deck stats can default to "right now" instead of an
        ever-growing all-time average. Leave the end date blank for the current, still-running season.
      </div>

      <div class="card">
        <div class="add">
          <input type="text" placeholder="Season name, e.g. Spring 2026" autocomplete="off" bind:value={newName} />
          <input type="date" aria-label="Start date" bind:value={newStart} />
          <input type="date" aria-label="End date (optional)" bind:value={newEnd} />
          <button disabled={adding || !newName.trim() || !newStart} onclick={addSeason}>Add</button>
        </div>
        <div class="hint">Date ranges can't overlap an existing season.</div>
      </div>

      {#if !loaded}
        <div class="empty">Loading…</div>
      {:else if sortedSeasons.length === 0}
        <div class="empty">No seasons yet — everything shows as "All time" until you add one.</div>
      {:else}
        <div class="dtable-scroll">
          <div class="dtable">
            <div class="drow head">
              <span>Name</span>
              <span>Starts</span>
              <span>Ends</span>
              <span></span>
            </div>
            {#each sortedSeasons as s (s.id)}
              <div class="drow">
                <span class="cell-name">{s.name}</span>
                <span>{fmtDate(s.startsOn)}</span>
                <span>
                  {#if s.endsOn}
                    {fmtDate(s.endsOn)}
                  {:else}
                    <span class="pill current">Current</span>
                  {/if}
                </span>
                <div class="actions">
                  <button type="button" class="act" title="Edit" onclick={() => startEdit(s)}>✎</button>
                  <button type="button" class="act danger" title="Delete" onclick={() => deleteSeason(s)}>✕</button>
                </div>
              </div>
              {#if editingId === s.id}
                <div class="panel">
                  <input type="text" placeholder="Season name" autocomplete="off" bind:value={editName} />
                  <div class="panel-dates">
                    <input type="date" aria-label="Start date" bind:value={editStart} />
                    <input type="date" aria-label="End date (optional)" bind:value={editEnd} />
                  </div>
                  <div class="panel-actions">
                    <button type="button" class="ghost" onclick={cancelEdit}>Cancel</button>
                    <button
                      type="button"
                      class="primary"
                      disabled={saving || !editName.trim() || !editStart}
                      onclick={() => saveEdit(s)}>Save</button
                    >
                  </div>
                </div>
              {/if}
            {/each}
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
  .card {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 15px;
    margin-bottom: 16px;
  }
  .add {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .add input[type='text'] {
    flex: 1 1 180px;
    min-width: 0;
  }
  .add input[type='date'] {
    flex: 1 1 130px;
    min-width: 0;
  }
  .add input {
    background: var(--ink);
    border: 1px solid var(--line);
    color: var(--text);
    border-radius: 9px;
    padding: 11px 12px;
    font-size: 15px;
    font-family: inherit;
  }
  .add input::placeholder {
    color: var(--muted2);
  }
  .add input:focus {
    outline: none;
    border-color: var(--red);
    box-shadow: 0 0 0 3px rgba(239, 47, 66, 0.16);
  }
  .add button {
    flex: 0 0 auto;
    border: none;
    border-radius: 9px;
    padding: 0 20px;
    font-family: var(--display);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    font-size: 13px;
    cursor: pointer;
    background: linear-gradient(180deg, var(--red) 0%, var(--red-deep) 100%);
    color: #fff;
  }
  .add button:disabled {
    opacity: 0.55;
    cursor: default;
  }
  .hint {
    font-size: 11px;
    color: var(--muted2);
    margin-top: 9px;
    line-height: 1.5;
  }
  .dtable-scroll {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
  }
  .dtable {
    min-width: 460px;
  }
  .drow {
    display: grid;
    grid-template-columns: 1fr 110px 110px 66px;
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
  .drow.head span {
    font-size: 9.5px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .cell-name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pill.current {
    font-size: 9.5px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 20px;
    color: var(--win-text);
    background: rgba(78, 203, 113, 0.1);
    border: 1px solid rgba(78, 203, 113, 0.28);
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
  .act:hover {
    color: var(--text);
    border-color: var(--muted2);
  }
  .act:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 2px;
  }
  .act.danger:hover {
    color: var(--red);
    border-color: var(--red);
  }
  .panel {
    padding: 12px 13px 14px;
    border-bottom: 1px solid var(--line);
    background: rgba(0, 0, 0, 0.18);
  }
  .panel input {
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
  .panel input:focus {
    outline: none;
    border-color: var(--red);
    box-shadow: 0 0 0 3px rgba(239, 47, 66, 0.16);
  }
  .panel-dates {
    display: flex;
    gap: 10px;
    margin-top: 9px;
  }
  .panel-dates input {
    flex: 1;
    min-width: 0;
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
