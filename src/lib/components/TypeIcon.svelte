<script lang="ts">
  import { colorOf } from '$lib/pokemon';

  let { type, size = 26 }: { type: string; size?: number } = $props();

  const shade = (hex: string, amt: number): string => {
    const n = parseInt(hex.slice(1), 16);
    const clamp = (v: number) => Math.max(0, Math.min(255, v));
    const r = clamp(((n >> 16) & 0xff) + amt);
    const g = clamp(((n >> 8) & 0xff) + amt);
    const b = clamp((n & 0xff) + amt);
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  };
</script>

<svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={type}>
  <defs>
    <radialGradient id="bg-{type}" cx="35%" cy="30%" r="75%">
      <stop offset="0%" stop-color={shade(colorOf(type), 45)} />
      <stop offset="100%" stop-color={shade(colorOf(type), -15)} />
    </radialGradient>
  </defs>
  <circle cx="12" cy="12" r="11.5" fill="url(#bg-{type})" stroke={shade(colorOf(type), -40)} stroke-width="0.6" />

  {#if type === 'Fire'}
    <path
      d="M12 3.2c-2.1 3-3.9 5.6-3.9 8.3a3.9 3.9 0 007.8 0c0-2.7-1.8-5.3-3.9-8.3z"
      fill="#fff"
    />
    <path
      d="M12 9.5c-1 1.5-1.9 2.7-1.9 3.9a1.9 1.9 0 003.8 0c0-1.2-.9-2.4-1.9-3.9z"
      fill={shade(colorOf(type), -10)}
      opacity="0.55"
    />
  {:else if type === 'Water'}
    <path
      d="M12 4.5c1.9 2.7 4.6 6.1 4.6 9.3a4.6 4.6 0 01-9.2 0c0-3.2 2.7-6.6 4.6-9.3z"
      fill="#fff"
    />
    <ellipse cx="10.1" cy="12.4" rx="1" ry="1.6" fill={colorOf(type)} opacity="0.35" />
  {:else if type === 'Grass'}
    <path
      d="M12 4.3c3.4.15 6.1 2.55 6.1 6.35 0 3.55-2.6 6.1-6.1 7.1-3.5-1-6.1-3.55-6.1-7.1 0-3.8 2.7-6.2 6.1-6.35z"
      fill="#fff"
    />
    <path d="M12 6.6v10.6" stroke={colorOf(type)} stroke-width="1.1" stroke-linecap="round" />
    <path d="M12 9.4c-1.3-.9-2.1-.85-3.15-.3M12 12.6c1.4-.9 2.2-.85 3.3-.25" stroke={colorOf(type)} stroke-width="1" stroke-linecap="round" fill="none" />
  {:else if type === 'Lightning'}
    <path d="M13.3 3.8 7.3 13.4h3.55L9.9 20.2l6.8-9.9h-3.7l1.3-6.5z" fill="#fff" />
  {:else if type === 'Psychic'}
    <path
      d="M4.3 12.3C5.6 9 8.4 6.7 12 6.7s6.4 2.3 7.7 5.6c-1.3 3.3-4.1 5.6-7.7 5.6s-6.4-2.3-7.7-5.6z"
      fill="#fff"
    />
    <circle cx="12" cy="12.3" r="2.7" fill={colorOf(type)} />
    <circle cx="11.1" cy="11.4" r="0.7" fill="#fff" />
  {:else if type === 'Fighting'}
    <ellipse cx="12.3" cy="9.6" rx="5.1" ry="4.6" fill="#fff" />
    <circle cx="7.4" cy="11.2" r="2.2" fill="#fff" />
    <rect x="8.8" y="13" width="7.4" height="6.4" rx="2.3" fill="#fff" />
    <rect x="8.8" y="15.6" width="7.4" height="1.5" fill={colorOf(type)} opacity="0.45" />
  {:else if type === 'Darkness'}
    <path
      d="M15.1 4.4a8 8 0 100 15.2A6.6 6.6 0 0113 12a6.6 6.6 0 012.1-7.6z"
      fill="#fff"
    />
    <circle cx="14.7" cy="9.3" r="0.85" fill={colorOf(type)} opacity="0.7" />
  {:else if type === 'Metal'}
    <path
      d="M12 3.6l7.5 4.2v8.4L12 20.4l-7.5-4.2V7.8z"
      fill="#fff"
    />
    <circle cx="12" cy="12" r="3.1" fill="url(#bg-{type})" stroke={shade(colorOf(type), -40)} stroke-width="0.5" />
    <path d="M12 5.4v2M12 16.6v2M6 9v6M18 9v6" stroke={colorOf(type)} stroke-width="0.9" stroke-linecap="round" opacity="0.6" />
  {:else if type === 'Dragon'}
    <path d="M12 3.8l4.7 4.5-1.75 6-2.95 5.9-2.95-5.9-1.75-6z" fill="#fff" />
    <circle cx="12" cy="10.4" r="1.7" fill={colorOf(type)} />
    <circle cx="11.5" cy="9.9" r="0.5" fill="#fff" />
  {:else if type === 'Fairy'}
    <path
      d="M12 3.6l1.5 5.9 5.9 1.5-5.9 1.5L12 18.4l-1.5-5.9-5.9-1.5 5.9-1.5z"
      fill="#fff"
    />
    <circle cx="17.3" cy="6.1" r="1" fill="#fff" opacity="0.85" />
  {:else}
    <circle cx="12" cy="12" r="5.4" fill="#fff" opacity="0.95" />
    <circle cx="12" cy="12" r="5.4" fill="none" stroke={colorOf(type)} stroke-width="0.5" opacity="0.4" />
  {/if}
</svg>

<style>
  svg {
    display: block;
  }
</style>
