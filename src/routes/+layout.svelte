<script lang="ts">
  import '../app.css';
  import { setContext } from 'svelte';
  import { fetchPrincipal } from '$lib/auth';
  import type { ClientPrincipal } from '$lib/types';

  let { children } = $props();

  // Shared reactive auth state, read via getContext('auth') by both routes —
  // resolved once here since /.auth/me (and /api/me) are identical regardless
  // of which page loaded. isMember/isAdmin come from /api/me rather than
  // principal.userRoles: Free-tier Static Web Apps can't run a rolesSource
  // function, so userRoles only ever holds the built-in "authenticated" role —
  // the real member/admin check happens in the API itself (see api/src/auth.ts).
  const auth = $state<{ principal: ClientPrincipal | null; loading: boolean; isMember: boolean; isAdmin: boolean }>({
    principal: null,
    loading: true,
    isMember: false,
    isAdmin: false
  });
  setContext('auth', auth);

  $effect(() => {
    fetchPrincipal().then(async (p) => {
      auth.principal = p;
      if (p) {
        try {
          const res = await fetch('/api/me');
          const me = res.ok ? await res.json() : null;
          auth.isMember = me?.isMember ?? false;
          auth.isAdmin = me?.isAdmin ?? false;
        } catch {
          auth.isMember = false;
          auth.isAdmin = false;
        }
      } else {
        auth.isMember = false;
        auth.isAdmin = false;
      }
      auth.loading = false;
    });
  });
</script>

{@render children()}
