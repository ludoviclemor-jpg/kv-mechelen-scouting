import { computePlayerMetrics, computeDataCompleteness } from "./preprocessing.mjs";
import { winsorize, percentileRank, shrinkTowardAverage } from "./normalization.mjs";
import { calibrateToCompetition } from "./competitionStrength.mjs";
import { METRIC_REGISTRY } from "./config/metricRegistry.mjs";
import { RELIABILITY_CONSTANT, RATE_RELIABILITY_CONSTANT, WINSORIZE_LOW_PERCENTILE, WINSORIZE_HIGH_PERCENTILE, CURRENT_LEVEL_BANDS } from "./config/scoringConfig.mjs";

export function currentLevelBand(score) {
  return CURRENT_LEVEL_BANDS.find((b) => score >= b.min)?.label ?? CURRENT_LEVEL_BANDS[CURRENT_LEVEL_BANDS.length - 1].label;
}

/**
 * CurrentLevelScorer (Step 4). Implements the spec's preferred process
 * exactly, in order: per-90 (preprocessing.mjs, called by the caller
 * before this), clip -> percentile rank -> reverse-for-lower-is-better
 * -> weighted pillar scores -> reliability shrinkage -> competition
 * calibration -> final 0-100 score.
 *
 * Pillar-level weighting: every *available* pillar for a position group
 * (positionPillars.mjs) is weighted equally at the top level — a
 * deliberate, documented design choice (not a limitation): assigning
 * bespoke pillar-level weights on top of the already-approximate metric-
 * level weights inside each pillar would be a second layer of invented
 * parameters with no stronger evidence behind it than "equal" has. A
 * pillar unavailable for this position doesn't count toward the
 * denominator, so a position missing several pillars (see
 * positionPillars.mjs's real coverage gaps) is scored fairly on what it
 * does have, not penalized for what Impect doesn't measure yet.
 */
export function scoreCurrentLevel({ player, positionGroupConfig, cohort, competitionName }) {
  const playerMetrics = computePlayerMetrics(player);
  const cohortMetrics = cohort.map((c) => computePlayerMetrics(c));

  const availablePillars = positionGroupConfig.pillars.filter((p) => p.available);
  const usedMetricKeys = [...new Set(availablePillars.flatMap((p) => p.metrics.map((m) => m.metric)))];
  const dataCompleteness = computeDataCompleteness(playerMetrics, usedMetricKeys);

  const pillarResults = [];

  for (const pillarDef of availablePillars) {
    const metricResults = [];

    for (const { metric, weight } of pillarDef.metrics) {
      const playerValue = playerMetrics[metric];
      if (playerValue === null || playerValue === undefined) continue; // this player has no value for this metric — skip it, don't fabricate a score

      const cohortValues = cohortMetrics.map((m) => m[metric]).filter((v) => v !== null && v !== undefined);
      if (cohortValues.length === 0) continue; // no comparable peers for this metric either — can't rank it

      const registryEntry = METRIC_REGISTRY[metric];
      const clipped = winsorize(playerValue, cohortValues, WINSORIZE_LOW_PERCENTILE, WINSORIZE_HIGH_PERCENTILE);
      const rawPercentile = percentileRank(clipped, cohortValues, !registryEntry.higherIsBetter);
      // A rate metric (duel win %) is shrunk by its own real attempt
      // count, not minutes played — see metricRegistry.mjs's
      // `attemptsKey` and RATE_RELIABILITY_CONSTANT's header for why.
      // Falls back to the minutes-based sample size if attempts
      // genuinely aren't available (e.g. matchShare missing) rather
      // than skipping the metric outright.
      const attempts = registryEntry.attemptsKey ? playerMetrics[registryEntry.attemptsKey] : null;
      const { adjusted, reliability } =
        attempts !== null && attempts !== undefined
          ? shrinkTowardAverage(rawPercentile, attempts, RATE_RELIABILITY_CONSTANT)
          : shrinkTowardAverage(rawPercentile, player.minutes, RELIABILITY_CONSTANT);

      metricResults.push({ metric, weight, rawPercentile, adjustedScore: adjusted, reliability });
    }

    if (metricResults.length === 0) {
      pillarResults.push({ key: pillarDef.key, label: pillarDef.label, domain: pillarDef.domain, available: false, score: null, percentile: null, reliability: null, weight: null });
      continue;
    }

    const weightSum = metricResults.reduce((sum, m) => sum + m.weight, 0);
    const pillarScore = metricResults.reduce((sum, m) => sum + (m.adjustedScore * m.weight) / weightSum, 0);
    const pillarPercentile = metricResults.reduce((sum, m) => sum + (m.rawPercentile * m.weight) / weightSum, 0);
    const pillarReliability = metricResults.reduce((sum, m) => sum + (m.reliability * m.weight) / weightSum, 0);

    pillarResults.push({
      key: pillarDef.key,
      label: pillarDef.label,
      domain: pillarDef.domain,
      available: true,
      score: Math.round(pillarScore * 10) / 10,
      percentile: Math.round(pillarPercentile),
      reliability: Math.round(pillarReliability * 100) / 100,
      weight: null, // filled in below once the top-level weight (equal split across available pillars) is known
    });
  }

  const scoredPillars = pillarResults.filter((p) => p.available);
  const topLevelWeight = scoredPillars.length > 0 ? 1 / scoredPillars.length : 0;
  for (const p of pillarResults) if (p.available) p.weight = Math.round(topLevelWeight * 1000) / 1000;

  const rawOverall = scoredPillars.length > 0 ? scoredPillars.reduce((sum, p) => sum + p.score * topLevelWeight, 0) : 50;
  const overallPercentile = scoredPillars.length > 0 ? Math.round(scoredPillars.reduce((sum, p) => sum + p.percentile * topLevelWeight, 0)) : null;

  const { calibrated, strength } = calibrateToCompetition(rawOverall, competitionName);
  const currentLevel = Math.round(calibrated * 10) / 10;

  return {
    currentLevel,
    band: currentLevelBand(currentLevel),
    rawScore: Math.round(rawOverall * 10) / 10,
    overallPercentile,
    pillars: pillarResults,
    dataCompleteness,
    competitionAdjustment: strength,
  };
}
