/**
 * Confirmed real Impect KPI ids selected for sync (checked against the
 * full 1458-entry catalog at docs/impect-kpi-definitions.json — never
 * an invented name). Shared by every impect-*.mjs sync script so the
 * same KPI set always lands in `impect_player_kpis.kpis`.
 */
export const KPI_IDS = {
  GOALS: 28,
  ASSISTS: 77,
  SHOT_AT_GOAL_NUMBER: 100,
  SHOT_XG: 82,
  PACKING_XG: 83,
  BYPASSED_OPPONENTS: 0,
  BYPASSED_DEFENDERS: 2,
  WON_GROUND_DUELS: 94,
  LOST_GROUND_DUELS: 95,
  WON_AERIAL_DUELS: 96,
  LOST_AERIAL_DUELS: 97,
  BALL_WIN_REMOVED_OPPONENTS: 24,
  BALL_LOSS_REMOVED_TEAMMATES: 21,
};

/** raw value / matchShare — a real per-90 rate (matchShare is Impect's own "how many full matches" figure). */
export function per90(raw, matchShare) {
  if (raw === undefined || raw === null || !matchShare) return null;
  return Math.round((raw / matchShare) * 100) / 100;
}

/** Extracts { name: value } for the selected KPI_IDS from one player-kpis row's raw `kpis` array — absent stays absent, never coerced to 0. */
export function extractKpis(rawKpis) {
  const byId = new Map(rawKpis.map((k) => [k.kpiId, k.value]));
  const out = {};
  for (const [name, id] of Object.entries(KPI_IDS)) {
    if (byId.has(id)) out[name] = byId.get(id);
  }
  return out;
}
