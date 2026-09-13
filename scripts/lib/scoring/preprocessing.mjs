import { METRIC_REGISTRY } from "./config/metricRegistry.mjs";

/**
 * Raw -> usable metric values for one player row. `row` is one
 * `impect_player_kpis` record shape: { kpis: {KPI_NAME: value}, minutes,
 * matchShare, position, playerId }. Rate metrics (duel win %) and
 * derived metrics (finishing) are computed here too, from the same real
 * inputs — never a separately-invented field.
 *
 * **`row.kpis` values are already real per-match-share averages, not
 * season-cumulative totals** — confirmed live, 2026-09-11: Impect's own
 * sync endpoint (`/v5/customerapi/iterations/{id}/squads/{id}/player-
 * kpis`) is explicitly documented as returning "average KPIs for players
 * for single iteration" (its response DTO is literally named
 * `IterationAvgPlayerKpisDto`/`IterationAvgKpiDto`), and real synced
 * data confirms it: every Premier League 2025/26 centre-forward's
 * `GOALS` value clusters in the same ~0.2-0.85 range regardless of
 * whether they played 2900 or 3644 minutes — impossible for a season
 * total, exactly expected for an already-per-match average. This module
 * used to divide these values by `minutes` a *second* time
 * (`(raw / minutes) * 90`), which doesn't just produce a wrong
 * constant — it systematically shrinks the metric further the *more*
 * minutes a player has, silently punishing exactly the high-minutes
 * regular starters a scout cares most about (confirmed live: this was
 * why a clearly elite, ever-present striker's Goal Threat pillar came
 * out at the 40th percentile instead of the 90s). Fixed by using
 * Impect's own already-computed average directly — trusting Impect's
 * own real normalization rather than re-deriving a second, guessed one.
 *
 * A metric absent from `row.kpis` (Impect genuinely never computed it
 * for this player) yields `null` here, propagated all the way through —
 * never coerced to 0 (see docs/impect-kpi-definitions.json's coverage
 * notes; confirmed live that e.g. GOALS/ASSISTS are absent, not zero,
 * for most non-scoring players).
 */
export function computePlayerMetrics(row) {
  const k = row.kpis ?? {};
  const matchShare = row.matchShare ?? null;

  function average(kpiName) {
    const value = k[kpiName];
    return value === undefined || value === null ? null : value;
  }

  function raw(kpiName) {
    return k[kpiName] ?? null;
  }

  const values = {
    goals: average("GOALS"),
    assists: average("ASSISTS"),
    shots: average("SHOT_AT_GOAL_NUMBER"),
    shotXg: average("SHOT_XG"),
    packingXg: average("PACKING_XG"),
    bypassedOpponents: average("BYPASSED_OPPONENTS"),
    bypassedDefenders: average("BYPASSED_DEFENDERS"),
    ballWin: average("BALL_WIN_REMOVED_OPPONENTS"),
    ballLoss: average("BALL_LOSS_REMOVED_TEAMMATES"),
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

  // Real attempt counts for the two rate metrics — a duel win % built on
  // 3 real attempts and one built on 300 real attempts should not get
  // equal trust just because both players logged similar minutes (found
  // 2026-09-13: the reliability shrinkage previously used `minutes`
  // uniformly for every metric, including rates, which is exactly this
  // bug — a low-engagement player who rarely contests duels but plays
  // full 90s got the same duel-rate reliability as a duel-heavy
  // defender). `matchShare` is Impect's own real per-season match-
  // equivalent figure (confirmed live this session against real season
  // totals) — (won + lost) per match * matchShare recovers a real
  // season attempt count from the per-match average Impect returns.
  values.groundDuelAttempts =
    matchShare && wonGround !== null && lostGround !== null ? (wonGround + lostGround) * matchShare : null;
  values.aerialDuelAttempts =
    matchShare && wonAerial !== null && lostAerial !== null ? (wonAerial + lostAerial) * matchShare : null;

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
