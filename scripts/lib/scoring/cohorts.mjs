import { MIN_COHORT_SIZE } from "./config/scoringConfig.mjs";

/**
 * Builds the comparison cohort for one player (Step 3) using the
 * documented fallback hierarchy, narrowest first:
 *   1. position group + same competition (iteration)
 *   2. position group + same competition-strength tier (across every
 *      currently-synced competition sharing that tier)
 *   3. position group across every currently-synced competition
 * Level 2 needs each candidate's own competition's tier — passed in via
 * `competitionTierByIterationId` rather than looked up here, so this
 * module stays free of scoring-config-specific competition-strength
 * knowledge.
 *
 * `pool` is every candidate row already restricted to the same broad
 * position group and minutes >= MIN_MINUTES_FOR_RATING (the caller does
 * that once, cheaply, before calling this per player) — role-level
 * narrowing (Step 3's "specific role when enough data exists") isn't
 * implemented yet: this project doesn't yet classify a distinct "role"
 * within a position group (e.g. "ball-playing CB" vs "stopper CB"),
 * only the broad position group itself (see
 * scripts/lib/scoring/config/positionPillars.mjs's own groups) — a real,
 * disclosed limitation, not a silent skip; `role` in the returned rating
 * is set to the position group name until real role classification
 * exists.
 */
export function buildCohort({ player, pool, competitionTierByIterationId }) {
  const samePlayerId = player.playerId;

  const sameCompetition = pool.filter((p) => p.playerId !== samePlayerId && p.iterationId === player.iterationId);
  if (sameCompetition.length >= MIN_COHORT_SIZE) {
    return { cohort: sameCompetition, level: "position+competition+season", fallbackUsed: false };
  }

  const playerTier = competitionTierByIterationId.get(player.iterationId) ?? "unknown";
  const sameTier = pool.filter(
    (p) => p.playerId !== samePlayerId && (competitionTierByIterationId.get(p.iterationId) ?? "unknown") === playerTier
  );
  if (sameTier.length >= MIN_COHORT_SIZE) {
    return { cohort: sameTier, level: "position+competition_tier+season", fallbackUsed: true };
  }

  const allPositionGroup = pool.filter((p) => p.playerId !== samePlayerId);
  return { cohort: allPositionGroup, level: "position_group_all_synced_competitions", fallbackUsed: true };
}
