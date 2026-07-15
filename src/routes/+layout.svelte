<script lang="ts">
  import '../app.css';
  import { setContext } from 'svelte';
  import { fetchPrincipal } from '$lib/auth';
  import { DEV_LOGIN_ENABLED, loadDevPrincipal } from '$lib/devAuth';
  import type { ClientPrincipal } from '$lib/types';
  import DevLoginBar from '$lib/components/DevLoginBar.svelte';

  let { children } = $props();

  // Shared reactive auth state, read via getContext('auth') by both routes —
  // resolved once here since /.auth/me is identical regardless of which page loaded.
  const auth = $state<{ principal: ClientPrincipal | null; loading: boolean }>({
    principal: null,
    loading: true
  });
  setContext('auth', auth);

  $effect(() => {
    if (DEV_LOGIN_ENABLED) {
      auth.principal = loadDevPrincipal();
      auth.loading = false;
      return;
    }
    fetchPrincipal().then((p) => {
      auth.principal = p;
      auth.loading = false;
    });
  });
</script>

{#if DEV_LOGIN_ENABLED}
  <DevLoginBar />
{/if}
{@render children()}
