/**
 * Pure extraction of per-player rating rows from a raw Sportmonks fixture
 * detail object (as returned by sportmonksClient.mjs's
 * fetchFixtureWithLineups — `include=lineups.details.type;participants`).
 * No network calls, no DB access — kept separate so it's directly unit
 * testable against a real captured response shape. See
 * docs/SPORTMONKS_INTEGRATION.md for the confirmed field meanings.
 */

const RATING_TYPE_ID = 118; // "Rating" — confirmed via /core/types
const MINUTES_PLAYED_TYPE_ID = 119; // "Minutes Played" — confirmed via /core/types
const STARTER_TYPE_ID = 11; // "Lineup" — confirmed via /core/types
const SUBSTITUTE_TYPE_ID = 12; // "Bench" — confirmed via /core/types

/**
 * @param {object} fixture - raw fixture object with lineups[]/participants[]
 * @param {string|null} competitionName - our own display name for the league (not a Sportmonks field)
 * @returns {object[]} one row per player who has a real rating for this fixture — a lineup entry with no rating detail (unused substitute) is real, not a gap, and is simply not included, never fabricated as 0
 */
export function extractRatingRows(fixture, competitionName = null) {
  if (!fixture || typeof fixture !== "object") return [];
  const participants = Array.isArray(fixture.participants) ? fixture.participants : [];
  const home = participants.find((p) => p?.meta?.location === "home") ?? null;
  const away = participants.find((p) => p?.meta?.location === "away") ?? null;
  const matchDate = typeof fixture.starting_at === "string" ? fixture.starting_at.slice(0, 10) : null;
  const fixtureId = fixture.id !== undefined && fixture.id !== null ? String(fixture.id) : null;
  if (!fixtureId || !matchDate) return []; // can't build a valid row without these — never guess a fixture id or date

  const rows = [];
  for (const lineup of Array.isArray(fixture.lineups) ? fixture.lineups : []) {
    if (!lineup || typeof lineup !== "object") continue;
    if (lineup.player_id === undefined || lineup.player_id === null) continue;

    const details = Array.isArray(lineup.details) ? lineup.details : [];
    const ratingDetail = details.find((d) => d?.type_id === RATING_TYPE_ID);
    const ratingValue = ratingDetail?.data?.value;
    if (typeof ratingValue !== "number" || !Number.isFinite(ratingValue)) continue; // no real rating for this player in this match

    const minutesDetail = details.find((d) => d?.type_id === MINUTES_PLAYED_TYPE_ID);
    const minutesValue = minutesDetail?.data?.value;

    const isHome = home !== null && lineup.team_id === home.id;
    const isAway = away !== null && lineup.team_id === away.id;
    if (!isHome && !isAway) continue; // lineup entry doesn't match either participant — shouldn't happen on real data, skip rather than guess home/away

    rows.push({
      externalPlayerId: String(lineup.player_id),
      playerName: typeof lineup.player_name === "string" ? lineup.player_name : null,
      externalTeamId: lineup.team_id !== undefined && lineup.team_id !== null ? String(lineup.team_id) : null,
      teamName: isHome ? home?.name ?? null : away?.name ?? null,
      opponent: isHome ? away?.name ?? null : home?.name ?? null,
      homeAway: isHome ? "home" : "away",
      starter: lineup.type_id === STARTER_TYPE_ID ? true : lineup.type_id === SUBSTITUTE_TYPE_ID ? false : null,
      minutesPlayed: typeof minutesValue === "number" && Number.isFinite(minutesValue) ? minutesValue : null,
      rating: ratingValue,
      fixtureId,
      competitionId: fixture.league_id !== undefined && fixture.league_id !== null ? String(fixture.league_id) : null,
      competitionName,
      seasonId: fixture.season_id !== undefined && fixture.season_id !== null ? String(fixture.season_id) : null,
      matchDate,
    });
  }
  return rows;
}
