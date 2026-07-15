<script lang="ts">
  import { getContext } from 'svelte';
  import { buildDevPrincipal, saveDevPrincipal, type DevRole } from '$lib/devAuth';
  import type { ClientPrincipal } from '$lib/types';

  const auth = getContext<{ principal: ClientPrincipal | null; loading: boolean }>('auth');

  let username = $state('dev-tester');

  function login(role: DevRole) {
    const principal = buildDevPrincipal(role, username.trim() || 'dev-tester');
    saveDevPrincipal(principal);
    auth.principal = principal;
  }
</script>

<div class="dev-bar">
  <b>DEV LOGIN</b>
  <input type="text" bind:value={username} placeholder="username" />
  <button onclick={() => login('anonymous')}>Anonymous</button>
  <button onclick={() => login('pending')}>Pending</button>
  <button onclick={() => login('member')}>Member</button>
  <button onclick={() => login('admin')}>Admin</button>
  {#if auth.principal}
    <span class="status">
      as <b>{auth.principal.userDetails}</b> ({auth.principal.userRoles.join(', ') || 'no roles'})
    </span>
  {/if}
</div>

<style>
  .dev-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    background: #3a0f14;
    border-bottom: 2px solid #f6c945;
    color: #fff;
    padding: 6px 10px;
    font-size: 12px;
    font-family: system-ui, sans-serif;
  }
  .dev-bar input {
    background: #1c2030;
    border: 1px solid #444;
    color: #fff;
    border-radius: 6px;
    padding: 3px 8px;
    font-size: 12px;
    width: 110px;
  }
  .dev-bar button {
    background: #232840;
    border: 1px solid #444;
    color: #fff;
    border-radius: 6px;
    padding: 3px 10px;
    font-size: 12px;
    cursor: pointer;
    font-family: inherit;
  }
  .dev-bar button:hover {
    background: #2b3048;
  }
  .dev-bar .status {
    margin-left: auto;
    opacity: 0.85;
  }
</style>
