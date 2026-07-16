<script lang="ts">
  import { getContext } from 'svelte';
  import type { ClientPrincipal, AllowedUser, UsersResponse, Night } from '$lib/types';
  import { api } from '$lib/api';
  import { toast } from '$lib/toast.svelte';
  import { fmtDate, ppg } from '$lib/pokemon';
  import Toast from '$lib/components/Toast.svelte';

  const auth = getContext<{ principal: ClientPrincipal | null; loading: boolean; isMember: boolean; isAdmin: boolean }>(
    'auth'
  );
  let isAdmin = $derived(auth.isAdmin);

  let data = $state<UsersResponse>({ admin: '', users: [] });
  let loaded = $state(false);
  let loginInput = $state('');
  let adding = $state(false);

  let deletedNights = $state<Night[]>([]);
  let deletedLoaded = $state(false);
  let deletedSearch = $state('');

  type DeletedSortKey = 'deck' | 'owner' | 'date' | 'record' | 'deletedAt';
  let deletedSort = $state<{ key: DeletedSortKey; dir: 1 | -1 }>({ key: 'deletedAt', dir: -1 });

  $effect(() => {
    if (isAdmin && !loaded) reload();
    if (isAdmin && !deletedLoaded) reloadDeleted();
  });

  async function reloadDeleted() {
    try {
      deletedNights = (await api<Night[]>('/api/nights?scope=deleted')) ?? [];
      deletedLoaded = true;
    } catch (e) {
      toast(`Could not load deleted nights: ${(e as Error).message}`, true);
    }
  }

  async function restoreNight(n: Night) {
    try {
      await api(`/api/nights/${encodeURIComponent(n.id)}/restore`, { method: 'POST' });
      await reloadDeleted();
      toast(`${n.deck} restored`);
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  function toggleDeletedSort(key: DeletedSortKey) {
    deletedSort = deletedSort.key === key ? { key, dir: deletedSort.dir === 1 ? -1 : 1 } : { key, dir: 1 };
  }

  function deletedSortArrow(key: DeletedSortKey): string {
    if (deletedSort.key !== key) return '';
    return deletedSort.dir === 1 ? ' ▲' : ' ▼';
  }

  // All client-side: the deleted-nights list is unbounded (no time cutoff, no
  // pagination), but that's fine at this league's scale.
  let filteredDeletedNights = $derived.by(() => {
    const q = deletedSearch.trim().toLowerCase();
    const rows = q
      ? deletedNights.filter((n) => n.deck.toLowerCase().includes(q) || n.createdBy.toLowerCase().includes(q))
      : deletedNights.slice();
    const { key, dir } = deletedSort;
    rows.sort((a, b) => {
      let cmp = 0;
      if (key === 'deck') cmp = a.deck.localeCompare(b.deck);
      else if (key === 'owner') cmp = a.createdBy.localeCompare(b.createdBy);
      else if (key === 'date') cmp = a.date.localeCompare(b.date);
      else if (key === 'record') cmp = ppg(a) - ppg(b);
      else cmp = (a.deletedAt ?? '').localeCompare(b.deletedAt ?? '');
      return cmp * dir;
    });
    return rows;
  });

  async function reload() {
    try {
      data = (await api<UsersResponse>('/api/users')) ?? { admin: '', users: [] };
      loaded = true;
    } catch (e) {
      toast(`Could not load members: ${(e as Error).message}`, true);
    }
  }

  function avatarUrl(login: string): string {
    return `https://github.com/${encodeURIComponent(login)}.png?size=60`;
  }

  async function addUser() {
    const login = loginInput.trim();
    if (!login) return;
    adding = true;
    try {
      await api('/api/users', { method: 'POST', body: JSON.stringify({ github_login: login }) });
      loginInput = '';
      await reload();
      toast(`Added ${login}`);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      adding = false;
    }
  }

  async function removeUser(u: AllowedUser) {
    if (!confirm(`Remove ${u.github_login} from the league?`)) return;
    try {
      await api(`/api/users/${encodeURIComponent(u.id)}`, { method: 'DELETE' });
      await reload();
      toast(`Removed ${u.github_login}`);
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  // Same exclusion rule as the original admin.html: the admin's own login never
  // appears twice, and whitelist rows are always shown with a "Member" pill
  // (there's no UI path to grant a second admin, even though the schema allows it).
  let members = $derived(data.users.filter((u) => u.github_login.toLowerCase() !== data.admin.toLowerCase()));
</script>

<svelte:head>
  <title>Pokémon Result Tracker · Members</title>
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
      <div class="topbar">
        <a class="back" href="/">← Tracker</a>
        <a class="back" href="/decks">Manage decks</a>
        <a class="back" href="/logout">Sign out</a>
      </div>
      <h1>League members</h1>
      <div class="sub">
        Whitelist who can sign in and log nights. People sign in with GitHub first, then you add their username here
        — they get access the next time they load the page.
      </div>

      <div class="card">
        <div class="add">
          <input
            type="text"
            placeholder="GitHub username"
            autocomplete="off"
            spellcheck="false"
            bind:value={loginInput}
            onkeydown={(e) => e.key === 'Enter' && addUser()}
          />
          <button disabled={adding} onclick={addUser}>Add</button>
        </div>
        <div class="hint">
          Enter their exact GitHub username (the handle in github.com/<b>username</b>). Case doesn't matter.
        </div>
      </div>

      <div class="section-title">People with access</div>

      {#if !data.admin && members.length === 0}
        <div class="empty">No members added yet.</div>
      {:else}
        {#if data.admin}
          <div class="urow">
            <img class="av" alt="" src={avatarUrl(data.admin)} />
            <div class="who">
              <div class="login">{data.admin}</div>
              <div class="meta">league admin (you)</div>
            </div>
            <span class="pill admin">Admin</span>
            <button class="rm" disabled title="The admin can't be removed here" style="opacity:.3;cursor:default"
              >✕</button
            >
          </div>
        {/if}
        {#each members as u (u.id)}
          <div class="urow">
            <img class="av" alt="" src={avatarUrl(u.github_login)} />
            <div class="who">
              <div class="login">{u.github_login}</div>
              <div class="meta">added {u.created_at.slice(0, 10)}</div>
            </div>
            <span class="pill member">Member</span>
            <button class="rm" title="Remove" aria-label={`Remove ${u.github_login}`} onclick={() => removeUser(u)}
              >✕</button
            >
          </div>
        {/each}
      {/if}

      <div class="section-title">Deleted nights</div>

      {#if deletedNights.length === 0}
        <div class="empty">No deleted nights.</div>
      {:else}
        <input
          type="text"
          class="search"
          placeholder="Search by deck or player…"
          autocomplete="off"
          spellcheck="false"
          bind:value={deletedSearch}
        />
        <div class="dtable-scroll">
          <div class="dtable">
            <div class="drow head">
              <button type="button" onclick={() => toggleDeletedSort('deck')}>Deck{deletedSortArrow('deck')}</button>
              <button type="button" onclick={() => toggleDeletedSort('owner')}>Player{deletedSortArrow('owner')}</button>
              <button type="button" onclick={() => toggleDeletedSort('date')}>Played{deletedSortArrow('date')}</button>
              <button type="button" onclick={() => toggleDeletedSort('record')}>Record{deletedSortArrow('record')}</button>
              <button type="button" onclick={() => toggleDeletedSort('deletedAt')}
                >Deleted{deletedSortArrow('deletedAt')}</button
              >
              <span></span>
            </div>
            {#each filteredDeletedNights as n (n.id)}
              <div class="drow">
                <span class="cell-deck">{n.deck}</span>
                <span>{n.createdBy}</span>
                <span>{fmtDate(n.date)}</span>
                <span class="mono">{n.w}-{n.t}-{n.l}</span>
                <span class="cell-deleted">{n.deletedAt ? new Date(n.deletedAt).toLocaleString() : ''}</span>
                <button class="restore" title="Restore" aria-label={`Restore ${n.deck}`} onclick={() => restoreNight(n)}
                  >Restore</button
                >
              </div>
            {/each}
            {#if filteredDeletedNights.length === 0}
              <div class="noresults">No deleted nights match "{deletedSearch}".</div>
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
    max-width: 560px;
    margin: 0 auto;
  }
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 16px;
  }
  .back {
    font-size: 12px;
    color: var(--muted);
    text-decoration: none;
    border: 1px solid var(--line);
    border-radius: 20px;
    padding: 6px 12px;
  }
  .back:hover {
    color: var(--text);
    border-color: var(--muted2);
  }
  h1 {
    font-family: var(--display);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    font-size: 20px;
    margin: 0 0 4px;
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
    gap: 10px;
  }
  .add input {
    flex: 1;
    min-width: 0;
    background: var(--ink);
    border: 1px solid var(--line);
    color: var(--text);
    border-radius: 9px;
    padding: 11px 12px;
    font-size: 15px;
    font-family: inherit;
  }
  .add input::placeholder {
    color: #565b74;
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
  .section-title {
    font-family: var(--display);
    font-size: 12px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--muted);
    margin: 20px 2px 10px;
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
  .urow {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 11px;
    padding: 11px 13px;
    margin-bottom: 8px;
  }
  .urow .av {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--panel2);
    flex: 0 0 auto;
    object-fit: cover;
  }
  .urow .who {
    flex: 1;
    min-width: 0;
  }
  .urow .login {
    font-weight: 600;
    font-size: 14.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .urow .meta {
    font-size: 11px;
    color: var(--muted);
    margin-top: 2px;
  }
  .pill {
    font-size: 9.5px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-weight: 700;
    padding: 3px 9px;
    border-radius: 20px;
    flex: 0 0 auto;
  }
  .pill.admin {
    color: var(--gold);
    background: rgba(246, 201, 69, 0.12);
    border: 1px solid rgba(246, 201, 69, 0.3);
  }
  .pill.member {
    color: var(--win);
    background: rgba(78, 203, 113, 0.1);
    border: 1px solid rgba(78, 203, 113, 0.28);
  }
  .urow .rm {
    flex: 0 0 auto;
    width: 30px;
    height: 30px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    font-size: 14px;
  }
  .urow .rm:active {
    background: var(--red-deep);
    color: #fff;
  }
  .urow .rm:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 2px;
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
    color: #565b74;
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
    min-width: 690px;
  }
  .drow {
    display: grid;
    grid-template-columns: 140px 110px 90px 80px 150px 70px;
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
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cell-deleted {
    color: var(--muted);
    font-size: 11.5px;
  }
  .mono {
    font-variant-numeric: tabular-nums;
  }
  .noresults {
    color: var(--muted);
    font-size: 12.5px;
    text-align: center;
    padding: 16px;
  }
  .restore {
    flex: 0 0 auto;
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 6px 10px;
    background: transparent;
    color: var(--gold);
    cursor: pointer;
    font-family: inherit;
    font-size: 11.5px;
    font-weight: 600;
    justify-self: start;
  }
  .restore:active {
    background: var(--panel2);
  }
  .restore:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 2px;
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
