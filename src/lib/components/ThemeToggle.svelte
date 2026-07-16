<script lang="ts">
  import { themeState, setTheme } from '$lib/theme.svelte';
</script>

<div class="theme-toggle" role="group" aria-label="Theme">
  <button
    type="button"
    aria-pressed={themeState.preference === 'auto'}
    onclick={() => setTheme('auto')}
    title="Match system theme"
  >
    <svg viewBox="0 0 16 16" width="13" height="13" stroke="currentColor" stroke-width="1.3" fill="none">
      <circle cx="8" cy="8" r="6.2" />
      <path d="M8 1.8a6.2 6.2 0 0 1 0 12.4Z" fill="currentColor" stroke="none" />
    </svg>
  </button>
  <button
    type="button"
    aria-pressed={themeState.preference === 'light'}
    onclick={() => setTheme('light')}
    title="Light theme"
  >
    <svg viewBox="0 0 16 16" width="13" height="13" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round">
      <circle cx="8" cy="8" r="3.1" />
      <path
        d="M8 1.2v1.7M8 13.1v1.7M1.2 8h1.7M13.1 8h1.7M3.3 3.3l1.2 1.2M11.5 11.5l1.2 1.2M3.3 12.7l1.2-1.2M11.5 4.5l1.2-1.2"
      />
    </svg>
  </button>
  <button
    type="button"
    aria-pressed={themeState.preference === 'dark'}
    onclick={() => setTheme('dark')}
    title="Dark theme"
  >
    <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" stroke="none">
      <path d="M13.3 10a5.6 5.6 0 0 1-7.1-7.1 5.7 5.7 0 1 0 7.1 7.1Z" />
    </svg>
  </button>
</div>

<style>
  .theme-toggle {
    display: flex;
    gap: 2px;
    margin-left: auto;
    border: 1px solid var(--line);
    border-radius: 20px;
    padding: 2px;
    flex: 0 0 auto;
  }
  .theme-toggle button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    padding: 0;
  }
  .theme-toggle button:hover {
    color: var(--text);
  }
  .theme-toggle button[aria-pressed='true'] {
    background: var(--panel2);
    color: var(--text);
  }
  .theme-toggle button:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 1px;
  }
</style>
