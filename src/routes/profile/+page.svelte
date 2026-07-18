<script lang="ts">
  import { getContext } from 'svelte';
  import type { AuthContext } from '$lib/types';
  import { avatarUrl } from '$lib/auth';
  import { api } from '$lib/api';
  import { toast } from '$lib/toast.svelte';
  import PokeBall from '$lib/components/PokeBall.svelte';
  import Toast from '$lib/components/Toast.svelte';
  import Masthead from '$lib/components/Masthead.svelte';

  const auth = getContext<AuthContext>('auth');
  let isAdmin = $derived(auth.isAdmin);
  let isMember = $derived(auth.isMember);

  const MAX_ALIAS_LENGTH = 50;

  let aliasInput = $state('');
  let aliasInitialized = $state(false);
  let savingAlias = $state(false);

  // Only seed the input once alias is actually known (after the /api/me
  // fetch in +layout.svelte resolves) — seeding earlier would overwrite
  // whatever the member is mid-typing the moment that fetch lands.
  $effect(() => {
    if (!aliasInitialized && !auth.loading && isMember) {
      aliasInput = auth.alias ?? '';
      aliasInitialized = true;
    }
  });

  let dirty = $derived(aliasInput.trim() !== (auth.alias ?? ''));
  let previewName = $derived(aliasInput.trim() || auth.principal?.userDetails || '');

  async function saveAlias() {
    savingAlias = true;
    try {
      const trimmed = aliasInput.trim();
      const res = await api<{ alias: string | null }>('/api/me', {
        method: 'PUT',
        body: JSON.stringify({ alias: trimmed || null })
      });
      auth.alias = res?.alias ?? null;
      aliasInput = auth.alias ?? '';
      toast(auth.alias ? `Alias set to ${auth.alias}` : 'Alias cleared — showing your GitHub username again');
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      savingAlias = false;
    }
  }

  function clearAlias() {
    aliasInput = '';
    saveAlias();
  }
</script>

<svelte:head>
  <title>Pokémon Result Tracker · Profile</title>
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
      <Masthead {isAdmin} principal={auth.principal} alias={auth.alias} />
      <h2>Your profile</h2>

      <div class="card who-card">
        {#if avatarUrl(auth.principal)}
          <img class="av" alt="" src={avatarUrl(auth.principal)} />
        {/if}
        <div>
          <div class="ghlogin">{auth.principal.userDetails}</div>
          <div class="ghsub">Your GitHub username — always visible to the admin.</div>
        </div>
      </div>

      <div class="card alias-card">
        <label class="field-label" for="alias">Display name</label>
        <p class="sub">
          Shown to other players instead of your GitHub username — on the leaderboard, opponent deck lists, and
          anywhere else your name appears. Leave blank to just use your GitHub username.
        </p>
        <input
          id="alias"
          type="text"
          placeholder={auth.principal.userDetails}
          maxlength={MAX_ALIAS_LENGTH}
          bind:value={aliasInput}
          onkeydown={(e) => e.key === 'Enter' && dirty && saveAlias()}
        />
        <div class="preview">Others will see you as <b>{previewName}</b></div>
        <div class="alias-actions">
          <button type="button" class="btn primary" disabled={!dirty || savingAlias} onclick={saveAlias}>Save</button>
          {#if auth.alias}
            <button type="button" class="btn ghost" disabled={savingAlias} onclick={clearAlias}>Clear alias</button>
          {/if}
        </div>
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
  h2 {
    font-family: var(--display);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    font-size: 20px;
    margin: 0 0 14px;
  }
  .card {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 15px;
    margin-bottom: 14px;
  }
  .who-card {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .who-card .av {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--panel2);
    flex: 0 0 auto;
    object-fit: cover;
  }
  .ghlogin {
    font-weight: 700;
    font-size: 15px;
  }
  .ghsub {
    color: var(--muted);
    font-size: 11.5px;
    margin-top: 2px;
  }
  .field-label {
    display: block;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 6px;
  }
  .alias-card .sub {
    color: var(--muted);
    font-size: 12.5px;
    line-height: 1.5;
    margin: 0 0 12px;
  }
  .alias-card input {
    width: 100%;
    box-sizing: border-box;
    background: var(--ink);
    border: 1px solid var(--line);
    color: var(--text);
    border-radius: 9px;
    padding: 11px 13px;
    font-size: 14px;
    font-family: inherit;
  }
  .alias-card input:focus {
    outline: none;
    border-color: var(--red);
    box-shadow: 0 0 0 3px rgba(239, 47, 66, 0.16);
  }
  .preview {
    font-size: 12px;
    color: var(--muted2);
    margin-top: 9px;
  }
  .preview b {
    color: var(--gold);
  }
  .alias-actions {
    display: flex;
    gap: 10px;
    margin-top: 13px;
  }
  .btn {
    border: none;
    border-radius: 10px;
    padding: 11px 20px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    font-family: var(--display);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .btn.primary {
    background: linear-gradient(180deg, var(--red) 0%, var(--red-deep) 100%);
    color: #fff;
    box-shadow: 0 3px 10px rgba(239, 47, 66, 0.3);
  }
  .btn.primary:disabled {
    opacity: 0.5;
    cursor: default;
    box-shadow: none;
  }
  .btn.ghost {
    background: transparent;
    border: 1px solid var(--line);
    color: var(--muted);
  }
  .btn.ghost:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .btn:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 2px;
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
</style>
