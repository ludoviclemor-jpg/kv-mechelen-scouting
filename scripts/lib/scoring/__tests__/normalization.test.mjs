import { describe, it, expect } from "vitest";
import { winsorize, percentileRank, shrinkTowardAverage } from "../normalization.mjs";

describe("winsorize", () => {
  it("clips an extreme outlier into the configured percentile range", () => {
    // A large-enough population that the single outlier sits beyond its own 98th percentile bound (with only 11 points total, the outlier itself would dominate that bound — this needs real separation to test cleanly).
    const population = [...Array.from({ length: 50 }, (_, i) => i + 1), 1000];
    const clipped = winsorize(1000, population, 2, 98);
    expect(clipped).toBeLessThan(1000);
    expect(clipped).toBeLessThanOrEqual(50);
  });

  it("leaves an in-range value untouched", () => {
    const population = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(winsorize(5, population, 2, 98)).toBe(5);
  });
});

describe("percentileRank", () => {
  const population = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it("ranks higher-is-better metrics normally", () => {
    expect(percentileRank(10, population)).toBe(100);
    expect(percentileRank(1, population)).toBe(10);
  });

  it("inverts direction for a lower-is-better metric", () => {
    expect(percentileRank(1, population, true)).toBe(100);
    expect(percentileRank(10, population, true)).toBe(10);
  });

  it("returns null for an empty population rather than dividing by zero", () => {
    expect(percentileRank(5, [])).toBeNull();
  });
});

describe("shrinkTowardAverage (Bayesian reliability shrinkage)", () => {
  it("pulls a small sample much closer to 50 than a large one, for the same raw percentile", () => {
    const small = shrinkTowardAverage(95, 200, 270);
    const large = shrinkTowardAverage(95, 3000, 270);
    expect(small.adjusted).toBeLessThan(large.adjusted);
    expect(small.reliability).toBeLessThan(large.reliability);
  });

  it("leaves a percentile of exactly 50 unchanged regardless of minutes (already the cohort average)", () => {
    expect(shrinkTowardAverage(50, 100, 270).adjusted).toBe(50);
    expect(shrinkTowardAverage(50, 5000, 270).adjusted).toBe(50);
  });

  it("approaches the raw percentile as minutes grow very large", () => {
    const { adjusted, reliability } = shrinkTowardAverage(90, 100000, 270);
    expect(reliability).toBeGreaterThan(0.99);
    expect(adjusted).toBeCloseTo(90, 0);
  });

  it("gives zero minutes full shrinkage to the average", () => {
    expect(shrinkTowardAverage(90, 0, 270).adjusted).toBe(50);
  });
});
