/**
 * Impect's raw `position` values collapsed into the same 8 broad groups
 * used everywhere else in this app (src/lib/percentile.ts's
 * `positionGroup()`, which the frontend pizza chart already uses for
 * percentiles) — kept in sync manually since this runs in a plain Node
 * script and that one runs in the Next.js build; duplicating this one
 * small mapping is simpler than adding a build step either side doesn't
 * otherwise need.
 */
const POSITION_GROUPS = {
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

export function positionGroup(rawPosition) {
  return POSITION_GROUPS[rawPosition] ?? rawPosition;
}

/** Real raw Impect position values belonging to one position group — the reverse of positionGroup(), for building a cohort-fetch query. */
export function rawPositionsForGroup(group) {
  return Object.entries(POSITION_GROUPS)
    .filter(([, g]) => g === group)
    .map(([raw]) => raw);
}
