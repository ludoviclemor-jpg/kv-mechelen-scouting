/**
 * TEST-scope leagues, frontend side — mirrors scripts/lib/sportmonksLeagues.mjs
 * (the sync script's own config). Kept as a small, explicit array for the
 * same reason as the sync side: adding a league later (once the
 * Sportmonks plan is upgraded) is a one-entry addition here, not a
 * redesign. `id` is Sportmonks' own league id, matching
 * `player_match_ratings.competition_id` exactly (a different id space
 * from `scoutastic_competitions.competition_id` — never conflated).
 */
export const SPORTMONKS_LEAGUE_FILTERS: { id: string; name: string }[] = [
  { id: "271", name: "Danish Superliga" },
  { id: "501", name: "Scottish Premiership" },
];

export const RATING_SCALE_MAX = 10;

export function ratingTier(rating: number): "excellent" | "very-good" | "good" | "average" | "poor" {
  if (rating >= 8.0) return "excellent";
  if (rating >= 7.5) return "very-good";
  if (rating >= 7.0) return "good";
  if (rating >= 6.5) return "average";
  return "poor";
}
