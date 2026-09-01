import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { extractRatingRows } from "../sportmonksFieldMap.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadFixture(name) {
  return JSON.parse(readFileSync(path.join(__dirname, "fixtures", name), "utf-8"));
}

/**
 * The real duplicate guard lives in Postgres — a unique constraint on
 * (fixture_id, external_player_id, provider) in player_match_ratings
 * (db/schema.sql), with every write going through `.upsert(...,
 * {onConflict: "fixture_id,external_player_id,provider"})`
 * (scripts/sync-sportmonks-ratings.mjs) — a re-run of the sync for the
 * same fixture updates the existing row instead of inserting a second
 * one. This test covers the layer above that constraint: extraction
 * itself must never even produce two rows sharing a (fixtureId,
 * externalPlayerId) key for one fixture in the first place.
 */
describe("extractRatingRows — no duplicate (fixtureId, externalPlayerId) pairs within one fixture", () => {
  it.each(["sportmonks-danish-fixture.json", "sportmonks-scottish-fixture.json"])("%s", (fixtureFile) => {
    const rows = extractRatingRows(loadFixture(fixtureFile), "Test League");
    const keys = rows.map((r) => `${r.fixtureId}:${r.externalPlayerId}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("running extraction twice on the same fixture produces identical rows (idempotent, safe to upsert repeatedly)", () => {
    const fixture = loadFixture("sportmonks-danish-fixture.json");
    const first = extractRatingRows(fixture, "Danish Superliga");
    const second = extractRatingRows(fixture, "Danish Superliga");
    expect(second).toEqual(first);
  });
});
