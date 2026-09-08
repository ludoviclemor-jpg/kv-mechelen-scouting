import { describe, it, expect } from "vitest";
import { filtersToSearchParams, searchParamsToFilters } from "../playersFilterUrl";

describe("players filter <-> URL round trip", () => {
  it("restores a full filter set exactly (e.g. after opening a player and returning)", () => {
    const original = {
      search: "Diaby",
      position: "CB",
      nationality: "Belgium",
      country: "France",
      competitionId: "FR1",
      club: "RC Lens",
      ageMin: 18,
      ageMax: 24,
      valueMinEUR: 500_000,
      valueMaxEUR: 2_000_000,
      contractPreset: "12",
      sortKey: "age" as const,
      sortDirection: "asc" as const,
      page: 3,
    };
    const params = filtersToSearchParams(original);
    const restored = searchParamsToFilters(params);
    expect(restored).toEqual(original);
  });

  it("writes nothing to the URL for an all-default filter state", () => {
    const params = filtersToSearchParams({});
    expect(params.toString()).toBe("");
  });

  it("omits default sort/page/'all' values so the URL stays clean", () => {
    const params = filtersToSearchParams({
      position: "all",
      sortKey: "marketValueEUR",
      sortDirection: "desc",
      page: 1,
    });
    expect(params.toString()).toBe("");
  });

  it("round-trips an empty query string to an empty-ish filter object (nulls for numeric ranges)", () => {
    const restored = searchParamsToFilters(new URLSearchParams(""));
    expect(restored.ageMin).toBeNull();
    expect(restored.ageMax).toBeNull();
    expect(restored.valueMinEUR).toBeNull();
    expect(restored.valueMaxEUR).toBeNull();
    expect(restored.search).toBeUndefined();
  });
});
