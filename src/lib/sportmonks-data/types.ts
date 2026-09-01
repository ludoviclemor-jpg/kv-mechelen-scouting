/**
 * TEST integration — Danish Superliga + Scottish Premiership only, see
 * docs/SPORTMONKS_INTEGRATION.md. Ratings come from `player_match_ratings`
 * (populated by scripts/sync-sportmonks-ratings.mjs), never from a live
 * Sportmonks call — this module only ever reads Postgres.
 */

export interface PlayerMatchRating {
  fixtureId: string;
  competitionId: string | null;
  competitionName: string | null;
  seasonId: string | null;
  matchDate: string; // ISO date
  opponent: string | null;
  homeAway: "home" | "away" | null;
  minutesPlayed: number | null;
  starter: boolean | null;
  rating: number; // 0-10, exactly as Sportmonks returns it
}

export interface PlayerRecentPerformance {
  ratings: PlayerMatchRating[]; // most recent first, capped at 5
  last5Average: number | null; // null only when ratings is empty
  seasonAverage: number | null; // avg over every synced rating in the most recent row's season — null when season_id is unknown or there's nothing to average ("if available", per spec)
}

export interface TopRatedPlayer {
  playerId: string;
  playerName: string;
  club: string | null;
  competitionId: string | null;
  competitionName: string | null;
  avgRating: number;
  ratedMatches: number;
}

export interface TopRatedPlayersParams {
  competitionIds?: string[]; // Sportmonks league ids, e.g. ["271", "501"] — filters to a subset of SPORTMONKS_LEAGUES
  minAvgRating?: number; // 6.0–9.0 per spec
  minAppearances?: number; // 1–5 per spec
  limit?: number;
}
