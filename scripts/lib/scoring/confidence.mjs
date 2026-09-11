import { MIN_COHORT_SIZE, CONFIDENCE_BANDS } from "./config/scoringConfig.mjs";

const WEIGHTS = {
  reliability: 0.35, // minutes-based sample reliability (normalization.mjs's shrinkage reliability)
  dataCompleteness: 0.25,
  cohortSize: 0.2,
  competitionKnown: 0.1,
  positionalCertainty: 0.1,
};

export function confidenceLabel(score) {
  return CONFIDENCE_BANDS.find((b) => score >= b.min)?.label ?? CONFIDENCE_BANDS[CONFIDENCE_BANDS.length - 1].label;
}

/**
 * ConfidenceScorer (Step 6) — kept fully separate from Current Level /
 * Potential themselves, per the spec ("The confidence score must remain
 * separate from Current Level and Potential"). Missing information
 * reduces confidence and (via currentLevel.mjs's own shrinkage) pulls
 * the rating toward a conservative baseline — it never independently
 * labels the player as poor on its own.
 *
 * Real, disclosed limitations (not incorporated, since this project has
 * no real data source for them yet — never faked):
 *   - "consistency of data across matches" would need match-level
 *     variance, which isn't synced (only season-aggregate player-kpis).
 *   - "number of seasons" is always 1 today (see potential.mjs's header).
 */
export function scoreConfidence({ reliability, dataCompleteness, cohortSize, competitionKnown, hasPosition, fallbackUsed }) {
  const reliabilityScore = reliability * 100;
  const dataCompletenessScore = dataCompleteness;
  const cohortSizeScore = Math.min(100, (cohortSize / (MIN_COHORT_SIZE * 3)) * 100);
  const competitionKnownScore = competitionKnown ? 100 : 40;
  const positionalCertaintyScore = hasPosition ? 100 : 30;

  let score =
    reliabilityScore * WEIGHTS.reliability +
    dataCompletenessScore * WEIGHTS.dataCompleteness +
    cohortSizeScore * WEIGHTS.cohortSize +
    competitionKnownScore * WEIGHTS.competitionKnown +
    positionalCertaintyScore * WEIGHTS.positionalCertainty;

  if (fallbackUsed) score -= 8; // a broadened cohort is a real, if modest, extra source of uncertainty

  score = Math.round(Math.min(100, Math.max(0, score)));

  const reasons = [];
  if (reliabilityScore < 60) reasons.push("Limited minutes played — the rating leans toward the cohort average.");
  if (dataCompletenessScore < 70) reasons.push("Several pillar metrics aren't available for this player yet.");
  if (cohortSizeScore < 60) reasons.push("The comparison cohort is smaller than ideal.");
  if (!competitionKnown) reasons.push("This competition's strength is a provisional default, not a configured value.");
  if (!hasPosition) reasons.push("Position wasn't confirmed by Impect for this record.");
  if (fallbackUsed) reasons.push("A broadened cohort fallback was used (see context.cohort_level).");

  return { score, label: confidenceLabel(score), reasons };
}
