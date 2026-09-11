import { METRIC_REGISTRY } from "./config/metricRegistry.mjs";

/**
 * Raw -> usable metric values for one player row (Step 3, steps 1-2:
 * validate input, convert applicable totals to per-90). `row` is one
 * `impect_player_kpis` record shape: { kpis: {KPI_NAME: value}, minutes,
 * matchShare, position, playerId }. Rate metrics (duel win %) and
 * derived metrics (finishing) are computed here too, from the same real
 * inputs — never a separately-invented field.
 *
 * A metric absent from `row.kpis` (Impect genuinely never computed it
 * for this player) yields `null` here, propagated all the way through —
 * never coerced to 0 (see docs/impect-kpi-definitions.json's coverage
 * notes; confirmed live that e.g. GOALS/ASSISTS are absent, not zero,
 * for most non-scoring players).
 */
export function computePlayerMetrics(row) {
  const k = row.kpis ?? {};
  const minutes = row.minutes ?? 0;

  function per90(kpiName) {
    const raw = k[kpiName];
    if (raw === undefined || raw === null || minutes <= 0) return null;
    return (raw / minutes) * 90;
  }

  function raw(kpiName) {
    return k[kpiName] ?? null;
  }

  const values = {
    goals: per90("GOALS"),
    assists: per90("ASSISTS"),
    shots: per90("SHOT_AT_GOAL_NUMBER"),
    shotXg: per90("SHOT_XG"),
    packingXg: per90("PACKING_XG"),
    bypassedOpponents: per90("BYPASSED_OPPONENTS"),
    bypassedDefenders: per90("BYPASSED_DEFENDERS"),
    ballWin: per90("BALL_WIN_REMOVED_OPPONENTS"),
    ballLoss: per90("BALL_LOSS_REMOVED_TEAMMATES"),
  };

  // Rates: computed from two real volume totals, kept as a rate (never divided by 90 again) — spec's explicit instruction.
  const wonGround = raw("WON_GROUND_DUELS");
  const lostGround = raw("LOST_GROUND_DUELS");
  values.groundDuelWinPct =
    wonGround === null && lostGround === null ? null : ratio(wonGround ?? 0, lostGround ?? 0);

  const wonAerial = raw("WON_AERIAL_DUELS");
  const lostAerial = raw("LOST_AERIAL_DUELS");
  values.aerialDuelWinPct =
    wonAerial === null && lostAerial === null ? null : ratio(wonAerial ?? 0, lostAerial ?? 0);

  // Derived: goals / shot xG — a real ratio of two real season totals (finishing over/under-performance), not a separately-sourced field.
  const goalsTotal = raw("GOALS");
  const shotXgTotal = raw("SHOT_XG");
  values.finishing = goalsTotal === null || shotXgTotal === null || shotXgTotal === 0 ? null : goalsTotal / shotXgTotal;

  return values;
}

function ratio(won, lost) {
  const total = won + lost;
  if (total === 0) return null;
  return (won / total) * 100;
}

/** Data completeness: share of this position's *available* pillar metrics (registry entries actually used by any pillar) that this specific player has a real value for. */
export function computeDataCompleteness(values, usedMetricKeys) {
  if (usedMetricKeys.length === 0) return 0;
  const present = usedMetricKeys.filter((key) => values[key] !== null && values[key] !== undefined).length;
  return Math.round((present / usedMetricKeys.length) * 100);
}

export { METRIC_REGISTRY };
