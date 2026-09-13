import { describe, it, expect } from "vitest";
import { selectBestXI, type BestXICandidate } from "../selection";
import { getFormation } from "@/lib/shadow-xi";

function candidate(overrides: Partial<BestXICandidate>): BestXICandidate {
  return {
    scoutasticPlayerId: "1",
    playerName: "Test Player",
    club: "Test Club",
    photoUrl: null,
    rawPosition: "CENTER_FORWARD",
    positionGroup: "Striker",
    performanceScore: 50,
    reliability: 0.8,
    minutes: 1500,
    ...overrides,
  };
}

const formation = getFormation("4-2-3-1");

describe("selectBestXI", () => {
  it("selects the single highest-scoring eligible candidate for a one-slot position", () => {
    const candidates = [
      candidate({ scoutasticPlayerId: "1", performanceScore: 70 }),
      candidate({ scoutasticPlayerId: "2", performanceScore: 90 }),
      candidate({ scoutasticPlayerId: "3", performanceScore: 60 }),
    ];
    const result = selectBestXI(candidates, formation);
    const st = result.slots.find((s) => s.slot === "ST");
    expect(st?.candidate?.scoutasticPlayerId).toBe("2");
  });

  it("never selects the same player for two slots", () => {
    const candidates = [
      candidate({ scoutasticPlayerId: "1", positionGroup: "Centre Back", rawPosition: "CENTRAL_DEFENDER", performanceScore: 90 }),
      candidate({ scoutasticPlayerId: "2", positionGroup: "Centre Back", rawPosition: "CENTRAL_DEFENDER", performanceScore: 80 }),
    ];
    const result = selectBestXI(candidates, formation);
    const rcb = result.slots.find((s) => s.slot === "RCB")?.candidate?.scoutasticPlayerId;
    const lcb = result.slots.find((s) => s.slot === "LCB")?.candidate?.scoutasticPlayerId;
    expect(rcb).not.toBe(lcb);
    expect([rcb, lcb].sort()).toEqual(["1", "2"]);
  });

  it("prefers a real matching raw-position side when one exists for a two-slot group", () => {
    const candidates = [
      candidate({ scoutasticPlayerId: "rb", positionGroup: "Fullback", rawPosition: "RIGHT_WINGBACK_DEFENDER", performanceScore: 60 }),
      candidate({ scoutasticPlayerId: "lb", positionGroup: "Fullback", rawPosition: "LEFT_WINGBACK_DEFENDER", performanceScore: 55 }),
    ];
    const result = selectBestXI(candidates, formation);
    expect(result.slots.find((s) => s.slot === "RB")?.candidate?.scoutasticPlayerId).toBe("rb");
    expect(result.slots.find((s) => s.slot === "LB")?.candidate?.scoutasticPlayerId).toBe("lb");
  });

  it("falls back to the next-best score when a two-slot group has no real side match for one slot", () => {
    // Only one real right-back and one extra fullback with no side data — both slots still get filled by score.
    const candidates = [
      candidate({ scoutasticPlayerId: "rb", positionGroup: "Fullback", rawPosition: "RIGHT_WINGBACK_DEFENDER", performanceScore: 70 }),
      candidate({ scoutasticPlayerId: "other", positionGroup: "Fullback", rawPosition: "RIGHT_WINGBACK_DEFENDER", performanceScore: 50 }),
    ];
    const result = selectBestXI(candidates, formation);
    const rb = result.slots.find((s) => s.slot === "RB")?.candidate?.scoutasticPlayerId;
    const lb = result.slots.find((s) => s.slot === "LB")?.candidate?.scoutasticPlayerId;
    expect([rb, lb].sort()).toEqual(["other", "rb"]);
  });

  it("leaves a slot empty (never fills with an ineligible player) when no real candidate exists for that position group", () => {
    const candidates = [candidate({ positionGroup: "Striker", performanceScore: 80 })];
    const result = selectBestXI(candidates, formation);
    const gk = result.slots.find((s) => s.slot === "GK");
    expect(gk?.candidate).toBeNull();
  });

  it("reports the real filled count, not always 11", () => {
    const candidates = [candidate({ positionGroup: "Striker" })];
    const result = selectBestXI(candidates, formation);
    expect(result.filledCount).toBe(1);
  });

  it("returns up to three real alternates per position group, excluding the selected player", () => {
    const candidates = Array.from({ length: 5 }, (_, i) =>
      candidate({ scoutasticPlayerId: String(i), positionGroup: "Striker", performanceScore: 100 - i })
    );
    const result = selectBestXI(candidates, formation);
    const st = result.slots.find((s) => s.slot === "ST");
    expect(st?.candidate?.scoutasticPlayerId).toBe("0");
    expect(st?.alternates.map((a) => a.scoutasticPlayerId)).toEqual(["1", "2", "3"]);
  });

  it("breaks a tied performance score by reliability, then by minutes", () => {
    const candidates = [
      candidate({ scoutasticPlayerId: "a", performanceScore: 70, reliability: 0.9, minutes: 1000 }),
      candidate({ scoutasticPlayerId: "b", performanceScore: 70, reliability: 0.9, minutes: 2000 }),
      candidate({ scoutasticPlayerId: "c", performanceScore: 70, reliability: 0.5, minutes: 3000 }),
    ];
    const result = selectBestXI(candidates, formation);
    expect(result.slots.find((s) => s.slot === "ST")?.candidate?.scoutasticPlayerId).toBe("b");
  });

  it("the 4-2-3-1 formation exposes exactly eleven slots to select for", () => {
    const result = selectBestXI([], formation);
    expect(result.slots).toHaveLength(11);
  });
});
