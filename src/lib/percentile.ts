/**
 * Real percentile-rank computation — no fabricated values. A metric's
 * percentile for one player is always computed against an actual
 * population of comparable players (same broad position group, same
 * competition) who have a real value for that same metric; a metric
 * with fewer than MIN_POPULATION comparable values returns `null`
 * rather than a misleading rank from too small a sample.
 */

export const MIN_POPULATION = 8;

/**
 * Standard percentile rank: the share of the population at or below this
 * value, as 0-100. `inverted` flips the direction for metrics where a
 * *lower* raw value is the better outcome (e.g. Impect's own
 * BALL_LOSS_REMOVED_TEAMMATES, which Impect itself marks `inverted: true`
 * in docs/impect-kpi-definitions.json — not a convention invented here).
 */
export function percentileRank(value: number, population: number[], inverted = false): number | null {
  if (population.length < MIN_POPULATION) return null;
  const compare = inverted ? (v: number) => v >= value : (v: number) => v <= value;
  const countAtOrBelow = population.filter(compare).length;
  return Math.round((countAtOrBelow / population.length) * 100);
}

/**
 * Impect's raw `position` values (confirmed live, e.g. "CENTRAL_DEFENDER",
 * "LEFT_WINGBACK_DEFENDER") collapsed into broader groups so a percentile
 * population is large enough to mean something on a single league's
 * squad lists — the same standardized-position-group idea used
 * throughout this app's own filters, applied to Impect's own position
 * vocabulary instead of Scoutastic's.
 */
const POSITION_GROUPS: Record<string, string> = {
  GOALKEEPER: "Goalkeeper",
  CENTRAL_DEFENDER: "Centre Back",
  LEFT_WINGBACK_DEFENDER: "Fullback",
  RIGHT_WINGBACK_DEFENDER: "Fullback",
  DEFENSE_MIDFIELD: "Defensive Midfield",
  CENTRAL_MIDFIELD: "Central Midfield",
  ATTACKING_MIDFIELD: "Attacking Midfield",
  LEFT_WINGER: "Winger",
  RIGHT_WINGER: "Winger",
  CENTER_FORWARD: "Striker",
};

export function positionGroup(rawPosition: string): string {
  return POSITION_GROUPS[rawPosition] ?? rawPosition;
}
