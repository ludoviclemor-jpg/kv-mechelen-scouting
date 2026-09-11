/**
 * Metric registry — the single source of truth mapping real, confirmed
 * Impect fields to what the scoring engine actually uses. Every entry
 * here is checked against docs/impect-kpi-definitions.json (the real
 * 1458-entry KPI catalog) — nothing invented.
 *
 * Scope note (2026-09-11): only the 13 KPIs currently synced into
 * `impect_player_kpis.kpis` by scripts/sync-impect-player-kpis.mjs are
 * usable today (see scripts/lib/impectKpis.mjs — the same KPI_IDS
 * object this registry's `impectField`s must match). Impect's real
 * catalog has far more (1458 KPIs + 134 Scores, see also
 * docs/impect-score-definitions.json) — expanding coverage later just
 * means adding to both KPI_IDS and this registry together, never
 * inventing a metric name here that isn't actually being synced.
 *
 * `kind`:
 *   'volume'     — a season total; the scoring engine converts to
 *                   per-90 using minutes before use (never mixed with rates).
 *   'rate'       — already a rate/percentage (e.g. a duel win %,
 *                   computed from two volume KPIs); never re-divided by 90.
 *   'derived'    — computed from two other registry entries inside the
 *                   scoring engine (e.g. finishing = goals / shot xG);
 *                   `derivedFrom` names the two source metric keys.
 */

export const METRIC_REGISTRY = {
  goals: {
    impectField: "GOALS",
    label: "Goals",
    kind: "volume",
    higherIsBetter: true,
  },
  assists: {
    impectField: "ASSISTS",
    label: "Assists",
    kind: "volume",
    higherIsBetter: true,
  },
  shots: {
    impectField: "SHOT_AT_GOAL_NUMBER",
    label: "Shots",
    kind: "volume",
    higherIsBetter: true,
  },
  shotXg: {
    impectField: "SHOT_XG",
    label: "Shot-based xG",
    kind: "volume",
    higherIsBetter: true,
  },
  packingXg: {
    impectField: "PACKING_XG",
    label: "Packing xG (non-shot-based expected threat via ball progression)",
    kind: "volume",
    higherIsBetter: true,
  },
  bypassedOpponents: {
    impectField: "BYPASSED_OPPONENTS",
    label: "Bypassed Opponents",
    kind: "volume",
    higherIsBetter: true,
  },
  bypassedDefenders: {
    impectField: "BYPASSED_DEFENDERS",
    label: "Bypassed Defenders",
    kind: "volume",
    higherIsBetter: true,
  },
  groundDuelWinPct: {
    impectField: "WON_GROUND_DUELS / LOST_GROUND_DUELS",
    label: "Ground Duel Win %",
    kind: "rate",
    higherIsBetter: true,
  },
  aerialDuelWinPct: {
    impectField: "WON_AERIAL_DUELS / LOST_AERIAL_DUELS",
    label: "Aerial Duel Win %",
    kind: "rate",
    higherIsBetter: true,
  },
  ballWin: {
    impectField: "BALL_WIN_REMOVED_OPPONENTS",
    label: "Ball Win (Removed Opponents)",
    kind: "volume",
    higherIsBetter: true,
  },
  ballLoss: {
    impectField: "BALL_LOSS_REMOVED_TEAMMATES",
    label: "Ball Loss (Removed Teammates)",
    kind: "volume",
    // Impect's own KPI catalog marks this `inverted: true` (docs/impect-kpi-definitions.json, id 21) — a real, confirmed direction, not assumed.
    higherIsBetter: false,
  },
  finishing: {
    impectField: "GOALS / SHOT_XG",
    label: "Finishing Over/Under-Performance",
    kind: "derived",
    derivedFrom: ["goals", "shotXg"],
    higherIsBetter: true,
  },
};

/** Every metric key this registry knows about — used to validate pillar configs at load time. */
export const METRIC_KEYS = Object.keys(METRIC_REGISTRY);
