<script lang="ts">
  import type { ClientPrincipal } from '$lib/types';
  import { avatarUrl } from '$lib/auth';
  import { leagueState, setActiveLeague, loadLeagues } from '$lib/league.svelte';
  import ThemeToggle from './ThemeToggle.svelte';

  let {
    isAdmin = false,
    principal = null,
    alias = null
  }: { isAdmin?: boolean; principal?: ClientPrincipal | null; alias?: string | null } = $props();

  let open = $state(false);
  let rootEl: HTMLDivElement;
  let leaguePickerOpen = $state(false);

  // Every page renders NavMenu inside Masthead, so this effect is what
  // triggers the one shared league-list fetch app-wide (loadLeagues is a
  // no-op after the first successful call). Only meaningful once signed in.
  $effect(() => {
    if (principal) loadLeagues();
  });

  let unarchivedLeagues = $derived(leagueState.leagues.filter((l) => !l.archivedAt));
  let activeLeague = $derived(unarchivedLeagues.find((l) => l.id === leagueState.activeLeagueId) ?? unarchivedLeagues[0] ?? null);

  function pickLeague(id: string) {
    setActiveLeague(id);
    leaguePickerOpen = false;
  }

  function toggle() {
    open = !open;
  }

  function close() {
    open = false;
    leaguePickerOpen = false;
  }

  // Deferred: closing synchronously inside a nav link's own click handler would
  // unmount the <a> (via the {#if open} block) before the browser processes
  // that same click's default navigation, silently canceling it.
  function navigate() {
    setTimeout(close, 0);
  }

  function onDocClick(e: MouseEvent) {
    if (open && rootEl && !rootEl.contains(e.target as Node)) close();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }
</script>

<svelte:window onclick={onDocClick} onkeydown={onKeydown} />

<div class="navmenu" bind:this={rootEl}>
  <button type="button" class="burger" aria-label="Menu" aria-haspopup="true" aria-expanded={open} onclick={toggle}>
    <span></span><span></span><span></span>
  </button>
  {#if open}
    <nav class="menu">
      {#if principal}
        <a class="who" href="/profile" onclick={navigate}>
          {#if avatarUrl(principal)}
            <img class="av" alt="" src={avatarUrl(principal)} />
          {/if}
          <span class="login">{alias || principal.userDetails}</span>
        </a>
        <div class="divider"></div>
      {/if}
      <a class="item" href="/" onclick={navigate}>Tracker</a>
      <a class="item" href="/leaderboard" onclick={navigate}>Leaderboard</a>
      {#if isAdmin}
        <div class="divider">Admin</div>
        <a class="item admin" href="/admin" onclick={navigate}>Manage users</a>
        <a class="item admin" href="/decks" onclick={navigate}>Manage decks</a>
        <a class="item admin" href="/seasons" onclick={navigate}>Manage seasons</a>
        <a class="item admin" href="/leagues" onclick={navigate}>Manage leagues</a>
      {/if}
      {#if unarchivedLeagues.length > 1}
        <div class="divider">League</div>
        <div class="league-row">
          <button
            type="button"
            class="league-pill"
            aria-haspopup="true"
            aria-expanded={leaguePickerOpen}
            onclick={() => (leaguePickerOpen = !leaguePickerOpen)}
          >
            {activeLeague?.name ?? 'League'}
            <span class="chev-sm">▾</span>
          </button>
          {#if leaguePickerOpen}
            <div class="league-menu">
              {#each unarchivedLeagues as l (l.id)}
                <button class="league-item" class:active={l.id === activeLeague?.id} onclick={() => pickLeague(l.id)}
                  >{l.name}</button
                >
              {/each}
            </div>
          {/if}
        </div>
      {/if}
      <div class="divider">Theme</div>
      <div class="theme-row"><ThemeToggle /></div>
      <div class="divider"></div>
      <a class="item" href="/logout">Sign out</a>
    </nav>
  {/if}
</div>

<style>
  .navmenu {
    position: relative;
    flex: 0 0 auto;
  }
  .burger {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    width: 28px;
    height: 28px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: transparent;
    cursor: pointer;
    padding: 0;
  }
  .burger:hover {
    border-color: var(--muted2);
  }
  .burger:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 2px;
  }
  .burger span {
    display: block;
    width: 14px;
    height: 2px;
    border-radius: 2px;
    background: var(--muted);
  }
  .burger[aria-expanded='true'] span {
    background: var(--text);
  }
  .menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 20;
    display: flex;
    flex-direction: column;
    min-width: 180px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 6px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
  }
  .who {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-radius: 7px;
    text-decoration: none;
  }
  .who:hover {
    background: var(--panel2);
  }
  .who:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 2px;
  }
  .who .av {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--panel2);
    flex: 0 0 auto;
    object-fit: cover;
  }
  .who .login {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .league-row {
    position: relative;
    padding: 2px 6px 6px;
  }
  .league-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-family: inherit;
    font-size: 11.5px;
    color: var(--muted);
    background: transparent;
    border: 1px solid var(--line);
    border-radius: 20px;
    padding: 5px 13px;
    cursor: pointer;
    white-space: nowrap;
    max-width: 100%;
  }
  .chev-sm {
    font-size: 8px;
    color: var(--muted2);
    line-height: 1;
  }
  .league-pill[aria-expanded='true'] {
    color: var(--text);
    border-color: var(--muted2);
    background: var(--panel2);
  }
  .league-menu {
    position: absolute;
    top: calc(100% + 2px);
    left: 6px;
    right: 6px;
    z-index: 21;
    display: flex;
    flex-direction: column;
    max-height: 220px;
    overflow-y: auto;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 6px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
  }
  .league-item {
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
  .league-item:hover {
    background: var(--panel2);
  }
  .league-item.active {
    color: var(--gold);
  }
  .theme-row {
    padding: 2px 6px 6px;
  }
  .theme-row :global(.theme-toggle) {
    display: inline-flex;
    width: max-content;
    margin-left: 0;
  }
  .item {
    font-size: 12.5px;
    color: var(--text);
    text-decoration: none;
    border-radius: 7px;
    padding: 8px 10px;
    white-space: nowrap;
  }
  .item:hover {
    background: var(--panel2);
  }
  .item.admin {
    color: var(--gold);
  }
  .divider {
    margin: 4px 4px 2px;
    padding-top: 6px;
    border-top: 1px solid var(--line);
    font-size: 9.5px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted2);
  }
  .divider:empty {
    padding-top: 0;
    margin-top: 4px;
    margin-bottom: 4px;
  }
</style>
