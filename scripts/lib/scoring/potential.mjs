import { DEVELOPMENT_CURVES, DEVELOPMENT_CURVE_START_AGE } from "./config/scoringConfig.mjs";

/**
 * PotentialScorer (Step 5). Real inputs only: Current Level, exact age,
 * a position-specific (provisional, configured) development curve, and
 * this rating's own data reliability/completeness — never a fixed
 * "+8 points" bonus.
 *
 * Honest scope limitation (2026-09-11): this project has only ever
 * synced one season per competition so far (see
 * scripts/sync-impect-player-kpis.mjs — no multi-season history exists
 * yet to measure a real trajectory). The spec's season-on-season
 * trajectory analysis therefore can't run for real data today; this
 * function implements exactly the spec's own fallback for that case
 * ("If only one season or a small sample is available: reduce
 * confidence, apply stronger regression toward a conservative
 * projection") rather than fabricating a trend from a single point.
 * `hasMultiSeasonData` is wired through so the richer path can be added
 * later without changing this function's contract.
 */
export function scorePotential({ currentLevel, age, positionGroup, avgReliability, dataCompleteness, hasMultiSeasonData = false }) {
  const curve = DEVELOPMENT_CURVES[positionGroup];
  if (!curve || age === null) {
    // No age on file, or no curve for this position — can't project upside responsibly. Potential == Current Level, not a guess.
    return {
      potential: currentLevel,
      range: { low: currentLevel, high: currentLevel },
      ageUpsideApplied: 0,
      curveUsed: null,
      reason: age === null ? "no_birthdate" : "no_development_curve_for_position",
    };
  }

  const ageFraction = clamp01((curve.peakAge - age) / (curve.peakAge - DEVELOPMENT_CURVE_START_AGE));
  const maxAgeUpside = curve.maxUpside * ageFraction;

  // Data quality scales down how much upside we're willing to project — a thin, unreliable sample gets pulled toward a conservative (small-upside) projection, per the spec.
  const dataQualityFactor = clamp01(avgReliability) * (dataCompleteness / 100);
  // A single season is the current real limitation (see this module's header) — apply the spec's documented extra regression for it, rather than trusting a one-season read as fully as a multi-season trend.
  const trajectoryFactor = hasMultiSeasonData ? 1.0 : 0.7;

  const ageUpsideApplied = maxAgeUpside * dataQualityFactor * trajectoryFactor;
  const potential = Math.round(Math.min(100, currentLevel + ageUpsideApplied) * 10) / 10;

  // Range width: wider for younger players (more development left = more uncertainty), narrower with better data quality.
  const baseWidth = 4 + ageFraction * 10; // 4 pts near peak age, up to 14 pts for the youngest players
  const width = baseWidth * (1.3 - 0.3 * dataQualityFactor); // thinner data widens the range further
  const low = Math.max(currentLevel, Math.round((potential - width / 2) * 10) / 10);
  const high = Math.min(100, Math.round((potential + width / 2) * 10) / 10);

  return {
    potential: Math.max(potential, currentLevel), // never below Current Level — enforced explicitly, not just by construction
    range: { low: Math.min(low, potential), high: Math.max(high, potential) },
    ageUpsideApplied: Math.round(ageUpsideApplied * 10) / 10,
    curveUsed: { positionGroup, peakAge: curve.peakAge, maxUpside: curve.maxUpside },
    reason: null,
  };
}

function clamp01(x) {
  return Math.min(1, Math.max(0, x));
}
