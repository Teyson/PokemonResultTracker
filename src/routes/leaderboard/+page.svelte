<script lang="ts">
  import { getContext } from 'svelte';
  import type { ClientPrincipal, LeaderboardEntry, Night, Season } from '$lib/types';
  import { avatarUrl } from '$lib/auth';
  import { api } from '$lib/api';
  import { toast } from '$lib/toast.svelte';
  import { pts, games, ppg, scorePct, currentSeasonId, startedSeasons, todayISO, rankLeaderboard } from '$lib/pokemon';
  import PokeBall from '$lib/components/PokeBall.svelte';
  import Toast from '$lib/components/Toast.svelte';
  import Masthead from '$lib/components/Masthead.svelte';
  import SeasonSwitcher from '$lib/components/SeasonSwitcher.svelte';
  import SeasonProgress from '$lib/components/SeasonProgress.svelte';
  import SeasonAwards from '$lib/components/SeasonAwards.svelte';
  import SeasonRecap from '$lib/components/SeasonRecap.svelte';
  import HallOfFame from '$lib/components/HallOfFame.svelte';

  const auth = getContext<{ principal: ClientPrincipal | null; loading: boolean; isMember: boolean; isAdmin: boolean }>(
    'auth'
  );
  let isMember = $derived(auth.isMember);
  let isAdmin = $derived(auth.isAdmin);

  let entries = $state<LeaderboardEntry[]>([]);
  let loaded = $state(false);

  let seasonsList = $state<Season[]>([]);
  let seasonsLoaded = $state(false);
  let selectedSeasonId = $state<string | 'all'>('all');
  let seasonDefaulted = $state(false);

  // The viewing member's own nights — needed only for the personal half of
  // Season awards (best deck / biggest night); the standings themselves stay
  // server-aggregated for privacy, this is always-already-yours data.
  let myNights = $state<Night[]>([]);
  let myNightsLoaded = $state(false);

  // One leaderboard fetch per ended season, resolved once seasons are known —
  // small at this league's scale (a handful of seasons a year).
  let hallOfFame = $state<{ season: Season; champion: LeaderboardEntry | null }[]>([]);
  let hallOfFameLoaded = $state(false);

  $effect(() => {
    if (isMember && !loaded) reload('all');
    if (isMember && !seasonsLoaded) loadSeasons();
    if (isMember && !myNightsLoaded) loadMyNights();
  });

  $effect(() => {
    if (seasonsLoaded && !hallOfFameLoaded) loadHallOfFame();
  });

  // Auto-select the current season only once, the first time seasons finish
  // loading, mirroring the main page's switcher default — then re-fetch the
  // leaderboard scoped to it (the 'all' load above already covered the
  // no-current-season case, so this only reloads when a season is found).
  $effect(() => {
    if (seasonsLoaded && !seasonDefaulted) {
      seasonDefaulted = true;
      const id = currentSeasonId(seasonsList, todayISO());
      if (id) {
        selectedSeasonId = id;
        reload(id);
      }
    }
  });

  let selectedSeason = $derived(seasonsList.find((s) => s.id === selectedSeasonId) ?? null);
  // The switcher only offers seasons that have started — a not-yet-started
  // season has no standings to show and would just be confusing to pick.
  let switcherSeasons = $derived(startedSeasons(seasonsList, todayISO()));

  async function loadSeasons() {
    try {
      seasonsList = (await api<Season[]>('/api/seasons')) ?? [];
      seasonsLoaded = true;
    } catch (e) {
      toast(`Could not load seasons: ${(e as Error).message}`, true);
    }
  }

  async function loadMyNights() {
    try {
      myNights = (await api<Night[]>('/api/nights')) ?? [];
      myNightsLoaded = true;
    } catch (e) {
      toast(`Could not load your nights: ${(e as Error).message}`, true);
    }
  }

  // Failures here are per-season and non-fatal — a past season's standings
  // being briefly unreachable shouldn't block the whole page or retry forever.
  async function loadHallOfFame() {
    hallOfFameLoaded = true;
    const today = todayISO();
    const ended = seasonsList.filter((s) => s.endsOn && s.endsOn < today);
    if (ended.length === 0) return;
    try {
      hallOfFame = await Promise.all(
        ended.map(async (season) => {
          const seasonEntries = (await api<LeaderboardEntry[]>(`/api/leaderboard?seasonId=${encodeURIComponent(season.id)}`)) ?? [];
          return { season, champion: rankLeaderboard(seasonEntries)[0] ?? null };
        })
      );
    } catch (e) {
      toast(`Could not load the hall of fame: ${(e as Error).message}`, true);
    }
  }

  function pickSeason(id: string | 'all') {
    selectedSeasonId = id;
    reload(id);
  }

  // seasonId is passed explicitly (rather than read from selectedSeasonId)
  // so callers control exactly which scope a given fetch requests, since
  // this runs both from effects and direct user picks.
  async function reload(seasonId: string | 'all') {
    try {
      const query = seasonId !== 'all' ? `?seasonId=${encodeURIComponent(seasonId)}` : '';
      entries = (await api<LeaderboardEntry[]>(`/api/leaderboard${query}`)) ?? [];
      loaded = true;
    } catch (e) {
      toast(`Could not load the leaderboard: ${(e as Error).message}`, true);
    }
  }

  function playerAvatarUrl(login: string): string {
    return `https://github.com/${encodeURIComponent(login)}.png?size=60`;
  }

  let ranked = $derived(rankLeaderboard(entries));
  let isEndedSeason = $derived(
    selectedSeason !== null && selectedSeason.endsOn !== null && selectedSeason.endsOn < todayISO()
  );
</script>

<svelte:head>
  <title>Pokémon Result Tracker · Leaderboard</title>
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
      <Masthead {isAdmin} principal={auth.principal} />
      <h2>League leaderboard</h2>
      <div class="sub">
        Standings for league nights only — casual nights don't count here. Ranked by points, ties broken by fewer
        games played.
      </div>

      {#if seasonsList.length > 0}
        <div class="season-bar">
          <SeasonSwitcher seasons={switcherSeasons} {selectedSeasonId} onSelect={pickSeason} />
        </div>
        <SeasonProgress seasons={seasonsList} {selectedSeason} />
      {/if}

      {#if selectedSeasonId === 'all'}
        <HallOfFame entries={hallOfFame} />
      {/if}

      {#if selectedSeason && isEndedSeason && loaded && myNightsLoaded}
        <SeasonAwards season={selectedSeason} entries={ranked} nights={myNights} myLogin={auth.principal.userDetails} />
        <SeasonRecap season={selectedSeason} entries={ranked} />
      {/if}

      {#if !loaded}
        <div class="empty">Loading…</div>
      {:else if ranked.length === 0}
        <div class="empty">No league nights logged yet.</div>
      {:else}
        <div class="ltable-scroll">
          <div class="ltable">
            <div class="lrow head">
              <span>#</span><span>Player</span><span>Record</span><span>Games</span><span>Pts</span><span>PPG</span
              ><span>Score%</span>
            </div>
            {#each ranked as e, i (e.login)}
              {@const g = games(e)}
              {@const p = pts(e)}
              {@const pct = scorePct(e)}
              <div class="lrow">
                <span class="rank" class:gold={i === 0}>{i + 1}</span>
                <span class="player">
                  <img class="av" alt="" src={playerAvatarUrl(e.login)} />
                  <span class="login">{e.login}</span>
                </span>
                <span class="mono">{e.w}-{e.t}-{e.l}</span>
                <span class="mono">{g}</span>
                <span class="mono">{p}</span>
                <span class="mono gold">{ppg(e).toFixed(2)}</span>
                <span class="mono">{pct !== null ? `${pct}%` : '—'}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
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
  .sub {
    color: var(--muted);
    font-size: 12.5px;
    margin-bottom: 20px;
    line-height: 1.5;
  }
  .season-bar {
    margin-bottom: 10px;
  }
  .ltable-scroll {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
  }
  .ltable {
    min-width: 540px;
  }
  .lrow {
    display: grid;
    grid-template-columns: 30px 1fr 80px 60px 52px 60px 64px;
    gap: 10px;
    align-items: center;
    padding: 10px 13px;
    border-bottom: 1px solid var(--line);
    font-size: 12.5px;
  }
  .lrow:last-child {
    border-bottom: none;
  }
  .lrow.head {
    background: rgba(0, 0, 0, 0.2);
  }
  .lrow.head span {
    font-size: 9.5px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .lrow.head span:not(:nth-child(2)) {
    text-align: right;
  }
  .rank {
    font-family: var(--display);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }
  .rank.gold {
    color: var(--gold);
  }
  .player {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .player .av {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--panel2);
    flex: 0 0 auto;
    object-fit: cover;
  }
  .player .login {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mono {
    font-family: var(--display);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  .mono.gold {
    color: var(--gold);
  }
  .empty {
    color: var(--muted);
    font-size: 13px;
    text-align: center;
    padding: 18px;
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
