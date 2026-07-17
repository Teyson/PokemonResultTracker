<script lang="ts">
  import { getContext } from 'svelte';
  import type { ClientPrincipal, Night, NightInput, DeckSummary } from '$lib/types';
  import { avatarUrl } from '$lib/auth';
  import { api } from '$lib/api';
  import { toast } from '$lib/toast.svelte';
  import PokeBall from '$lib/components/PokeBall.svelte';
  import Scoreboard from '$lib/components/Scoreboard.svelte';
  import Records from '$lib/components/Records.svelte';
  import Badges from '$lib/components/Badges.svelte';
  import CalendarHeatmap from '$lib/components/CalendarHeatmap.svelte';
  import NightForm from '$lib/components/NightForm.svelte';
  import NightsList from '$lib/components/NightsList.svelte';
  import DeckTable from '$lib/components/DeckTable.svelte';
  import Toast from '$lib/components/Toast.svelte';
  import NavMenu from '$lib/components/NavMenu.svelte';

  const auth = getContext<{ principal: ClientPrincipal | null; loading: boolean; isMember: boolean; isAdmin: boolean }>(
    'auth'
  );

  let isMember = $derived(auth.isMember);
  let isAdmin = $derived(auth.isAdmin);

  let nights = $state<Night[]>([]);
  let nightsLoaded = $state(false);
  let decks = $state<DeckSummary[]>([]);
  let editing = $state<Night | null>(null);
  let viewScope = $state<'mine' | 'all'>('mine');
  let nightsOpen = $state(false);

  $effect(() => {
    if (isMember && !nightsLoaded) {
      loadNights();
      loadDecks();
    }
  });

  async function loadNights() {
    try {
      const query = isAdmin && viewScope === 'all' ? '?scope=all' : '';
      nights = (await api<Night[]>(`/api/nights${query}`)) ?? [];
      nightsLoaded = true;
    } catch (e) {
      toast(`Could not load nights: ${(e as Error).message}`, true);
    }
  }

  async function loadDecks() {
    try {
      decks = (await api<DeckSummary[]>('/api/decks')) ?? [];
    } catch (e) {
      toast(`Could not load decks: ${(e as Error).message}`, true);
    }
  }

  function setViewScope(scope: 'mine' | 'all') {
    if (viewScope === scope) return;
    viewScope = scope;
    nightsLoaded = false;
    loadNights();
  }

  async function handleSave(input: NightInput, editId: string | null) {
    try {
      if (editId) {
        await api(`/api/nights/${encodeURIComponent(editId)}`, {
          method: 'PUT',
          body: JSON.stringify(input)
        });
      } else {
        await api('/api/nights', { method: 'POST', body: JSON.stringify(input) });
      }
      await Promise.all([loadNights(), loadDecks()]);
      editing = null;
      toast(editId ? 'Night updated' : 'Night logged');
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  async function handleDelete(n: Night) {
    try {
      await api(`/api/nights/${encodeURIComponent(n.id)}`, { method: 'DELETE' });
      if (editing?.id === n.id) editing = null;
      await loadNights();
      toast('Night deleted');
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  function startEdit(n: Night) {
    editing = n;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
</script>

<svelte:head>
  <title>Pokémon Result Tracker</title>
</svelte:head>

{#if !auth.loading}
  {#if !auth.principal}
    <div class="gate">
      <PokeBall size={56} />
      <h1>Pokémon Result Tracker</h1>
      <p>A private log for our Pokémon TCG nights. Sign in with GitHub to continue.</p>
      <a class="biglink" href="/login">Sign in with GitHub</a>
    </div>
  {:else if !isMember}
    <div class="gate">
      <PokeBall size={56} />
      <h1>Almost there</h1>
      <p>
        You're signed in, but your account isn't on the guest list yet. Send the admin the username below and
        they'll add you.
      </p>
      <div class="me">
        {#if avatarUrl(auth.principal)}
          <img class="av" alt="" src={avatarUrl(auth.principal)} />
        {/if}
        <b>{auth.principal.userDetails}</b>
      </div>
      <div class="row"><a class="biglink ghost" href="/logout">Sign out</a></div>
    </div>
  {:else}
    <div class="wrap">
      <div class="masthead">
        <PokeBall size={34} />
        <div class="title">
          <h1>Pokémon Result Tracker</h1>
          <div class="sub">casual Pokémon TCG log</div>
        </div>
        <NavMenu {isAdmin} principal={auth.principal} />
      </div>

      <Scoreboard {nights} />
      <Records {nights} />
      <NightForm
        {nights}
        {decks}
        {editing}
        myLogin={auth.principal.userDetails}
        onSave={handleSave}
        onCancel={() => (editing = null)}
      />

      <DeckTable {nights} showOwner={isAdmin && viewScope === 'all'} />

      <CalendarHeatmap {nights} />

      <div
        class="section-title toggle"
        role="button"
        tabindex="0"
        onclick={() => (nightsOpen = !nightsOpen)}
        onkeydown={(e) => e.key === 'Enter' && (nightsOpen = !nightsOpen)}
      >
        Nights
        {#if isAdmin}
          <div class="scope-toggle">
            <button class:active={viewScope === 'mine'} onclick={(e) => { e.stopPropagation(); setViewScope('mine'); }}>Mine</button>
            <button class:active={viewScope === 'all'} onclick={(e) => { e.stopPropagation(); setViewScope('all'); }}>Everyone</button>
          </div>
        {/if}
        <span class="chev">{nightsOpen ? '▴' : '▾'}</span>
      </div>
      {#if nightsOpen}
        <NightsList {nights} showOwner={isAdmin && viewScope === 'all'} onEdit={startEdit} onDelete={handleDelete} />
      {/if}

      <Badges {nights} />

      <div class="foot">
        <b>Points/game</b> is the fair comparison across nights, since game counts vary.<br />
        Scoring: 3 win · 1 tie · 0 loss &nbsp;·&nbsp; max 3.00 ppg.<br />
        Everything you log is saved to the shared league database.
      </div>
    </div>
  {/if}
{/if}

<Toast />

<style>
  .wrap {
    max-width: 680px;
    margin: 0 auto;
  }

  .masthead {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }
  .masthead .title {
    flex: 1;
    min-width: 0;
  }
  .masthead h1 {
    font-family: var(--display);
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    font-size: 22px;
    margin: 0;
    line-height: 1;
  }
  .masthead .sub {
    color: var(--muted);
    font-size: 12px;
    letter-spacing: 0.04em;
    margin-top: 3px;
  }

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
  .chev {
    font-size: 11px;
  }
  .scope-toggle {
    display: flex;
    gap: 4px;
    text-transform: none;
    letter-spacing: normal;
  }
  .scope-toggle button {
    font-family: inherit;
    font-size: 10.5px;
    letter-spacing: 0.04em;
    color: var(--muted);
    background: transparent;
    border: 1px solid var(--line);
    border-radius: 20px;
    padding: 3px 10px;
    cursor: pointer;
  }
  .scope-toggle button.active {
    color: var(--text);
    border-color: var(--muted2);
    background: var(--panel2);
  }

  .foot {
    color: var(--muted2);
    font-size: 11px;
    text-align: center;
    margin-top: 22px;
    line-height: 1.6;
  }
  .foot b {
    color: var(--gold);
    font-weight: 600;
  }

  .gate {
    max-width: 440px;
    margin: 8vh auto 0;
    text-align: center;
    padding: 0 8px;
  }
  .gate h1 {
    font-family: var(--display);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    font-size: 26px;
    margin: 18px 0 8px;
  }
  .gate p {
    color: var(--muted);
    font-size: 14px;
    line-height: 1.6;
    margin: 0 auto 22px;
    max-width: 340px;
  }
  .gate .me {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 9px 14px;
    display: inline-flex;
    align-items: center;
    gap: 9px;
    margin-bottom: 22px;
    font-size: 13px;
  }
  .gate .me .av {
    width: 22px;
    height: 22px;
    border-radius: 50%;
  }
  .biglink {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    background: linear-gradient(180deg, var(--red) 0%, var(--red-deep) 100%);
    color: #fff;
    text-decoration: none;
    font-family: var(--display);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 14px 26px;
    border-radius: 11px;
    font-size: 14px;
    box-shadow: 0 3px 12px rgba(239, 47, 66, 0.3);
  }
  .biglink.ghost {
    background: transparent;
    border: 1px solid var(--line);
    color: var(--muted);
    box-shadow: none;
    font-size: 12px;
    padding: 10px 20px;
  }
  .gate .row {
    display: flex;
    gap: 10px;
    justify-content: center;
    flex-wrap: wrap;
  }

  @media (max-width: 440px) {
    .masthead h1 {
      font-size: 19px;
    }
  }
</style>
