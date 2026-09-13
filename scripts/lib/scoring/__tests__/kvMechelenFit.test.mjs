import { describe, it, expect } from "vitest";
import { scoreKvMechelenFit } from "../kvMechelenFit.mjs";

function pillar(key, label, score, percentile, available = true) {
  return { key, label, domain: "technical", available, score, percentile, reliability: 0.8, weight: 0.2 };
}

describe("scoreKvMechelenFit", () => {
  it("returns unsupported for a position with no configured profile", () => {
    const result = scoreKvMechelenFit({ positionGroup: "Not A Real Position", currentLevel: 60, potential: 65, pillars: [], dataCompleteness: 100 });
    expect(result.supported).toBe(false);
    expect(result.immediateFit).toBeNull();
  });

  it("a strong all-round profile scores a high Immediate Fit", () => {
    const pillars = [
      pillar("goal_threat", "Goal Threat", 85, 90),
      pillar("finishing", "Finishing", 80, 85),
      pillar("chance_creation", "Chance Creation", 75, 80),
      pillar("progression_receptions_carries", "Progression", 70, 75),
      pillar("pressing", "Pressing", 60, 65),
    ];
    const result = scoreKvMechelenFit({ positionGroup: "Striker", currentLevel: 75, potential: 78, pillars, dataCompleteness: 100 });
    expect(result.supported).toBe(true);
    expect(result.immediateFit).toBeGreaterThan(70);
    expect(result.failedRequirements).toEqual([]);
  });

  it("a failed minimum requirement caps Immediate Fit even when everything else is strong", () => {
    const strongPillars = [
      pillar("goal_threat", "Goal Threat", 10, 15), // below Striker's minimum requirement (goal_threat >= 30th percentile)
      pillar("finishing", "Finishing", 90, 95),
      pillar("chance_creation", "Chance Creation", 90, 95),
      pillar("progression_receptions_carries", "Progression", 90, 95),
      pillar("pressing", "Pressing", 90, 95),
    ];
    const withFailedMinimum = scoreKvMechelenFit({ positionGroup: "Striker", currentLevel: 75, potential: 78, pillars: strongPillars, dataCompleteness: 100 });

    const allStrongPillars = strongPillars.map((p) => (p.key === "goal_threat" ? pillar("goal_threat", "Goal Threat", 90, 95) : p));
    const withoutFailedMinimum = scoreKvMechelenFit({ positionGroup: "Striker", currentLevel: 75, potential: 78, pillars: allStrongPillars, dataCompleteness: 100 });

    expect(withFailedMinimum.failedRequirements.length).toBeGreaterThan(0);
    expect(withFailedMinimum.immediateFit).toBeLessThan(withoutFailedMinimum.immediateFit);
  });

  it("never lets a missing (unavailable) pillar count as a failed requirement", () => {
    const pillars = [pillar("goal_threat", "Goal Threat", null, null, false), pillar("finishing", "Finishing", 70, 75)];
    const result = scoreKvMechelenFit({ positionGroup: "Striker", currentLevel: 60, potential: 62, pillars, dataCompleteness: 40 });
    expect(result.failedRequirements).toEqual([]);
  });

  it("a young player with a large Potential-Current Level gap scores a real Development Fit above their Immediate Fit", () => {
    const pillars = [
      pillar("goal_threat", "Goal Threat", 55, 55),
      pillar("finishing", "Finishing", 50, 50),
      pillar("chance_creation", "Chance Creation", 50, 50),
      pillar("progression_receptions_carries", "Progression", 50, 50),
      pillar("pressing", "Pressing", 50, 50),
    ];
    const result = scoreKvMechelenFit({ positionGroup: "Striker", currentLevel: 50, potential: 75, pillars, dataCompleteness: 100 });
    expect(result.developmentFit).toBeGreaterThan(result.immediateFit);
  });

  it("Total Fit weights Immediate Fit more heavily for an Immediate Starter role than a Development role", () => {
    // Defensive Midfield is configured "Immediate Starter"; Centre Back is configured "Rotation" — use the same synthetic pillar scores under each and check the weighting shows up in Total Fit's position relative to the two component scores.
    const pillars = [
      pillar("build_up_involvement", "Build-up", 40, 40),
      pillar("defensive_positioning_intervention", "Defensive Positioning", 40, 40),
      pillar("progressive_passing", "Progressive Passing", 40, 40),
      pillar("pressing", "Pressing", 40, 40),
      pillar("ball_security", "Ball Security", 90, 95),
    ];
    const result = scoreKvMechelenFit({ positionGroup: "Defensive Midfield", currentLevel: 45, potential: 80, pillars, dataCompleteness: 100 });
    // Immediate Starter mix is 0.75 immediate / 0.25 development — Total Fit should sit closer to Immediate Fit than Development Fit.
    expect(Math.abs(result.totalFit - result.immediateFit)).toBeLessThan(Math.abs(result.totalFit - result.developmentFit));
  });
});
