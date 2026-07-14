<script lang="ts">
  let { size = 34 }: { size?: number } = $props();
</script>

<svg class="ball" viewBox="0 0 100 100" aria-hidden="true" style="width:{size}px;height:{size}px;">
  <circle cx="50" cy="50" r="46" fill="#fff" stroke="#0d0f16" stroke-width="6" />
  <path d="M4 50a46 46 0 0 1 92 0Z" fill="#ef2f42" />
  <rect x="4" y="46" width="92" height="8" fill="#0d0f16" />
  <circle cx="50" cy="50" r="14" fill="#fff" stroke="#0d0f16" stroke-width="6" />
  <circle cx="50" cy="50" r="5" fill="#0d0f16" />
</svg>

<style>
  .ball {
    flex: 0 0 auto;
    filter: drop-shadow(0 2px 6px rgba(239, 47, 66, 0.4));
  }
</style>
