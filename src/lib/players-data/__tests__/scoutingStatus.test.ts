import { describe, it, expect } from "vitest";
import { SCOUTING_STATUSES, ACTIVE_SCOUTING_STATUSES, STATUS_LABELS } from "../constants";

describe("scouting status pipeline", () => {
  it("has exactly 10 unique stages, each with a label", () => {
    expect(new Set(SCOUTING_STATUSES).size).toBe(10);
    for (const status of SCOUTING_STATUSES) {
      expect(STATUS_LABELS[status]).toBeTruthy();
    }
  });

  it("excludes the terminal exits and the unwatched default from 'actively scouted'", () => {
    expect(ACTIVE_SCOUTING_STATUSES).not.toContain("unwatched");
    expect(ACTIVE_SCOUTING_STATUSES).not.toContain("rejected");
    expect(ACTIVE_SCOUTING_STATUSES).not.toContain("signed");
  });

  it("keeps every active status a real member of the full pipeline", () => {
    for (const status of ACTIVE_SCOUTING_STATUSES) {
      expect(SCOUTING_STATUSES).toContain(status);
    }
  });
});
