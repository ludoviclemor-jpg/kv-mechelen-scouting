import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { extractRatingRows } from "../sportmonksFieldMap.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadFixture(name) {
  return JSON.parse(readFileSync(path.join(__dirname, "fixtures", name), "utf-8"));
}

// Both fixtures are REAL Sportmonks API responses, captured live
// (2026-09-01) and trimmed to 3 lineup entries each — a rated starter, a
// rated substitute, and one genuinely unrated substitute — see
// docs/SPORTMONKS_INTEGRATION.md. No values below are invented.

describe("extractRatingRows — real Danish Superliga fixture (FC København vs Sønderjyske Fodbold)", () => {
  const fixture = loadFixture("sportmonks-danish-fixture.json");
  const rows = extractRatingRows(fixture, "Danish Superliga");

  it("extracts exactly the rated players, skipping the unrated substitute", () => {
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.playerName)).toEqual(["Felix Beijmo", "Asger Sörensen"]);
  });

  it("maps the real starter correctly", () => {
    const beijmo = rows.find((r) => r.playerName === "Felix Beijmo");
    expect(beijmo).toMatchObject({
      externalPlayerId: "192860",
      teamName: "FC København",
      opponent: "Sønderjyske Fodbold",
      homeAway: "home",
      starter: true,
      minutesPlayed: 90,
      rating: 6.94,
      fixtureId: "19713966",
      competitionId: "271",
      competitionName: "Danish Superliga",
      seasonId: "27897",
      matchDate: "2026-08-31",
    });
  });

  it("maps the real substitute correctly", () => {
    const sorensen = rows.find((r) => r.playerName === "Asger Sörensen");
    expect(sorensen).toMatchObject({
      externalPlayerId: "52750",
      starter: false,
      minutesPlayed: 29,
      rating: 6.55,
    });
  });
});

describe("extractRatingRows — real Scottish Premiership fixture (St. Mirren vs Motherwell)", () => {
  const fixture = loadFixture("sportmonks-scottish-fixture.json");
  const rows = extractRatingRows(fixture, "Scottish Premiership");

  it("extracts exactly the rated players", () => {
    expect(rows).toHaveLength(2);
  });

  it("maps a real Scottish Premiership starter correctly, including away side", () => {
    const paulsen = rows.find((r) => r.playerName === "Alex Paulsen");
    expect(paulsen).toMatchObject({
      externalPlayerId: "24469041",
      teamName: "Motherwell",
      opponent: "St. Mirren",
      homeAway: "away",
      starter: true,
      minutesPlayed: 90,
      rating: 7.35,
      competitionId: "501",
      competitionName: "Scottish Premiership",
    });
  });

  it("maps a real Scottish Premiership substitute correctly", () => {
    const odonnell = rows.find((r) => r.playerName === "Stephen O'Donnell");
    expect(odonnell).toMatchObject({
      starter: false,
      minutesPlayed: 44,
      rating: 6.91,
    });
  });
});

describe("extractRatingRows — defensive behaviour, never fabricates a rating", () => {
  it("returns an empty array for a fixture with no lineups", () => {
    expect(extractRatingRows({ id: 1, starting_at: "2026-01-01" }, "Test")).toEqual([]);
  });

  it("returns an empty array without a valid fixture id or date", () => {
    expect(extractRatingRows({ lineups: [] }, "Test")).toEqual([]);
  });

  it("skips a lineup entry with no rating detail rather than defaulting to 0", () => {
    const fixture = {
      id: 1,
      starting_at: "2026-01-01",
      participants: [
        { id: 1, name: "Home Team", meta: { location: "home" } },
        { id: 2, name: "Away Team", meta: { location: "away" } },
      ],
      lineups: [{ player_id: 999, player_name: "Unused Sub", team_id: 1, type_id: 12, details: [] }],
    };
    expect(extractRatingRows(fixture, "Test")).toEqual([]);
  });
});
