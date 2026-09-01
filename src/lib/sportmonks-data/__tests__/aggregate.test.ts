import { describe, it, expect } from "vitest";
import { average, lastNAverage } from "../aggregate";
import type { PlayerMatchRating } from "../types";

function rating(fixtureId: string, matchDate: string, value: number): PlayerMatchRating {
  return {
    fixtureId,
    competitionId: "501",
    competitionName: "Scottish Premiership",
    seasonId: "28275",
    matchDate,
    opponent: "Test Opponent",
    homeAway: "home",
    minutesPlayed: 90,
    starter: true,
    rating: value,
  };
}

describe("average", () => {
  it("returns null for an empty array — never a fabricated 0", () => {
    expect(average([])).toBeNull();
  });

  it("averages real rating values, rounded to 2 decimals", () => {
    // Real values from the live sync (2026-09-01), Patrick Pentz (Bröndby IF) — raw mean is 7.075, rounds to 7.08
    expect(average([6.88, 6.42, 7.69, 7.31])).toBe(7.08);
  });

  it("rounds to 2 decimals", () => {
    expect(average([7.1, 7.2, 7.3])).toBe(7.2);
  });
});

describe("lastNAverage", () => {
  it("caps at n even when more ratings are available, keeping only the most recent", () => {
    const ratings = [
      rating("f6", "2026-08-31", 8.0),
      rating("f5", "2026-08-24", 7.5),
      rating("f4", "2026-08-17", 7.0),
      rating("f3", "2026-08-10", 6.5),
      rating("f2", "2026-08-03", 6.0),
      rating("f1", "2026-07-27", 5.5), // 6th appearance — must be excluded from "last 5"
    ];
    const { recent, average: avg } = lastNAverage(ratings, 5);
    expect(recent).toHaveLength(5);
    expect(recent.map((r) => r.fixtureId)).toEqual(["f6", "f5", "f4", "f3", "f2"]);
    expect(recent.some((r) => r.fixtureId === "f1")).toBe(false);
    expect(avg).toBeCloseTo((8.0 + 7.5 + 7.0 + 6.5 + 6.0) / 5, 5);
  });

  it("averages over fewer than n ratings when that's all that exists", () => {
    const ratings = [rating("f2", "2026-08-24", 7.8), rating("f1", "2026-08-17", 7.3)];
    const { recent, average: avg } = lastNAverage(ratings, 5);
    expect(recent).toHaveLength(2);
    expect(avg).toBeCloseTo(7.55, 5);
  });

  it("returns an empty recent list and a null average for a player with no ratings", () => {
    const { recent, average: avg } = lastNAverage([], 5);
    expect(recent).toEqual([]);
    expect(avg).toBeNull();
  });
});
