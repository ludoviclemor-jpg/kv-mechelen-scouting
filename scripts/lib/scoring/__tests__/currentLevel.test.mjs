import { describe, it, expect } from "vitest";
import { scoreCurrentLevel } from "../currentLevel.mjs";
import { POSITION_PILLARS } from "../config/positionPillars.mjs";

describe("positionPillars — no metric double-counted across pillars for one position", () => {
  // Found live 2026-09-13: a metric weighted into two different named
  // pillars silently counts twice toward Current Level (top-level
  // pillar weights are equal, so reusing a metric is a real, hidden
  // extra vote for it, not just a labeling choice).
  for (const [group, def] of Object.entries(POSITION_PILLARS)) {
    it(`${group}: every real metric key is used by at most one pillar`, () => {
      const usageCount = new Map();
      for (const pillar of def.pillars) {
        for (const { metric } of pillar.metrics) {
          usageCount.set(metric, (usageCount.get(metric) ?? 0) + 1);
        }
      }
      const duplicated = [...usageCount.entries()].filter(([, count]) => count > 1);
      expect(duplicated).toEqual([]);
    });
  }
});

function cohortRow(i, level, matches = 20) {
  return {
    playerId: 1000 + i,
    position: "CENTER_FORWARD",
    minutes: matches * 90,
    matchShare: matches,
    iterationId: 1,
    kpis: {
      WON_GROUND_DUELS: 3 + level * 0.02,
      LOST_GROUND_DUELS: 3 - level * 0.02,
    },
  };
}

describe("scoreCurrentLevel — rate metrics shrink by real attempts, not minutes", () => {
  const posConfig = { pillars: [{ key: "duels", label: "Duels", available: true, metrics: [{ metric: "groundDuelWinPct", weight: 1.0 }] }] };
  const cohort = Array.from({ length: 30 }, (_, i) => cohortRow(i, i));

  it("a player with few real duel attempts is pulled closer to the cohort average than one with many, despite equal minutes", () => {
    const sameMinutes = 2700; // 30 matches
    const highAttempts = { position: "CENTER_FORWARD", minutes: sameMinutes, matchShare: 30, kpis: { WON_GROUND_DUELS: 9, LOST_GROUND_DUELS: 1 } }; // 300 real attempts, 90% win rate
    const lowAttempts = { position: "CENTER_FORWARD", minutes: sameMinutes, matchShare: 30, kpis: { WON_GROUND_DUELS: 0.09, LOST_GROUND_DUELS: 0.01 } }; // 3 real attempts, same 90% win rate

    const highResult = scoreCurrentLevel({ player: highAttempts, positionGroupConfig: posConfig, cohort, competitionName: "Jupiler Pro League" });
    const lowResult = scoreCurrentLevel({ player: lowAttempts, positionGroupConfig: posConfig, cohort, competitionName: "Jupiler Pro League" });

    // Same raw win rate, same minutes — but the low-attempt player's real sample is far too thin to trust, so their calibrated score must sit closer to 50 (pre-calibration midpoint) than the high-attempt player's.
    expect(Math.abs(lowResult.rawScore - 50)).toBeLessThan(Math.abs(highResult.rawScore - 50));
  });

  it("falls back to minutes-based shrinkage when matchShare is genuinely unavailable, rather than skipping the metric", () => {
    const player = { position: "CENTER_FORWARD", minutes: 2700, kpis: { WON_GROUND_DUELS: 9, LOST_GROUND_DUELS: 1 } };
    const result = scoreCurrentLevel({ player, positionGroupConfig: posConfig, cohort, competitionName: "Jupiler Pro League" });
    expect(result.pillars[0].available).toBe(true);
  });
});
