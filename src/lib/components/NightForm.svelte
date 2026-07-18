<script lang="ts">
  import type { Night, NightInput, DeckSummary } from '$lib/types';
  import { recentTuesday, isTuesday, todayISO } from '$lib/pokemon';
  import DeckPicker, { type DeckOption } from './DeckPicker.svelte';
  import { slide } from 'svelte/transition';

  let {
    nights,
    decks: allDecks,
    editing,
    myLogin,
    onSave,
    onCancel
  }: {
    nights: Night[];
    decks: DeckSummary[];
    editing: Night | null;
    myLogin: string;
    onSave: (input: NightInput, editId: string | null) => Promise<void>;
    onCancel: () => void;
  } = $props();

  // The full global decklist (any owner, or unowned), for the opponent
  // picker — lets it search/sort across every deck rather than just names
  // the current user has personally logged against before.
  let opponentDecks = $derived<DeckOption[]>(
    allDecks.map((d) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      owner: d.ownerDisplayName,
      timesPlayedAgainst: d.timesPlayedAgainst,
      lastPlayedAgainst: d.lastPlayedAgainst
    }))
  );

  // Own-deck options are only decks the current user has actually created —
  // restricted to nights they logged (in admin "Everyone" scope, `nights`
  // includes other players' owned decks too, and picking one of those
  // wouldn't claim their deck, just create/match a same-named deck under the
  // current user). Decks only ever seen as an opponent must never show up
  // here — facing a deck doesn't make it yours.
  //
  // Sorted by most-recently-played first (idea #17): most players run the
  // same deck for weeks, so surfacing it as the first chip removes the only
  // real friction left in logging a night. Tracked by `date` explicitly
  // rather than relying on `nights` already arriving newest-first — the API
  // happens to do that today, but this stays correct even if it didn't.
  function deckRegistry(): DeckOption[] {
    const lastPlayed = new Map<string, string>();
    const byKey = new Map<string, DeckOption>();
    for (const n of nights) {
      if (n.createdBy !== myLogin) continue;
      const k = n.deck.trim().toLowerCase();
      if (!byKey.has(k)) byKey.set(k, { name: n.deck, type: n.type });
      if (!lastPlayed.has(k) || n.date > (lastPlayed.get(k) as string)) lastPlayed.set(k, n.date);
    }
    return [...byKey.entries()]
      .sort(([a], [b]) => (lastPlayed.get(b) ?? '').localeCompare(lastPlayed.get(a) ?? ''))
      .map(([, d]) => d);
  }

  let decks = $derived(deckRegistry());

  type MatchResult = 'W' | 'T' | 'L';
  const MATCH_RESULTS: MatchResult[] = ['W', 'T', 'L'];

  interface MatchRow {
    result: MatchResult;
    opponentOpen: boolean;
    opponentName: string;
    opponentDeckId?: string;
    opponentIsNew: boolean;
    opponentNewName: string;
    opponentType: string;
    wentFirst?: boolean;
  }

  function emptyMatchRow(): MatchRow {
    return {
      result: 'W',
      opponentOpen: false,
      opponentName: '',
      opponentDeckId: undefined,
      opponentIsNew: false,
      opponentNewName: '',
      opponentType: 'Colorless',
      wentFirst: undefined
    };
  }

  let date = $state(recentTuesday());
  let deck = $state('');
  let newDeckName = $state('');
  let newDeck = $state(true);
  let type = $state('Psychic');
  let w = $state(0);
  let t = $state(0);
  let l = $state(0);
  let detailed = $state(true);
  let matchRows = $state<MatchRow[]>([]);
  let isLeagueNight = $state(true);
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
      isLeagueNight = editing.isLeagueNight;
      detailed = (editing.matches?.length ?? 0) > 0;
      matchRows =
        editing.matches?.map((m) => ({
          result: m.result,
          opponentOpen: !!m.opponentDeck,
          opponentName: m.opponentDeck ?? '',
          opponentDeckId: m.opponentDeckId,
          opponentIsNew: false,
          opponentNewName: '',
          opponentType: m.opponentType ?? 'Colorless',
          wentFirst: m.wentFirst
        })) ?? [];
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
      isLeagueNight = true;
      detailed = true;
      matchRows = [];
    }
  });

  function toggleDetailed() {
    detailed = !detailed;
  }
  function addMatch() {
    matchRows = [...matchRows, emptyMatchRow()];
  }
  function setMatchResult(i: number, result: MatchResult) {
    matchRows = matchRows.map((r, idx) => (idx === i ? { ...r, result } : r));
  }
  /** Cycles a match's turn order: unrecorded -> went first -> went second -> unrecorded. */
  function cycleWentFirst(i: number) {
    matchRows = matchRows.map((r, idx) => {
      if (idx !== i) return r;
      const next = r.wentFirst === undefined ? true : r.wentFirst === true ? false : undefined;
      return { ...r, wentFirst: next };
    });
  }
  function wentFirstLabel(r: MatchRow): string {
    return r.wentFirst === true ? '1st' : r.wentFirst === false ? '2nd' : '—';
  }
  function removeMatch(i: number) {
    matchRows = matchRows.filter((_, idx) => idx !== i);
  }
  function toggleOpponent(i: number) {
    matchRows = matchRows.map((r, idx) => (idx === i ? { ...r, opponentOpen: !r.opponentOpen } : r));
  }
  function selectOpponent(i: number, d: DeckOption) {
    matchRows = matchRows.map((r, idx) =>
      idx === i
        ? { ...r, opponentOpen: false, opponentIsNew: false, opponentName: d.name, opponentDeckId: d.id, opponentType: d.type }
        : r
    );
  }
  function selectOpponentNew(i: number) {
    matchRows = matchRows.map((r, idx) =>
      idx === i ? { ...r, opponentIsNew: true, opponentName: '', opponentDeckId: undefined } : r
    );
  }
  function clearOpponent(i: number) {
    matchRows = matchRows.map((r, idx) =>
      idx === i
        ? { ...r, opponentOpen: false, opponentIsNew: false, opponentName: '', opponentDeckId: undefined, opponentNewName: '' }
        : r
    );
  }
  function setOpponentNewName(i: number, v: string) {
    matchRows = matchRows.map((r, idx) => (idx === i ? { ...r, opponentNewName: v } : r));
  }
  function setOpponentType(i: number, t: string) {
    matchRows = matchRows.map((r, idx) => (idx === i ? { ...r, opponentType: t } : r));
  }
  function opponentLabel(r: MatchRow): string {
    const name = r.opponentIsNew ? r.opponentNewName : r.opponentName;
    return name ? `vs ${name} ✎` : '+ opponent';
  }

  /** Changing the date re-defaults the night type: Tuesdays are league night, anything else casual. */
  function onDateInput(v: string) {
    date = v > todayISO() ? todayISO() : v;
    isLeagueNight = isTuesday(date);
  }

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

  function resolveOpponent(
    r: MatchRow
  ): { opponentDeckId: string } | { opponentDeck: string; opponentType: string } | Record<string, never> {
    if (!r.opponentIsNew && r.opponentDeckId) return { opponentDeckId: r.opponentDeckId };
    const name = (r.opponentIsNew ? r.opponentNewName : r.opponentName).trim();
    return name ? { opponentDeck: name, opponentType: r.opponentType } : {};
  }

  function resolveWentFirst(r: MatchRow): { wentFirst: boolean } | Record<string, never> {
    return r.wentFirst === undefined ? {} : { wentFirst: r.wentFirst };
  }

  async function save() {
    const finalDeck = (newDeck ? newDeckName.trim() : deck) || 'Untitled deck';
    saving = true;
    try {
      const input = detailed
        ? {
            date: date || recentTuesday(),
            deck: finalDeck,
            type,
            w,
            t,
            l,
            isLeagueNight,
            matches: matchRows.map((r) => ({ result: r.result, ...resolveOpponent(r), ...resolveWentFirst(r) }))
          }
        : { date: date || recentTuesday(), deck: finalDeck, type, w, t, l, isLeagueNight };
      await onSave(input, editing?.id ?? null);
    } finally {
      saving = false;
    }
  }
</script>

<div class="section-title">{editing ? 'Edit night' : 'Log a night'}</div>
<div class="card">
  <div class="form-row">
    <div class="field">
      <label for="fDate">Date</label>
      <input
        id="fDate"
        type="date"
        max={todayISO()}
        value={date}
        oninput={(e) => onDateInput(e.currentTarget.value)}
      />
    </div>
    <div class="field">
      <span class="field-label">Night type</span>
      <div class="nighttype-seg" role="group" aria-label="Night type">
        <button
          type="button"
          class="nighttypebtn"
          aria-pressed={isLeagueNight}
          onclick={() => (isLeagueNight = true)}>League</button
        >
        <button
          type="button"
          class="nighttypebtn"
          aria-pressed={!isLeagueNight}
          onclick={() => (isLeagueNight = false)}>Casual</button
        >
      </div>
    </div>
  </div>

  <DeckPicker
    {decks}
    label="Deck"
    idPrefix="deck"
    selectedName={deck}
    isNew={newDeck}
    newName={newDeckName}
    {type}
    onSelect={selectDeck}
    onSelectNew={selectNewDeck}
    onNewNameInput={(v) => (newDeckName = v)}
    onTypeSelect={(t) => (type = t)}
  />

  <div class="mode-row">
    <span class="field-label">{detailed ? 'Per-match log' : 'Quick record'}</span>
    <button type="button" class="mode-toggle" onclick={toggleDetailed}>
      {detailed ? '↺ Quick mode' : '☰ Log each match'}
    </button>
  </div>

  {#if detailed}
    <div class="matches">
      {#each matchRows as row, i (i)}
        <div class="matchrow" transition:slide={{ duration: 220 }}>
          <span class="rn">R{i + 1}</span>
          <div class="seg" role="group" aria-label="Match {i + 1} result">
            {#each MATCH_RESULTS as r (r)}
              <button
                type="button"
                class="segbtn {r.toLowerCase()}"
                aria-pressed={row.result === r}
                onclick={() => setMatchResult(i, r)}>{r}</button
              >
            {/each}
          </div>
          <button
            type="button"
            class="orderbtn"
            class:set={row.wentFirst !== undefined}
            aria-label="Match {i + 1} turn order: {row.wentFirst === true
              ? 'went first'
              : row.wentFirst === false
                ? 'went second'
                : 'not recorded'}, tap to change"
            onclick={() => cycleWentFirst(i)}>{wentFirstLabel(row)}</button
          >
          <button
            type="button"
            class="oppbtn"
            aria-expanded={row.opponentOpen}
            onclick={() => toggleOpponent(i)}>{opponentLabel(row)}</button
          >
          <button type="button" class="rmbtn" aria-label="Remove match {i + 1}" onclick={() => removeMatch(i)}
            >✕</button
          >
        </div>
        {#if row.opponentOpen}
          <div class="opponent" transition:slide={{ duration: 320 }}>
            <DeckPicker
              decks={opponentDecks}
              searchable
              label="Opponent's deck (optional)"
              idPrefix="match{i}opp"
              selectedName={row.opponentName}
              selectedId={row.opponentDeckId}
              isNew={row.opponentIsNew}
              newName={row.opponentNewName}
              type={row.opponentType}
              clearable
              onSelect={(d) => selectOpponent(i, d)}
              onSelectNew={() => selectOpponentNew(i)}
              onClear={() => clearOpponent(i)}
              onNewNameInput={(v) => setOpponentNewName(i, v)}
              onTypeSelect={(t) => setOpponentType(i, t)}
            />
          </div>
        {/if}
      {/each}
      <button type="button" class="addmatch" onclick={addMatch}>+ Add match</button>
    </div>
  {:else}
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
  {/if}

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
  .nighttype-seg {
    display: flex;
    height: 44px;
    border: 1px solid var(--line);
    border-radius: 9px;
    overflow: hidden;
  }
  .nighttypebtn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-right: 1px solid var(--line);
    background: var(--ink);
    color: var(--muted);
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  }
  .nighttypebtn:last-child {
    border-right: none;
  }
  .nighttypebtn[aria-pressed='true'] {
    background: var(--panel2);
    color: var(--gold);
  }
  .nighttypebtn:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: -2px;
  }
  .mode-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 9px;
  }
  .mode-toggle {
    background: transparent;
    border: 1px solid var(--line);
    color: var(--muted);
    border-radius: 20px;
    padding: 6px 12px;
    font-size: 11.5px;
    cursor: pointer;
    font-family: inherit;
  }
  .mode-toggle:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 2px;
  }
  .matches {
    margin-bottom: 13px;
  }
  .matchrow {
    display: flex;
    align-items: center;
    gap: 9px;
    margin-bottom: 7px;
  }
  .matchrow .rn {
    font-size: 11px;
    color: var(--muted);
    width: 24px;
    flex: 0 0 auto;
  }
  .seg {
    display: flex;
    flex: 1;
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
  }
  .segbtn {
    flex: 1;
    border: none;
    border-right: 1px solid var(--line);
    background: var(--ink);
    color: var(--muted);
    padding: 8px 0;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    font-family: var(--display);
  }
  .segbtn:last-child {
    border-right: none;
  }
  .segbtn:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: -2px;
  }
  .segbtn.w[aria-pressed='true'] {
    background: var(--win);
    color: #08110a;
  }
  .segbtn.t[aria-pressed='true'] {
    background: var(--tie);
    color: #191104;
  }
  .segbtn.l[aria-pressed='true'] {
    background: var(--loss);
    color: #fff;
  }
  .rmbtn {
    flex: 0 0 auto;
    width: 28px;
    height: 28px;
    border-radius: 7px;
    border: 1px solid var(--line);
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    font-size: 12px;
  }
  .rmbtn:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 2px;
  }
  .orderbtn {
    flex: 0 0 auto;
    width: 34px;
    height: 28px;
    border-radius: 7px;
    border: 1px dashed var(--line);
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    font-size: 10.5px;
    font-weight: 700;
    font-family: var(--display);
  }
  .orderbtn.set {
    border-style: solid;
    color: var(--text);
  }
  .orderbtn:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 2px;
  }
  .oppbtn {
    flex: 0 0 auto;
    max-width: 40%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    border-radius: 7px;
    border: 1px dashed var(--line);
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    font-size: 11px;
    padding: 7px 9px;
    font-family: inherit;
  }
  .oppbtn[aria-expanded='true'] {
    border-style: solid;
    color: var(--text);
  }
  .oppbtn:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 2px;
  }
  .opponent {
    margin: -2px 0 11px 33px;
  }
  .addmatch {
    width: 100%;
    border: 1px dashed var(--line);
    background: transparent;
    color: var(--muted);
    border-radius: 8px;
    padding: 9px;
    font-size: 12.5px;
    cursor: pointer;
    font-family: inherit;
    margin-top: 2px;
  }
  .addmatch:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 2px;
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
    color: var(--win-text);
  }
  .stepper.t .lab {
    color: var(--tie-text);
  }
  .stepper.l .lab {
    color: var(--loss-text);
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

  @media (max-width: 440px) {
    .form-row {
      flex-direction: column;
    }
    .nighttype-seg {
      height: 48px;
    }
    .nighttypebtn {
      font-size: 13.5px;
    }
  }
</style>
