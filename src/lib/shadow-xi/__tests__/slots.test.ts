import { describe, it, expect } from "vitest";
import { assignPlayerToSlot, removePlayerFromSlot, swapSlots } from "../slots";
import { FORMATIONS, getFormation } from "../formations";

describe("assignPlayerToSlot", () => {
  it("adds a player to an empty slot", () => {
    const result = assignPlayerToSlot({}, "GK", "sc-1");
    expect(result).toEqual({ GK: "sc-1" });
  });

  it("replaces whichever player already occupied that slot", () => {
    const result = assignPlayerToSlot({ GK: "sc-1" }, "GK", "sc-2");
    expect(result).toEqual({ GK: "sc-2" });
  });

  it("never lets the same player occupy two slots at once — moves them instead of duplicating", () => {
    const result = assignPlayerToSlot({ GK: "sc-1", ST: "sc-2" }, "ST", "sc-1");
    expect(result).toEqual({ ST: "sc-1" });
    expect(Object.values(result).filter((id) => id === "sc-1")).toHaveLength(1);
  });

  it("leaves every other slot untouched", () => {
    const result = assignPlayerToSlot({ GK: "sc-1", LB: "sc-3" }, "ST", "sc-2");
    expect(result).toEqual({ GK: "sc-1", LB: "sc-3", ST: "sc-2" });
  });
});

describe("removePlayerFromSlot", () => {
  it("clears one slot, leaves the rest", () => {
    const result = removePlayerFromSlot({ GK: "sc-1", ST: "sc-2" }, "GK");
    expect(result).toEqual({ ST: "sc-2" });
  });

  it("is a no-op on an already-empty slot", () => {
    const result = removePlayerFromSlot({ ST: "sc-2" }, "GK");
    expect(result).toEqual({ ST: "sc-2" });
  });
});

describe("swapSlots", () => {
  it("swaps two filled slots", () => {
    const result = swapSlots({ GK: "sc-1", ST: "sc-2" }, "GK", "ST");
    expect(result).toEqual({ GK: "sc-2", ST: "sc-1" });
  });

  it("moves a player into an empty slot and clears the source (one side empty)", () => {
    const result = swapSlots({ GK: "sc-1" }, "GK", "ST");
    expect(result).toEqual({ ST: "sc-1" });
  });

  it("is a no-op when both slots are already empty", () => {
    const result = swapSlots({ GK: "sc-1" }, "LB", "RB");
    expect(result).toEqual({ GK: "sc-1" });
  });

  it("never leaves a player in both slots after swapping", () => {
    const result = swapSlots({ GK: "sc-1", ST: "sc-2" }, "GK", "ST");
    const values = Object.values(result);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("4-2-3-1 formation", () => {
  it("has exactly eleven unique real positions", () => {
    const formation = getFormation("4-2-3-1");
    expect(formation.positions).toHaveLength(11);
    const slotKeys = formation.positions.map((p) => p.slot);
    expect(new Set(slotKeys).size).toBe(11);
  });

  it("includes exactly the eleven positions the brief specifies", () => {
    const formation = getFormation("4-2-3-1");
    const slotKeys = new Set(formation.positions.map((p) => p.slot));
    expect(slotKeys).toEqual(new Set(["GK", "RB", "RCB", "LCB", "LB", "RDM", "LDM", "RW", "CAM", "LW", "ST"]));
  });

  it("places every slot within the real 0-100 pitch coordinate range", () => {
    const formation = getFormation("4-2-3-1");
    for (const pos of formation.positions) {
      expect(pos.x).toBeGreaterThanOrEqual(0);
      expect(pos.x).toBeLessThanOrEqual(100);
      expect(pos.y).toBeGreaterThanOrEqual(0);
      expect(pos.y).toBeLessThanOrEqual(100);
    }
  });

  it("falls back to the first real formation for an unknown id, never throws", () => {
    expect(getFormation("nonexistent")).toEqual(FORMATIONS[0]);
  });
});
