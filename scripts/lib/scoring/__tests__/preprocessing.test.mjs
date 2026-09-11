import { describe, it, expect } from "vitest";
import { computePlayerMetrics, computeDataCompleteness } from "../preprocessing.mjs";

describe("computePlayerMetrics", () => {
  it("converts volume totals to real per-90 rates using minutes", () => {
    const row = { kpis: { BYPASSED_OPPONENTS: 18 }, minutes: 900 }; // 10 matches worth
    const metrics = computePlayerMetrics(row);
    expect(metrics.bypassedOpponents).toBeCloseTo(1.8, 5); // 18 / 900 * 90
  });

  it("keeps duel win percentages as rates, never re-divided by 90", () => {
    const row = { kpis: { WON_GROUND_DUELS: 30, LOST_GROUND_DUELS: 10 }, minutes: 900 };
    const metrics = computePlayerMetrics(row);
    expect(metrics.groundDuelWinPct).toBeCloseTo(75, 5); // 30 / (30+10) * 100, not touched by minutes at all
  });

  it("returns null (never 0) for a metric Impect never computed for this player", () => {
    const row = { kpis: { GOALS: 2 }, minutes: 900 }; // no ASSISTS key at all
    const metrics = computePlayerMetrics(row);
    expect(metrics.assists).toBeNull();
  });

  it("handles zero minutes without throwing or dividing by zero", () => {
    const row = { kpis: { GOALS: 0 }, minutes: 0 };
    const metrics = computePlayerMetrics(row);
    expect(metrics.goals).toBeNull();
  });

  it("computes a real derived finishing ratio from two real totals", () => {
    const row = { kpis: { GOALS: 6, SHOT_XG: 4 }, minutes: 900 };
    const metrics = computePlayerMetrics(row);
    expect(metrics.finishing).toBeCloseTo(1.5, 5); // over-performing xG
  });

  it("leaves finishing null when shot xG is exactly zero (would divide by zero)", () => {
    const row = { kpis: { GOALS: 1, SHOT_XG: 0 }, minutes: 900 };
    const metrics = computePlayerMetrics(row);
    expect(metrics.finishing).toBeNull();
  });

  it("leaves duel percentages null when neither won nor lost was ever recorded", () => {
    const row = { kpis: {}, minutes: 900 };
    const metrics = computePlayerMetrics(row);
    expect(metrics.groundDuelWinPct).toBeNull();
    expect(metrics.aerialDuelWinPct).toBeNull();
  });
});

describe("computeDataCompleteness", () => {
  it("is 100% when every used metric has a real value", () => {
    const values = { a: 1, b: 2, c: 3 };
    expect(computeDataCompleteness(values, ["a", "b", "c"])).toBe(100);
  });

  it("is 0% when nothing is available, never divides by zero for an empty metric list", () => {
    expect(computeDataCompleteness({}, [])).toBe(0);
  });

  it("counts only null/undefined as missing, not a real zero", () => {
    const values = { a: 0, b: null };
    expect(computeDataCompleteness(values, ["a", "b"])).toBe(50);
  });
});
