<script lang="ts">
  import '../app.css';
  import { setContext } from 'svelte';
  import { fetchPrincipal } from '$lib/auth';
  import type { ClientPrincipal } from '$lib/types';

  let { children } = $props();

  // Shared reactive auth state, read via getContext('auth') by both routes —
  // resolved once here since /.auth/me is identical regardless of which page loaded.
  const auth = $state<{ principal: ClientPrincipal | null; loading: boolean }>({
    principal: null,
    loading: true
  });
  setContext('auth', auth);

  $effect(() => {
    fetchPrincipal().then((p) => {
      auth.principal = p;
      auth.loading = false;
    });
  });
</script>

{@render children()}
