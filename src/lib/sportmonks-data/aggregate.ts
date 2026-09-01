import type { PlayerMatchRating } from "./types";

/** Rounds to 2 decimals, matching the ratings' own precision (e.g. 6.94). `null` only for an empty input — never a fabricated 0. */
export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 100) / 100;
}

/**
 * Given ratings already sorted most-recent-first, keeps only the most
 * recent `n` and averages them — the "last N appearances" signal used
 * throughout (player-profile "Last 5 Average", the homepage widget's
 * ranking, `sportmonks_top_rated_players` in db/schema.sql mirrors this
 * same recency-then-cap logic server-side for the aggregate widget).
 */
export function lastNAverage(ratingsMostRecentFirst: PlayerMatchRating[], n = 5): { recent: PlayerMatchRating[]; average: number | null } {
  const recent = ratingsMostRecentFirst.slice(0, n);
  return { recent, average: average(recent.map((r) => r.rating)) };
}
