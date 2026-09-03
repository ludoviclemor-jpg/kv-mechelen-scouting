import { describe, it, expect } from "vitest";
import { compareNumbers, compareStrings } from "../utils";

describe("compareNumbers", () => {
  it("sorts ascending", () => {
    expect([3, 1, 2].sort(compareNumbers)).toEqual([1, 2, 3]);
  });

  it("treats null/undefined as lowest, consistently on either side", () => {
    expect(compareNumbers(null, 5)).toBeLessThan(0);
    expect(compareNumbers(5, null)).toBeGreaterThan(0);
    expect(compareNumbers(undefined, 5)).toBeLessThan(0);
    expect(compareNumbers(null, undefined)).toBe(0);
  });

  it("sorts a real market-value-shaped list correctly, nulls first", () => {
    const values = [500_000, null, 10_000_000, 0];
    expect(values.sort(compareNumbers)).toEqual([null, 0, 500_000, 10_000_000]);
  });
});

describe("compareStrings", () => {
  it("sorts ascending, case-aware via localeCompare", () => {
    expect(["Charlie", "alice", "Bob"].sort(compareStrings)).toEqual(["alice", "Bob", "Charlie"]);
  });

  it("treats null/undefined as lowest, consistently on either side", () => {
    expect(compareStrings(null, "a")).toBeLessThan(0);
    expect(compareStrings("a", null)).toBeGreaterThan(0);
    expect(compareStrings(null, undefined)).toBe(0);
  });
});
