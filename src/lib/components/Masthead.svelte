<script lang="ts">
  import PokeBall from './PokeBall.svelte';
  import NavMenu from './NavMenu.svelte';
  import type { ClientPrincipal } from '$lib/types';

  let { isAdmin = false, principal = null }: { isAdmin?: boolean; principal?: ClientPrincipal | null } = $props();
</script>

<div class="masthead">
  <a class="brand" href="/">
    <PokeBall size={34} />
    <div class="title">
      <h1>Pokémon Result Tracker</h1>
      <div class="sub">casual Pokémon TCG log</div>
    </div>
  </a>
  <NavMenu {isAdmin} {principal} />
</div>

<style>
  .masthead {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
    min-width: 0;
    color: inherit;
    text-decoration: none;
  }
  .brand:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 2px;
    border-radius: 6px;
  }
  .title {
    flex: 1;
    min-width: 0;
  }
  h1 {
    font-family: var(--display);
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    font-size: 22px;
    margin: 0;
    line-height: 1;
  }
  .sub {
    color: var(--muted);
    font-size: 12px;
    letter-spacing: 0.04em;
    margin-top: 3px;
  }

  @media (max-width: 440px) {
    h1 {
      font-size: 19px;
    }
  }
</style>
