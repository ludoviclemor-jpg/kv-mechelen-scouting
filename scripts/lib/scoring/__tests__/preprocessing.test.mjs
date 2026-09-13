import { describe, it, expect } from "vitest";
import { computePlayerMetrics, computeDataCompleteness } from "../preprocessing.mjs";

describe("computePlayerMetrics", () => {
  it("uses Impect's own already-averaged KPI value as-is, never re-divided by minutes", () => {
    // Real Impect sync data confirms `kpis` values are already per-match-share
    // averages (endpoint is documented as returning "average KPIs" — see
    // preprocessing.mjs's header) — a 900-minute sample here is deliberately
    // irrelevant to the expected output, proving minutes plays no role.
    const row = { kpis: { BYPASSED_OPPONENTS: 1.8 }, minutes: 900 };
    const metrics = computePlayerMetrics(row);
    expect(metrics.bypassedOpponents).toBe(1.8);
  });

  it("does not shrink a high-minutes player's metric relative to a low-minutes player with the same real average", () => {
    const veteran = computePlayerMetrics({ kpis: { GOALS: 0.84 }, minutes: 3215 });
    const rotationPlayer = computePlayerMetrics({ kpis: { GOALS: 0.84 }, minutes: 450 });
    expect(veteran.goals).toBe(rotationPlayer.goals);
  });

  it("keeps duel win percentages as rates, never touched by minutes", () => {
    const row = { kpis: { WON_GROUND_DUELS: 30, LOST_GROUND_DUELS: 10 }, minutes: 900 };
    const metrics = computePlayerMetrics(row);
    expect(metrics.groundDuelWinPct).toBeCloseTo(75, 5); // 30 / (30+10) * 100, not touched by minutes at all
  });

  it("returns null (never 0) for a metric Impect never computed for this player", () => {
    const row = { kpis: { GOALS: 0.4 }, minutes: 900 }; // no ASSISTS key at all
    const metrics = computePlayerMetrics(row);
    expect(metrics.assists).toBeNull();
  });

  it("handles a missing metric without throwing", () => {
    const row = { kpis: { GOALS: 0 }, minutes: 0 };
    const metrics = computePlayerMetrics(row);
    expect(metrics.goals).toBe(0); // a real recorded zero, not missing data
  });

  it("computes a real derived finishing ratio from two real averages", () => {
    const row = { kpis: { GOALS: 0.6, SHOT_XG: 0.4 }, minutes: 900 };
    const metrics = computePlayerMetrics(row);
    expect(metrics.finishing).toBeCloseTo(1.5, 5); // over-performing xG
  });

  it("leaves finishing null when shot xG is exactly zero (would divide by zero)", () => {
    const row = { kpis: { GOALS: 0.1, SHOT_XG: 0 }, minutes: 900 };
    const metrics = computePlayerMetrics(row);
    expect(metrics.finishing).toBeNull();
  });

  it("leaves duel percentages null when neither won nor lost was ever recorded", () => {
    const row = { kpis: {}, minutes: 900 };
    const metrics = computePlayerMetrics(row);
    expect(metrics.groundDuelWinPct).toBeNull();
    expect(metrics.aerialDuelWinPct).toBeNull();
  });

  it("computes a real season attempt count from the per-match average and matchShare", () => {
    // 3 duels/match average * 32 real match-equivalents = ~96 real attempts this season.
    const row = { kpis: { WON_GROUND_DUELS: 2, LOST_GROUND_DUELS: 1 }, minutes: 2880, matchShare: 32 };
    const metrics = computePlayerMetrics(row);
    expect(metrics.groundDuelAttempts).toBeCloseTo(96, 5);
  });

  it("leaves attempt counts null without a real matchShare, rather than guessing from minutes", () => {
    const row = { kpis: { WON_GROUND_DUELS: 2, LOST_GROUND_DUELS: 1 }, minutes: 900 };
    const metrics = computePlayerMetrics(row);
    expect(metrics.groundDuelAttempts).toBeNull();
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
