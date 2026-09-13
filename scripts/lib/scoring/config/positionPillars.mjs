/**
 * Position-specific pillar definitions — Step 2/4 of the scoring spec.
 * Every pillar lists the real metric keys (from metricRegistry.mjs) that
 * feed it, with a weight. A pillar with an empty `metrics` array is
 * `available: false` by construction — the desired football concept
 * exists (it's named, matching the requested pillar list) but no
 * currently-synced Impect field measures it, so it's marked unavailable
 * rather than filled with an invented proxy. Weights are renormalized at
 * scoring time across whichever pillars actually have data for a given
 * player (see currentLevel.mjs) — a missing pillar never silently
 * becomes a 0.
 *
 * Position groups match src/lib/percentile.ts's `positionGroup()`
 * exactly (kept in sync manually — both map Impect's raw `position`
 * values into the same 8 groups) since the frontend pizza chart already
 * uses that grouping for percentiles; the rating engine reuses it here
 * for cohorts too, one standardized set of groups across the app.
 *
 * `domain` ("technical" | "physical", 2026-09-11) is a *display*
 * categorization only — it never changes a pillar's weight or its
 * contribution to Current Level, which is computed identically
 * regardless of domain (see currentLevel.mjs). It exists so the
 * frontend can render two separate charts (Technical Profile /
 * Physical Profile — src/components/player-profile/PlayerRatingBreakdown.tsx)
 * from the same underlying pillar results instead of computing a second,
 * parallel scoring pass. Duel-based and pressing/defensive-positioning
 * pillars are tagged `physical` — the closest real, non-invented proxy
 * to physicality this project's synced Impect data supports (no real
 * speed/sprint/distance-covered tracking is synced). Everything else is
 * `technical`.
 */

function pillar(key, label, metrics, domain = "technical") {
  return { key, label, metrics, available: metrics.length > 0, domain };
}

export const POSITION_PILLARS = {
  Goalkeeper: {
    // No goalkeeper-specific Impect metric is currently synced (real
    // GK save/handling/distribution data lives in Impect's separate
    // player-scores endpoint — see docs/impect-score-definitions.json's
    // GK_* entries — which isn't synced yet). Every pillar below is
    // therefore unavailable by construction; `supported: false` tells
    // the service to skip scoring goalkeepers entirely rather than
    // publish a rating built on a proxy that isn't really goalkeeping.
    supported: false,
    unsupportedReason: "No goalkeeper-specific Impect metrics are synced yet (see docs/impect-score-definitions.json's GK_* fields for what would need to be added).",
    pillars: [
      pillar("shot_stopping", "Shot Stopping", []),
      pillar("cross_area_control", "Cross & Area Control", []),
      pillar("distribution", "Distribution", []),
      pillar("build_up_involvement", "Build-up Involvement", []),
      pillar("sweeping", "Sweeping", [], "physical"),
      pillar("ball_security", "Ball Security", []),
    ],
  },

  "Centre Back": {
    supported: true,
    pillars: [
      pillar("defensive_duels_intervention", "Defensive Duels & Intervention", [
        { metric: "groundDuelWinPct", weight: 0.6 },
        { metric: "ballWin", weight: 0.4 },
      ], "physical"),
      pillar("aerial_ability", "Aerial Ability", [{ metric: "aerialDuelWinPct", weight: 1.0 }], "physical"),
      pillar("build_up_contribution", "Build-up Contribution", [{ metric: "bypassedOpponents", weight: 1.0 }]),
      pillar("passing_progression", "Passing Progression", [{ metric: "bypassedDefenders", weight: 0.6 }, { metric: "packingXg", weight: 0.4 }]),
      pillar("carrying_progression", "Carrying Progression", []), // no dribble/carry-distance metric synced
      pillar("press_resistance", "Press Resistance", []), // no receiving-under-pressure metric synced
      pillar("ball_security", "Ball Security", [{ metric: "ballLoss", weight: 1.0 }]),
      pillar("defensive_mobility", "Defensive Mobility", [], "physical"), // no physical/speed data synced
    ],
  },

  Fullback: {
    supported: true,
    pillars: [
      // groundDuelWinPct only — ballWin lives solely in "pressing" below.
      // Previously both pillars weighted ballWin (0.5 here, 1.0 there),
      // so a player's ball-winning rate counted twice toward Current
      // Level (real double-counting, found 2026-09-13 while reviewing
      // for correlated-metric reuse across pillars).
      pillar("defensive_contribution", "Defensive Contribution", [{ metric: "groundDuelWinPct", weight: 1.0 }], "physical"),
      // bypassedOpponents only — bypassedDefenders lives solely in "final_third_contribution" below (real double-counting, found via test 2026-09-13).
      pillar("ball_progression", "Ball Progression", [{ metric: "bypassedOpponents", weight: 1.0 }]),
      pillar("build_up_involvement", "Build-up Involvement", [{ metric: "packingXg", weight: 1.0 }]),
      // assists only — packingXg lives solely in "build_up_involvement" above (real double-counting, found via test 2026-09-13).
      pillar("chance_creation", "Chance Creation", [{ metric: "assists", weight: 1.0 }]),
      pillar("final_third_contribution", "Final-Third Contribution", [{ metric: "bypassedDefenders", weight: 1.0 }]),
      pillar("crossing_box_delivery", "Crossing / Box Delivery", []), // no cross-specific metric synced
      pillar("pressing", "Pressing", [{ metric: "ballWin", weight: 1.0 }], "physical"),
      pillar("ball_security", "Ball Security", [{ metric: "ballLoss", weight: 1.0 }]),
    ],
  },

  "Defensive Midfield": {
    supported: true,
    pillars: [
      pillar("build_up_involvement", "Build-up Involvement", [{ metric: "bypassedOpponents", weight: 1.0 }]),
      // bypassedDefenders only — packingXg lives solely in "possession_value" below (real double-counting, found via test 2026-09-13).
      pillar("progressive_passing", "Progressive Passing", [{ metric: "bypassedDefenders", weight: 1.0 }]),
      pillar("receiving_press_resistance", "Receiving & Press Resistance", []), // no receiving-specific metric synced
      pillar("ball_security", "Ball Security", [{ metric: "ballLoss", weight: 1.0 }]),
      // groundDuelWinPct only — see Fullback's identical fix above; ballWin lives solely in "pressing".
      pillar("defensive_positioning_intervention", "Defensive Positioning & Intervention", [{ metric: "groundDuelWinPct", weight: 1.0 }], "physical"),
      pillar("pressing", "Pressing", [{ metric: "ballWin", weight: 1.0 }], "physical"),
      pillar("possession_value", "Possession Value", [{ metric: "packingXg", weight: 1.0 }]),
    ],
  },

  "Central Midfield": {
    supported: true,
    pillars: [
      pillar("build_up_involvement", "Build-up Involvement", [{ metric: "bypassedOpponents", weight: 1.0 }]),
      // bypassedDefenders only — packingXg lives solely in "possession_value" below (real double-counting, found via test 2026-09-13).
      pillar("progression", "Progression", [{ metric: "bypassedDefenders", weight: 1.0 }]),
      pillar("passing_quality", "Passing Quality", []), // no pass-completion% metric synced (RATIO_PASSING_ACCURACY exists in Impect's Scores catalog but isn't synced yet)
      pillar("press_resistance", "Press Resistance", []),
      pillar("chance_creation", "Chance Creation", [{ metric: "assists", weight: 0.6 }, { metric: "shotXg", weight: 0.4 }]),
      pillar("defensive_contribution", "Defensive Contribution", [
        { metric: "groundDuelWinPct", weight: 0.5 },
        { metric: "ballWin", weight: 0.5 },
      ], "physical"),
      pillar("possession_value", "Possession Value", [{ metric: "packingXg", weight: 1.0 }]),
      pillar("ball_security", "Ball Security", [{ metric: "ballLoss", weight: 1.0 }]),
    ],
  },

  "Attacking Midfield": {
    supported: true,
    pillars: [
      // shotXg removed (real double-counting with "goal_threat" below, found via test 2026-09-13) — assists/packingXg weights renormalized to sum to 1.0.
      pillar("chance_creation", "Chance Creation", [{ metric: "assists", weight: 0.625 }, { metric: "packingXg", weight: 0.375 }]),
      // "Final-Third Involvement" used to be a separate pillar with the
      // identical single metric (bypassedDefenders, weight 1.0) as this
      // one — real double-counting (found 2026-09-13), removed rather
      // than kept as a second copy of the same signal.
      pillar("line_breaking_actions", "Line-Breaking Actions", [{ metric: "bypassedDefenders", weight: 1.0 }]),
      pillar("progressive_receptions", "Progressive Receptions", []), // no receiving-location metric synced
      pillar("box_involvement", "Box Involvement", []), // no box-touch metric synced
      pillar("goal_threat", "Goal Threat", [{ metric: "goals", weight: 0.5 }, { metric: "shotXg", weight: 0.5 }]),
      pillar("pressing", "Pressing", [{ metric: "ballWin", weight: 1.0 }], "physical"),
      pillar("ball_security", "Ball Security", [{ metric: "ballLoss", weight: 1.0 }]),
    ],
  },

  Winger: {
    supported: true,
    pillars: [
      pillar("progression", "Progression", [{ metric: "bypassedOpponents", weight: 1.0 }]),
      pillar("one_v_one_impact", "1v1 Impact", [], "physical"), // no dribble-success metric synced (DRIBBLE_SCORE exists in Impect's Scores catalog, not synced yet)
      pillar("chance_creation", "Chance Creation", [{ metric: "assists", weight: 0.6 }, { metric: "packingXg", weight: 0.4 }]),
      pillar("final_third_involvement", "Final-Third Involvement", [{ metric: "bypassedDefenders", weight: 1.0 }]),
      pillar("box_threat", "Box Threat", []), // no box-touch metric synced
      pillar("goal_threat", "Goal Threat", [{ metric: "goals", weight: 0.5 }, { metric: "shotXg", weight: 0.5 }]),
      pillar("off_ball_threat", "Off-Ball Threat", [], "physical"), // no off-ball-run metric synced
      pillar("pressing", "Pressing", [{ metric: "ballWin", weight: 1.0 }], "physical"),
      pillar("ball_security", "Ball Security", [{ metric: "ballLoss", weight: 1.0 }]),
    ],
  },

  Striker: {
    supported: true,
    pillars: [
      // "Shot Quality" used to be a separate pillar built from shotXg
      // alone — the same metric already fully inside "Goal Threat"
      // (weight 0.5) here, so shotXg counted toward Current Level twice
      // over (three times counting "Finishing" below, which is derived
      // from shotXg too) — real double-counting, found 2026-09-13.
      // Removed as its own pillar; shotXg's signal still lives in Goal
      // Threat.
      pillar("goal_threat", "Goal Threat", [{ metric: "goals", weight: 0.5 }, { metric: "shotXg", weight: 0.5 }]),
      pillar("box_presence", "Box Presence", [], "physical"), // no box-touch metric synced
      pillar("finishing", "Finishing", [{ metric: "finishing", weight: 1.0 }]),
      pillar("link_play", "Link Play", []), // no hold-up/lay-off metric synced
      pillar("progression_receptions_carries", "Progression via Receptions/Carries", [{ metric: "bypassedDefenders", weight: 1.0 }]),
      pillar("chance_creation", "Chance Creation", [{ metric: "assists", weight: 1.0 }]),
      pillar("pressing", "Pressing", [{ metric: "ballWin", weight: 1.0 }], "physical"),
      pillar("possession_retention", "Possession Retention", [{ metric: "ballLoss", weight: 1.0 }]),
    ],
  },
};

export const SUPPORTED_POSITION_GROUPS = Object.entries(POSITION_PILLARS)
  .filter(([, def]) => def.supported)
  .map(([group]) => group);
