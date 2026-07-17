<script lang="ts">
  let { isAdmin = false }: { isAdmin?: boolean } = $props();

  let open = $state(false);
  let rootEl: HTMLDivElement;

  function toggle() {
    open = !open;
  }

  function close() {
    open = false;
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
      <a class="item" href="/" onclick={navigate}>Tracker</a>
      <a class="item" href="/leaderboard" onclick={navigate}>Leaderboard</a>
      {#if isAdmin}
        <div class="divider">Admin</div>
        <a class="item admin" href="/admin" onclick={navigate}>Manage users</a>
        <a class="item admin" href="/decks" onclick={navigate}>Manage decks</a>
      {/if}
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
    min-width: 168px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 6px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
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
