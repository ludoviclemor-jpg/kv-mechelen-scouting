import { describe, it, expect } from "vitest";
import { percentileRank, positionGroup, MIN_POPULATION } from "../percentile";

describe("percentileRank", () => {
  const population = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it("returns null when the population is too small to mean anything", () => {
    expect(percentileRank(5, [1, 2, 3])).toBeNull();
    expect(population.slice(0, MIN_POPULATION - 1).length).toBeLessThan(MIN_POPULATION);
  });

  it("ranks the top value at 100th percentile", () => {
    expect(percentileRank(10, population)).toBe(100);
  });

  it("ranks the bottom value at a low percentile, not 0 (it's still counted)", () => {
    expect(percentileRank(1, population)).toBe(10);
  });

  it("inverts direction for a lower-is-better metric", () => {
    // 1 is the best (lowest) value in an inverted metric -> should rank highest
    expect(percentileRank(1, population, true)).toBe(100);
    expect(percentileRank(10, population, true)).toBe(10);
  });
});

describe("positionGroup", () => {
  it("collapses real Impect position values into broader groups", () => {
    expect(positionGroup("LEFT_WINGBACK_DEFENDER")).toBe("Fullback");
    expect(positionGroup("RIGHT_WINGBACK_DEFENDER")).toBe("Fullback");
    expect(positionGroup("CENTER_FORWARD")).toBe("Striker");
  });

  it("falls back to the raw value for anything unmapped, never throws", () => {
    expect(positionGroup("SOME_NEW_POSITION")).toBe("SOME_NEW_POSITION");
  });
});
