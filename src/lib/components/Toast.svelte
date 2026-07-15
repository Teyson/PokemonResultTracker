<script lang="ts">
  import { toastState } from '$lib/toast.svelte';
</script>

<div class="toast" class:show={toastState.visible} class:err={toastState.isError}>
  {toastState.message}
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
    transition:
      opacity 0.2s,
      transform 0.2s;
    pointer-events: none;
    z-index: 50;
  }
  .toast.show {
    opacity: 1;
    transform: translateX(-50%) translateY(-4px);
  }
  .toast.err {
    border-color: var(--red);
    color: #ffd7db;
  }
</style>
