<script lang="ts">
  let { type, size = 26 }: { type: string; size?: number } = $props();
</script>

<img
  class="type-icon"
  src="/energy/{type.toLowerCase()}.png"
  alt={type}
  width={size}
  height={size}
/>

<style>
  .type-icon {
    display: block;
    border-radius: 50%;
  }
</style>
