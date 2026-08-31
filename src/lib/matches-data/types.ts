/**
 * Match data, sourced entirely from SCOUTASTIC (GET /matches — see
 * docs/EXPLORE.md for the confirmed real response shape). SofaScore
 * supplies only the per-match player rating slot, when a real provider
 * exists (none does today — see docs/SOFASCORE_PROVIDER.md); everything
 * else (lineups, formations, events, venue) is SCOUTASTIC's own data.
 */

export interface MatchLineupPlayer {
  id: string; // SCOUTASTIC player id (matches players.scoutastic_player_id)
  firstName: string | null;
  lastName: string | null;
  mainPosition: string | null; // raw SCOUTASTIC position code, e.g. "centerback" — map via positionMap.json for display
  lineUpIdx: number | null; // pitch position order, 1-11 for starters; null for bench
  inLineup: boolean; // true = started, false = substitute (used or unused)
  minutesPlayed: number;
  goals: number;
  assists: number;
  shirtNumber: number | null;
  captain: boolean;
}

export interface MatchEvent {
  eventId: number;
  type: string; // "goal" | "assist" | "penaltyGoal" | "substituteIn" | "substituteOut" | "yellowCard" | "redCard" | ... (not an exhaustive enum — SCOUTASTIC's own value, shown as-is)
  reason: string | null;
  gameMinute: number;
  extraMinutes: number;
  playerId: string | null;
  firstName: string | null;
  lastName: string | null;
  shirtNumber: number | null;
  position: string | null;
  teamId: string | null;
}

export interface Match {
  id: string; // SCOUTASTIC's transfermarktId
  competitionId: string | null;
  season: string | null;
  matchday: number | null;
  date: string | null; // ISO datetime, kickoff
  status: string | null; // real observed values: "played", "open" — not an exhaustive enum
  score: string | null;
  scoreHome: number | null;
  scoreAway: number | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  homeTeamTactic: string | null; // e.g. "4-2-3-1" — not always present
  awayTeamTactic: string | null;
  venueName: string | null;
  venueCity: string | null;
  venueArea: string | null;
  refereeName: string | null;
  homeTeamPlayers: MatchLineupPlayer[];
  awayTeamPlayers: MatchLineupPlayer[];
  events: MatchEvent[];
  createdAt: string;
  updatedAt: string;
  lastScoutasticSyncAt: string | null;
}

/** A match summary joined with its competition's country/name — what the Explore list actually needs, without the heavy lineup/events payload. */
export interface MatchSummary {
  id: string;
  competitionId: string | null;
  competitionName: string | null;
  competitionArea: string | null;
  date: string | null;
  status: string | null;
  score: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
}
