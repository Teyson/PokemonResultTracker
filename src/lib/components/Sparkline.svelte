<script lang="ts">
  let {
    values,
    width = 40,
    height = 14,
    color = 'var(--muted)',
    autoScale = false
  }: { values: number[]; width?: number; height?: number; color?: string; autoScale?: boolean } = $props();

  // PPG is always on a 0-3 scale — fix the scale rather than auto-fitting to
  // the row's own min/max, so a flat line at 3.00 doesn't look identical to
  // one at 1.00. Other series (e.g. Elo ratings) have no fixed range, so they
  // opt into fitting the domain to their own min/max instead.
  const MAX_PPG = 3;

  let domain = $derived.by((): [number, number] => {
    if (!autoScale) return [0, MAX_PPG];
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (min === max) return [min - 1, max + 1];
    const pad = (max - min) * 0.1;
    return [min - pad, max + pad];
  });

  let points = $derived(
    values
      .map((v, i) => {
        const x = values.length > 1 ? (i / (values.length - 1)) * width : width / 2;
        const [lo, hi] = domain;
        const y = height - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * height;
        return `${x},${y}`;
      })
      .join(' ')
  );
</script>

{#if values.length >= 2}
  <svg {width} {height} viewBox="0 0 {width} {height}" class="spark" aria-hidden="true">
    <polyline {points} fill="none" stroke={color} stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
{:else}
  <span class="spark-empty">—</span>
{/if}

<style>
  .spark {
    display: block;
    flex: 0 0 auto;
    overflow: visible;
  }
  .spark-empty {
    color: var(--muted2);
    font-size: 11px;
  }
</style>
