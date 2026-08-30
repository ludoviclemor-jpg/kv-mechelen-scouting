import { MINIMUM_RATED_MATCHES } from "./constants";
import type { MatchRating, PlayerMatchStats } from "./types";

/**
 * Derives rating stats from raw match rows. This is the exact shape a
 * SofaScore-backed match feed will produce, so this function keeps
 * working unchanged once demo `matches` arrays are replaced by API data.
 */
export function computeMatchStats(matches: MatchRating[]): PlayerMatchStats {
  const rated = matches.filter((m) => m.rating !== null) as (MatchRating & {
    rating: number;
  })[];

  if (rated.length === 0) {
    return {
      average: null,
      latest: null,
      highest: null,
      lowest: null,
      averageMinutes: null,
      matchesUsed: 0,
    };
  }

  const last5 = rated.slice(0, 5);
  const ratings = last5.map((m) => m.rating);
  const minutes = last5.map((m) => m.minutes);

  return {
    average:
      Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100) /
      100,
    latest: rated[0].rating,
    highest: Math.max(...ratings),
    lowest: Math.min(...ratings),
    averageMinutes: Math.round(
      minutes.reduce((a, b) => a + b, 0) / minutes.length
    ),
    matchesUsed: last5.length,
  };
}

export function meetsMinimumMatches(matches: MatchRating[]): boolean {
  return (
    matches.filter((m) => m.rating !== null).length >= MINIMUM_RATED_MATCHES
  );
}

/** Oldest-to-newest rating series for trend charts. */
export function ratingTrendSeries(matches: MatchRating[]) {
  return [...matches]
    .filter((m) => m.rating !== null)
    .reverse()
    .map((m) => ({ date: m.date, rating: m.rating as number }));
}
