<script lang="ts">
  import { getContext } from 'svelte';
  import type { AuthContext, League } from '$lib/types';
  import { api } from '$lib/api';
  import { toast } from '$lib/toast.svelte';
  import Toast from '$lib/components/Toast.svelte';
  import Masthead from '$lib/components/Masthead.svelte';

  const auth = getContext<AuthContext>('auth');
  let isAdmin = $derived(auth.isAdmin);

  let leaguesList = $state<League[]>([]);
  let loaded = $state(false);

  let newName = $state('');
  let adding = $state(false);

  let editingId = $state<string | null>(null);
  let editName = $state('');
  let saving = $state(false);

  $effect(() => {
    if (isAdmin && !loaded) reload();
  });

  async function reload() {
    try {
      leaguesList = (await api<League[]>('/api/leagues')) ?? [];
      loaded = true;
    } catch (e) {
      toast(`Could not load leagues: ${(e as Error).message}`, true);
    }
  }

  async function addLeague() {
    const name = newName.trim();
    if (!name) return;
    adding = true;
    try {
      await api('/api/leagues', { method: 'POST', body: JSON.stringify({ name }) });
      newName = '';
      await reload();
      toast(`Added ${name}`);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      adding = false;
    }
  }

  function startEdit(l: League) {
    editingId = l.id;
    editName = l.name;
  }

  function cancelEdit() {
    editingId = null;
  }

  async function saveEdit(l: League) {
    const name = editName.trim();
    if (!name) return;
    saving = true;
    try {
      await api(`/api/leagues/${encodeURIComponent(l.id)}`, { method: 'PUT', body: JSON.stringify({ name }) });
      editingId = null;
      await reload();
      toast(`Saved ${name}`);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      saving = false;
    }
  }

  async function archiveLeague(l: League) {
    if (!confirm(`Archive "${l.name}"? It's hidden from pickers but its history and standings stay intact — you can unarchive it any time.`)) {
      return;
    }
    try {
      await api(`/api/leagues/${encodeURIComponent(l.id)}/archive`, { method: 'POST' });
      await reload();
      toast(`Archived ${l.name}`);
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  async function unarchiveLeague(l: League) {
    try {
      await api(`/api/leagues/${encodeURIComponent(l.id)}/unarchive`, { method: 'POST' });
      await reload();
      toast(`Unarchived ${l.name}`);
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  let activeLeagues = $derived(leaguesList.filter((l) => !l.archivedAt));
  let archivedLeagues = $derived(leaguesList.filter((l) => l.archivedAt));
</script>

<svelte:head>
  <title>Pokémon Result Tracker · Leagues</title>
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
      <h2>Leagues</h2>
      <div class="sub">
        Named competitive contexts — a Tuesday league, a tournament series — each with its own standings.
        The first (lowest id) unarchived league is the default: it anchors the night-form default and can't
        be archived.
      </div>

      <div class="card">
        <div class="add">
          <input type="text" placeholder="League name, e.g. Summer Cup 2026" autocomplete="off" bind:value={newName} />
          <button disabled={adding || !newName.trim()} onclick={addLeague}>Add</button>
        </div>
      </div>

      {#if !loaded}
        <div class="empty">Loading…</div>
      {:else if leaguesList.length === 0}
        <div class="empty">No leagues yet.</div>
      {:else}
        <div class="dtable-scroll">
          <div class="dtable">
            <div class="drow head">
              <span>Name</span>
              <span></span>
            </div>
            {#each activeLeagues as l (l.id)}
              <div class="drow">
                <span class="cell-name"
                  >{l.name}{#if l.id === activeLeagues[0]?.id}<span class="pill current">Default</span>{/if}</span
                >
                <div class="actions">
                  <button type="button" class="act" title="Rename" onclick={() => startEdit(l)}>✎</button>
                  <button
                    type="button"
                    class="act danger"
                    title={l.id === activeLeagues[0]?.id ? "The default league can't be archived" : 'Archive'}
                    disabled={l.id === activeLeagues[0]?.id}
                    onclick={() => archiveLeague(l)}>🗄</button
                  >
                </div>
              </div>
              {#if editingId === l.id}
                <div class="panel">
                  <input type="text" placeholder="League name" autocomplete="off" bind:value={editName} />
                  <div class="panel-actions">
                    <button type="button" class="ghost" onclick={cancelEdit}>Cancel</button>
                    <button type="button" class="primary" disabled={saving || !editName.trim()} onclick={() => saveEdit(l)}
                      >Save</button
                    >
                  </div>
                </div>
              {/if}
            {/each}
            {#each archivedLeagues as l (l.id)}
              <div class="drow archived">
                <span class="cell-name">{l.name} <span class="pill">Archived</span></span>
                <div class="actions">
                  <button type="button" class="act" title="Unarchive" onclick={() => unarchiveLeague(l)}>↺</button>
                </div>
              </div>
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
  .dtable-scroll {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
  }
  .dtable {
    min-width: 360px;
  }
  .drow {
    display: grid;
    grid-template-columns: 1fr 66px;
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
  .drow.archived {
    opacity: 0.6;
  }
  .cell-name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 8px;
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
  .pill {
    font-size: 9.5px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 20px;
    color: var(--muted);
    background: var(--panel2);
    border: 1px solid var(--line);
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
  .act:disabled {
    opacity: 0.35;
    cursor: default;
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
