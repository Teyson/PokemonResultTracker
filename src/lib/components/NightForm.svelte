<script lang="ts">
  import type { Night, NightInput } from '$lib/types';
  import { TYPES, colorOf, recentTuesday } from '$lib/pokemon';

  let {
    nights,
    editing,
    onSave,
    onCancel
  }: {
    nights: Night[];
    editing: Night | null;
    onSave: (input: NightInput, editId: string | null) => Promise<void>;
    onCancel: () => void;
  } = $props();

  interface DeckOption {
    name: string;
    type: string;
  }

  function deckRegistry(): DeckOption[] {
    const map = new Map<string, DeckOption>();
    for (const n of nights) {
      const k = n.deck.trim().toLowerCase();
      if (!map.has(k)) map.set(k, { name: n.deck, type: n.type });
    }
    return [...map.values()];
  }

  let decks = $derived(deckRegistry());

  let date = $state(recentTuesday());
  let deck = $state('');
  let newDeckName = $state('');
  let newDeck = $state(true);
  let type = $state('Psychic');
  let w = $state(0);
  let t = $state(0);
  let l = $state(0);
  let saving = $state(false);

  $effect(() => {
    if (editing) {
      date = editing.date;
      deck = editing.deck;
      type = editing.type;
      newDeck = false;
      newDeckName = '';
      w = editing.w;
      t = editing.t;
      l = editing.l;
    } else {
      const opts = deckRegistry();
      date = recentTuesday();
      deck = opts[0]?.name ?? '';
      type = opts[0]?.type ?? 'Psychic';
      newDeck = opts.length === 0;
      newDeckName = '';
      w = 0;
      t = 0;
      l = 0;
    }
  });

  function selectDeck(d: DeckOption) {
    newDeck = false;
    deck = d.name;
    type = d.type;
  }
  function selectNewDeck() {
    newDeck = true;
    deck = '';
  }
  function step(key: 'w' | 't' | 'l', delta: number) {
    if (key === 'w') w = Math.max(0, w + delta);
    else if (key === 't') t = Math.max(0, t + delta);
    else l = Math.max(0, l + delta);
  }

  async function save() {
    const finalDeck = (newDeck ? newDeckName.trim() : deck) || 'Untitled deck';
    saving = true;
    try {
      await onSave({ date: date || recentTuesday(), deck: finalDeck, type, w, t, l }, editing?.id ?? null);
    } finally {
      saving = false;
    }
  }
</script>

<div class="section-title">{editing ? 'Edit night' : 'Log a night'}</div>
<div class="card">
  <div class="form-row">
    <div class="field"><label for="fDate">Date</label><input id="fDate" type="date" bind:value={date} /></div>
  </div>

  <div class="field" style="margin-bottom:13px;">
    <span class="field-label" id="deckLabel">Deck</span>
    <div class="deckchips" role="group" aria-labelledby="deckLabel">
      {#each decks as d (d.name)}
        <button
          type="button"
          class="dchip"
          aria-pressed={!newDeck && deck === d.name}
          onclick={() => selectDeck(d)}
        >
          <span class="cd" style="background:{colorOf(d.type)}"></span>{d.name}
        </button>
      {/each}
      <button type="button" class="dchip new" aria-pressed={newDeck} onclick={selectNewDeck}>+ New deck</button>
    </div>
    {#if newDeck}
      <input
        type="text"
        placeholder="New deck name"
        autocomplete="off"
        style="margin-top:9px;"
        bind:value={newDeckName}
      />
    {/if}
  </div>

  {#if newDeck}
    <div class="field" style="margin-bottom:13px;">
      <span class="field-label" id="typeLabel">Type</span>
      <div class="swatches" role="group" aria-labelledby="typeLabel">
        {#each TYPES as [name, col] (name)}
          <button
            type="button"
            class="sw"
            style="color:{col};background:{col}"
            aria-pressed={type === name}
            title={name}
            onclick={() => (type = name)}
          ></button>
        {/each}
      </div>
    </div>
  {/if}

  <div class="rec-row">
    <div class="stepper w">
      <div class="lab">Wins</div>
      <div class="ctl">
        <button type="button" onclick={() => step('w', -1)}>−</button><span class="val">{w}</span
        ><button type="button" onclick={() => step('w', 1)}>+</button>
      </div>
    </div>
    <div class="stepper t">
      <div class="lab">Ties</div>
      <div class="ctl">
        <button type="button" onclick={() => step('t', -1)}>−</button><span class="val">{t}</span
        ><button type="button" onclick={() => step('t', 1)}>+</button>
      </div>
    </div>
    <div class="stepper l">
      <div class="lab">Losses</div>
      <div class="ctl">
        <button type="button" onclick={() => step('l', -1)}>−</button><span class="val">{l}</span
        ><button type="button" onclick={() => step('l', 1)}>+</button>
      </div>
    </div>
  </div>

  <div class="actions">
    <button class="btn primary" disabled={saving} onclick={save}>{editing ? 'Save changes' : 'Log night'}</button>
    {#if editing}
      <button class="btn ghost" onclick={onCancel}>Cancel</button>
    {/if}
  </div>
</div>

<style>
  .section-title {
    font-family: var(--display);
    font-size: 12px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--muted);
    margin: 22px 2px 10px;
    display: flex;
    align-items: center;
    gap: 9px;
  }
  .section-title::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--line);
  }
  .card {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 15px;
  }
  .form-row {
    display: flex;
    gap: 10px;
    margin-bottom: 11px;
  }
  .field {
    flex: 1;
    min-width: 0;
  }
  .field label,
  .field-label {
    display: block;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 6px;
  }
  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }
  .sw {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    position: relative;
    transition: transform 0.08s;
    padding: 0;
  }
  .sw:active {
    transform: scale(0.9);
  }
  .sw:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 2px;
  }
  .sw[aria-pressed='true'] {
    border-color: var(--text);
    box-shadow:
      0 0 0 2px var(--ink),
      0 0 0 4px currentColor;
  }
  .deckchips {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }
  .dchip {
    display: flex;
    align-items: center;
    gap: 7px;
    background: var(--ink);
    border: 1px solid var(--line);
    color: var(--text);
    border-radius: 22px;
    padding: 9px 14px;
    font-size: 13.5px;
    cursor: pointer;
    font-family: inherit;
    transition: transform 0.07s;
  }
  .dchip:active {
    transform: scale(0.96);
  }
  .dchip:focus-visible {
    outline: 2px solid var(--red);
    outline-offset: 2px;
  }
  .dchip .cd {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    flex: 0 0 auto;
  }
  .dchip[aria-pressed='true'] {
    border-color: var(--red);
    background: rgba(239, 47, 66, 0.13);
    box-shadow: 0 0 0 2px rgba(239, 47, 66, 0.2);
  }
  .dchip.new {
    border-style: dashed;
    color: var(--muted);
  }
  .dchip.new[aria-pressed='true'] {
    border-color: var(--gold);
    color: var(--gold);
    background: rgba(246, 201, 69, 0.1);
    box-shadow: none;
  }
  .rec-row {
    display: flex;
    gap: 10px;
    margin-bottom: 13px;
  }
  .stepper {
    flex: 1;
    background: var(--ink);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 8px 6px;
    text-align: center;
  }
  .stepper .lab {
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 5px;
  }
  .stepper.w .lab {
    color: var(--win);
  }
  .stepper.t .lab {
    color: var(--tie);
  }
  .stepper.l .lab {
    color: var(--loss);
  }
  .stepper .ctl {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
  }
  .stepper button {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--panel2);
    color: var(--text);
    font-size: 19px;
    line-height: 1;
    cursor: pointer;
    font-family: var(--display);
  }
  .stepper button:active {
    background: var(--red-deep);
  }
  .stepper button:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 2px;
  }
  .stepper .val {
    font-family: var(--display);
    font-weight: 700;
    font-size: 22px;
    min-width: 24px;
    font-variant-numeric: tabular-nums;
    display: inline-block;
    text-align: center;
  }
  .actions {
    display: flex;
    gap: 10px;
  }
  .btn {
    flex: 1;
    border: none;
    border-radius: 10px;
    padding: 13px;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    font-family: var(--display);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .btn.primary {
    background: linear-gradient(180deg, var(--red) 0%, var(--red-deep) 100%);
    color: #fff;
    box-shadow: 0 3px 10px rgba(239, 47, 66, 0.3);
  }
  .btn.primary:active {
    transform: translateY(1px);
  }
  .btn.primary:disabled {
    opacity: 0.55;
    cursor: default;
    box-shadow: none;
  }
  .btn.ghost {
    flex: 0 0 auto;
    background: transparent;
    border: 1px solid var(--line);
    color: var(--muted);
  }
  .btn:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 2px;
  }
</style>
