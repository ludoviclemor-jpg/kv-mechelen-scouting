/**
 * Pure normalization math — winsorization, percentile rank, Bayesian
 * reliability shrinkage. No Impect-specific knowledge here, just the
 * statistics, so it's independently testable (see
 * scripts/lib/scoring/__tests__/normalization.test.mjs).
 */

/** Linear-interpolated percentile value of `sorted` (already ascending) at `pct` (0-100). */
function percentileValue(sorted, pct) {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const rank = (pct / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];
  const frac = rank - lower;
  return sorted[lower] + (sorted[upper] - sorted[lower]) * frac;
}

/** Clips `value` to the [lowPct, highPct] percentile range of `population` — protects the model against one extreme outlier match/season (Step 3). */
export function winsorize(value, population, lowPct, highPct) {
  if (population.length === 0) return value;
  const sorted = [...population].sort((a, b) => a - b);
  const lo = percentileValue(sorted, lowPct);
  const hi = percentileValue(sorted, highPct);
  return Math.min(Math.max(value, lo), hi);
}

/**
 * Standard percentile rank: share of the population at or below `value`,
 * as 0-100. `inverted` flips direction for lower-is-better metrics.
 * Mirrors src/lib/percentile.ts's percentileRank (kept in sync manually
 * — one runs in the browser/Next.js build, one in these plain Node
 * scripts, so they can't share a module without a build step neither
 * side needs otherwise).
 */
export function percentileRank(value, population, inverted = false) {
  if (population.length === 0) return null;
  const compare = inverted ? (v) => v >= value : (v) => v <= value;
  const countAtOrBelow = population.filter(compare).length;
  return (countAtOrBelow / population.length) * 100;
}

/**
 * Bayesian shrinkage toward the cohort average (50th percentile) — the
 * exact formula from the spec:
 *   reliability = minutes / (minutes + RELIABILITY_CONSTANT)
 *   adjusted = 50 + reliability * (rawPercentile - 50)
 * A 200-minute sample and a 2,000-minute sample earning the same raw
 * percentile do NOT end up equally far from 50 — the smaller sample is
 * pulled back toward average.
 */
export function shrinkTowardAverage(rawPercentile, minutes, reliabilityConstant) {
  const reliability = minutes / (minutes + reliabilityConstant);
  const adjusted = 50 + reliability * (rawPercentile - 50);
  return { adjusted, reliability };
}
