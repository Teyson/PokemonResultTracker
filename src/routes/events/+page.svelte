<script lang="ts">
  import { getContext } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import type { AuthContext, EventItem } from '$lib/types';
  import { api } from '$lib/api';
  import { toast } from '$lib/toast.svelte';
  import { fmtDate } from '$lib/pokemon';
  import { leagueState, loadLeagues } from '$lib/league.svelte';
  import Toast from '$lib/components/Toast.svelte';
  import Masthead from '$lib/components/Masthead.svelte';

  const auth = getContext<AuthContext>('auth');
  let isAdmin = $derived(auth.isAdmin);
  let isMember = $derived(auth.isMember);

  let eventsList = $state<EventItem[]>([]);
  let loaded = $state(false);

  let unarchivedLeagues = $derived(leagueState.leagues.filter((l) => !l.archivedAt));
  let activeLeague = $derived(unarchivedLeagues.find((l) => l.id === leagueState.activeLeagueId) ?? unarchivedLeagues[0] ?? null);

  let detailId = $derived(page.url.searchParams.get('id'));
  let detailEvent = $state<EventItem | null>(null);
  let detailLoading = $state(false);
  let detailError = $state('');

  $effect(() => {
    if (isMember && !loaded) reload();
    if (isMember) loadLeagues();
  });

  $effect(() => {
    if (detailId) loadDetail(detailId);
    else {
      detailEvent = null;
      detailError = '';
    }
  });

  async function reload() {
    try {
      eventsList = (await api<EventItem[]>('/api/events')) ?? [];
      loaded = true;
    } catch (e) {
      toast(`Could not load events: ${(e as Error).message}`, true);
    }
  }

  async function loadDetail(id: string) {
    detailLoading = true;
    detailError = '';
    try {
      detailEvent = await api<EventItem>(`/api/events/${encodeURIComponent(id)}`);
    } catch (e) {
      detailError = (e as Error).message;
    } finally {
      detailLoading = false;
    }
  }

  function eventName(ev: Pick<EventItem, 'name' | 'playedOn'>): string {
    return ev.name || `League night ${fmtDate(ev.playedOn)}`;
  }

  function statusLabel(status: EventItem['status']): string {
    return status === 'setup' ? 'Upcoming' : status === 'live' ? 'Live' : 'Done';
  }

  // --- Create ---
  let newName = $state('');
  let newPlayedOn = $state('');
  let newBestOf = $state('1');
  let newRoundLengthMin = $state('30');
  let newLeagueId = $state<string>('');
  let adding = $state(false);

  let newLeagueTouched = $state(false);
  $effect(() => {
    if (!newLeagueTouched && activeLeague) newLeagueId = activeLeague.id;
  });

  async function addEvent() {
    if (!newPlayedOn || !newLeagueId) return;
    adding = true;
    try {
      await api('/api/events', {
        method: 'POST',
        body: JSON.stringify({
          name: newName.trim() || null,
          playedOn: newPlayedOn,
          bestOf: Number(newBestOf),
          roundLengthMin: Number(newRoundLengthMin),
          leagueId: Number(newLeagueId)
        })
      });
      newName = '';
      newPlayedOn = '';
      newBestOf = '1';
      newRoundLengthMin = '30';
      await reload();
      toast('Event scheduled');
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      adding = false;
    }
  }

  // --- Edit ---
  let editingId = $state<string | null>(null);
  let editName = $state('');
  let editPlayedOn = $state('');
  let editBestOf = $state('1');
  let editRoundLengthMin = $state('30');
  let editLeagueId = $state<string>('');
  let saving = $state(false);

  function startEdit(ev: EventItem) {
    editingId = ev.id;
    editName = ev.name ?? '';
    editPlayedOn = ev.playedOn;
    editBestOf = String(ev.bestOf);
    editRoundLengthMin = String(ev.roundLengthMin);
    editLeagueId = ev.leagueId;
  }

  function cancelEdit() {
    editingId = null;
  }

  async function saveEdit(ev: EventItem) {
    if (!editPlayedOn || !editLeagueId) return;
    saving = true;
    try {
      const updated = await api<EventItem>(`/api/events/${encodeURIComponent(ev.id)}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editName.trim() || null,
          playedOn: editPlayedOn,
          bestOf: Number(editBestOf),
          roundLengthMin: Number(editRoundLengthMin),
          leagueId: Number(editLeagueId)
        })
      });
      editingId = null;
      await reload();
      if (detailId === ev.id && updated) detailEvent = updated;
      toast('Saved');
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      saving = false;
    }
  }

  async function deleteEvent(ev: EventItem) {
    if (!confirm(`Delete "${eventName(ev)}"? This can't be undone.`)) return;
    try {
      await api(`/api/events/${encodeURIComponent(ev.id)}`, { method: 'DELETE' });
      await reload();
      if (detailId === ev.id) goto('/events');
      toast('Deleted');
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  async function startEvent(ev: EventItem) {
    try {
      const updated = await api<EventItem>(`/api/events/${encodeURIComponent(ev.id)}/start`, { method: 'POST' });
      await reload();
      if (detailId === ev.id && updated) detailEvent = updated;
      toast(`${eventName(ev)} is live`);
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  async function finishEvent(ev: EventItem) {
    try {
      const updated = await api<EventItem>(`/api/events/${encodeURIComponent(ev.id)}/finish`, { method: 'POST' });
      await reload();
      if (detailId === ev.id && updated) detailEvent = updated;
      toast(`${eventName(ev)} finished`);
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  let leagueEvents = $derived(activeLeague ? eventsList.filter((e) => e.leagueId === activeLeague!.id) : []);
  let sortedEvents = $derived([...leagueEvents].sort((a, b) => (a.playedOn < b.playedOn ? 1 : a.playedOn > b.playedOn ? -1 : 0)));
</script>

<svelte:head>
  <title>Pokémon Result Tracker · Events</title>
</svelte:head>

{#if !auth.loading}
  {#if !isMember}
    <div class="denied">
      <h1>Members only</h1>
      <p>You don't have access to this app yet. Ask an admin to add you.</p>
      <a href="/">← Back to the tracker</a>
    </div>
  {:else if detailId}
    <div class="wrap">
      <Masthead {isAdmin} principal={auth.principal} alias={auth.alias} />
      <a class="back" href="/events">← All events</a>
      {#if detailLoading}
        <div class="empty">Loading…</div>
      {:else if detailError}
        <div class="empty">{detailError}</div>
      {:else if detailEvent}
        {@const ev = detailEvent}
        <h2>{eventName(ev)}</h2>
        <div class="detail-card">
          <div class="detail-row"><span>Date</span><span>{fmtDate(ev.playedOn)}</span></div>
          <div class="detail-row"><span>Status</span><span class="pill status-{ev.status}">{statusLabel(ev.status)}</span></div>
          <div class="detail-row"><span>Format</span><span>Best of {ev.bestOf}</span></div>
          <div class="detail-row"><span>Round length</span><span>{ev.roundLengthMin} min</span></div>
          <div class="detail-row"><span>Created by</span><span>{ev.createdByDisplay}</span></div>
        </div>
        {#if isAdmin}
          <div class="detail-actions">
            {#if ev.status === 'setup'}
              <button type="button" class="ghost" onclick={() => startEdit(ev)}>Edit</button>
              <button type="button" class="primary" onclick={() => startEvent(ev)}>Start event</button>
              <button type="button" class="danger" onclick={() => deleteEvent(ev)}>Delete</button>
            {:else if ev.status === 'live'}
              <button type="button" class="primary" onclick={() => finishEvent(ev)}>Finish event</button>
            {/if}
          </div>
          {#if editingId === ev.id}
            <div class="panel">
              <input type="text" placeholder={`League night ${fmtDate(ev.playedOn)}`} autocomplete="off" bind:value={editName} />
              <div class="panel-row">
                <input type="date" aria-label="Date" bind:value={editPlayedOn} />
                <select aria-label="Best of" bind:value={editBestOf}>
                  <option value="1">Best of 1</option>
                  <option value="3">Best of 3</option>
                </select>
              </div>
              <div class="panel-row">
                <input type="number" aria-label="Round length (minutes)" min="1" max="180" bind:value={editRoundLengthMin} />
                {#if unarchivedLeagues.length > 1}
                  <select aria-label="League" bind:value={editLeagueId}>
                    {#each unarchivedLeagues as l (l.id)}
                      <option value={l.id}>{l.name}</option>
                    {/each}
                  </select>
                {/if}
              </div>
              <div class="panel-actions">
                <button type="button" class="ghost" onclick={cancelEdit}>Cancel</button>
                <button type="button" class="primary" disabled={saving || !editPlayedOn || !editLeagueId} onclick={() => saveEdit(ev)}
                  >Save</button
                >
              </div>
            </div>
          {/if}
        {/if}
      {/if}
    </div>
  {:else}
    <div class="wrap">
      <Masthead {isAdmin} principal={auth.principal} alias={auth.alias} />
      <h2>Events{activeLeague ? ` · ${activeLeague.name}` : ''}</h2>
      <div class="sub">
        League nights, tracked as shared events. Each league runs its own schedule — switch leagues from the nav
        menu to see another league's events.
      </div>

      {#if isAdmin}
        <div class="card">
          <div class="add">
            <input type="text" placeholder="Name (optional)" autocomplete="off" bind:value={newName} />
            <input type="date" aria-label="Date" bind:value={newPlayedOn} />
            <select aria-label="Best of" bind:value={newBestOf}>
              <option value="1">Best of 1</option>
              <option value="3">Best of 3</option>
            </select>
            <input type="number" aria-label="Round length (minutes)" min="1" max="180" bind:value={newRoundLengthMin} />
            {#if unarchivedLeagues.length > 1}
              <select aria-label="League" bind:value={newLeagueId} onchange={() => (newLeagueTouched = true)}>
                {#each unarchivedLeagues as l (l.id)}
                  <option value={l.id}>{l.name}</option>
                {/each}
              </select>
            {/if}
            <button disabled={adding || !newPlayedOn || !newLeagueId} onclick={addEvent}>Schedule</button>
          </div>
        </div>
      {/if}

      {#if !loaded}
        <div class="empty">Loading…</div>
      {:else if sortedEvents.length === 0}
        <div class="empty">No events yet{isAdmin ? ' — schedule one above.' : '.'}</div>
      {:else}
        <div class="dtable-scroll">
          <div class="dtable">
            <div class="drow head">
              <span>Event</span>
              <span>Date</span>
              <span>Status</span>
              <span></span>
            </div>
            {#each sortedEvents as ev (ev.id)}
              <div class="drow">
                <a class="cell-name" href={`/events?id=${ev.id}`}>{eventName(ev)}</a>
                <span>{fmtDate(ev.playedOn)}</span>
                <span class="pill status-{ev.status}">{statusLabel(ev.status)}</span>
                <div class="actions">
                  {#if isAdmin && ev.status === 'setup'}
                    <button type="button" class="act" title="Delete" onclick={() => deleteEvent(ev)}>✕</button>
                  {/if}
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
  .back {
    display: inline-block;
    color: var(--muted);
    text-decoration: none;
    font-size: 12.5px;
    margin-bottom: 14px;
  }
  .back:hover {
    color: var(--text);
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
  .add input[type='number'] {
    flex: 1 1 100px;
    min-width: 0;
  }
  .add select {
    flex: 1 1 130px;
    min-width: 0;
  }
  .add input,
  .add select {
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
  .add input:focus,
  .add select:focus {
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
    min-width: 460px;
  }
  .drow {
    display: grid;
    grid-template-columns: 1fr 110px 90px 40px;
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
    color: var(--text);
    text-decoration: none;
  }
  .cell-name:hover {
    text-decoration: underline;
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
    width: fit-content;
  }
  .pill.status-setup {
    color: var(--muted);
  }
  .pill.status-live {
    color: var(--win-text);
    background: rgba(78, 203, 113, 0.1);
    border-color: rgba(78, 203, 113, 0.28);
  }
  .pill.status-done {
    color: var(--muted2);
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
    color: var(--red);
    border-color: var(--red);
  }
  .act:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 2px;
  }
  .detail-card {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 4px 15px;
    margin-bottom: 16px;
  }
  .detail-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 11px 0;
    border-bottom: 1px solid var(--line);
    font-size: 13px;
  }
  .detail-row:last-child {
    border-bottom: none;
  }
  .detail-row span:first-child {
    color: var(--muted);
    font-size: 11.5px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .detail-actions {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }
  .detail-actions button,
  .panel-actions button {
    border: none;
    border-radius: 9px;
    padding: 10px 18px;
    font-family: var(--display);
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    font-size: 12px;
    cursor: pointer;
  }
  .detail-actions .primary,
  .panel-actions .primary {
    background: linear-gradient(180deg, var(--red) 0%, var(--red-deep) 100%);
    color: #fff;
  }
  .detail-actions .primary:disabled,
  .panel-actions .primary:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .detail-actions .ghost,
  .panel-actions .ghost {
    border: 1px solid var(--line);
    background: transparent;
    color: var(--muted);
  }
  .detail-actions .danger {
    border: 1px solid var(--line);
    background: transparent;
    color: var(--red);
  }
  .detail-actions .danger:hover {
    border-color: var(--red);
  }
  .panel {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 12px 13px 14px;
    margin-bottom: 16px;
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
  .panel-row {
    display: flex;
    gap: 10px;
    margin-top: 9px;
  }
  .panel-row input,
  .panel-row select {
    flex: 1;
    min-width: 0;
  }
  .panel-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 10px;
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
