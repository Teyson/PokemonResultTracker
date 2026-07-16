<script lang="ts">
  import { toastState } from '$lib/toast.svelte';

  function runAction() {
    toastState.action?.onClick();
    toastState.visible = false;
  }
</script>

<div class="toast" class:show={toastState.visible} class:err={toastState.isError}>
  <span>{toastState.message}</span>
  {#if toastState.action}
    <button type="button" class="action" onclick={runAction}>{toastState.action.label}</button>
  {/if}
</div>

<style>
  .toast {
    position: fixed;
    left: 50%;
    bottom: 22px;
    transform: translateX(-50%);
    background: var(--panel2);
    border: 1px solid var(--line);
    color: var(--text);
    padding: 11px 18px;
    border-radius: 10px;
    font-size: 13px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
    opacity: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    transition:
      opacity 0.2s,
      transform 0.2s;
    pointer-events: none;
    z-index: 50;
  }
  .toast.show {
    opacity: 1;
    transform: translateX(-50%) translateY(-4px);
    pointer-events: auto;
  }
  .toast.err {
    border-color: var(--red);
    color: #ffd7db;
  }
  .toast .action {
    flex: 0 0 auto;
    font-family: inherit;
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--gold);
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0;
  }
  .toast .action:hover {
    text-decoration: underline;
  }
</style>
