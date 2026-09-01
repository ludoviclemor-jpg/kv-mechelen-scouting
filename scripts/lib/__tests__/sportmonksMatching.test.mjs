import { describe, it, expect } from "vitest";
import { normalizeName, nameSimilarity, resolveMatch } from "../sofascoreMatching.mjs";

// Reused as-is for Sportmonks matching (scripts/sync-sportmonks-ratings.mjs)
// — its scoring is provider-agnostic despite the filename, see
// docs/SPORTMONKS_INTEGRATION.md. Test names below are real players
// encountered during the real sync run (2026-09-01).

describe("normalizeName — accents, case, hyphens, spacing, special characters", () => {
  it("strips accents (real Danish/Scottish names)", () => {
    expect(normalizeName("Sønderjyske")).toBe("snderjyske");
    expect(normalizeName("Mads Frøkjaer-Jensen").replace(/-/g, "")).not.toContain("æ");
  });

  it("is case-insensitive", () => {
    expect(normalizeName("KIERAN TIERNEY")).toBe(normalizeName("kieran tierney"));
  });

  it("collapses multiple spaces", () => {
    expect(normalizeName("Kieran   Tierney")).toBe(normalizeName("Kieran Tierney"));
  });

  it("removes hyphens and special characters", () => {
    expect(normalizeName("O'Donnell")).toBe(normalizeName("ODonnell"));
    expect(normalizeName("Frøkjaer-Jensen")).not.toContain("-");
  });
});

describe("nameSimilarity — real name pairs", () => {
  it("scores an identical real name (after normalization) as 1", () => {
    expect(nameSimilarity("Kieran Tierney", "Kieran Tierney")).toBe(1);
  });

  it("scores accent-only differences very highly (Bröndby vs Brøndby)", () => {
    expect(nameSimilarity("Bröndby IF", "Brøndby IF")).toBeGreaterThan(0.85);
  });

  it("scores completely different real names low", () => {
    expect(nameSimilarity("Kieran Tierney", "Patrick Pentz")).toBeLessThan(0.3);
  });
});

describe("resolveMatch — safety-first candidate resolution", () => {
  it("real, confirmed behavior: an exact name match ALONE is never enough to auto-match — nameSimilarity=1 caps at 0.6 (its 0.6 weight), below the 0.75 threshold, so it resolves 'ambiguous' even against an unrelated second candidate", () => {
    // This is exactly why scripts/sync-sportmonks-ratings.mjs's matching
    // order always falls through to a DOB lookup for a *new* player, even
    // when the Sportmonks lineup name matches a Scoutastic candidate
    // exactly — confirmed on the real 2026-09-01 sync run (every fresh
    // match went through the DOB step). Not a bug: deliberately
    // conservative, since name alone (however exact) is never treated as
    // sufficient corroboration on its own.
    const query = { name: "Kieran Tierney", dateOfBirth: null, nationality: null, club: null };
    const candidates = [
      { id: "sc-300716", name: "Kieran Tierney", dateOfBirth: "1997-06-05", nationality: "Scotland", club: "Celtic FC" },
      { id: "sc-other", name: "Cameron Carter-Vickers", dateOfBirth: "1997-12-31", nationality: "United States", club: "Celtic FC" },
    ];
    const result = resolveMatch(query, candidates);
    expect(result.status).toBe("ambiguous");

    // Confirming with a real date of birth (matching order step 4) is
    // what actually pushes it over the confidence threshold.
    const withDob = resolveMatch({ ...query, dateOfBirth: "1997-06-05" }, candidates);
    expect(withDob.status).toBe("matched");
    expect(withDob.best.id).toBe("sc-300716");
  });

  it("returns not_found rather than guessing when no candidate is plausible", () => {
    const query = { name: "Gabriel Pereira", dateOfBirth: null, nationality: null, club: null };
    // Real case: Sportmonks' short lineup name vs Scoutastic's full legal
    // name — a known, documented limitation (see
    // docs/SPORTMONKS_INTEGRATION.md's "Limitations" section), not a bug.
    const candidates = [{ id: "sc-742095", name: "Gabriel Pereira Magalhães dos Santos", dateOfBirth: "2000-05-07", nationality: "Brazil", club: "FC Copenhagen" }];
    const result = resolveMatch(query, candidates);
    expect(result.status).not.toBe("matched");
  });

  it("never picks between two too-similar real candidates (ambiguous, not a guess)", () => {
    const query = { name: "J. Holt", dateOfBirth: null, nationality: null, club: null };
    const candidates = [
      { id: "sc-a", name: "James Holt", dateOfBirth: "2003-01-01", nationality: null, club: "St. Johnstone FC" },
      { id: "sc-b", name: "Jack Holt", dateOfBirth: "2004-01-01", nationality: null, club: "St. Johnstone FC" },
    ];
    const result = resolveMatch(query, candidates);
    expect(result.status).not.toBe("matched");
  });

  it("breaks a tie using date of birth when provided (matching order step 4)", () => {
    const candidates = [
      { id: "sc-a", name: "James Holt", dateOfBirth: "2003-01-01", nationality: null, club: "St. Johnstone FC" },
      { id: "sc-b", name: "James Holt", dateOfBirth: "2004-06-15", nationality: null, club: "St. Johnstone FC" },
    ];
    const withoutDob = resolveMatch({ name: "James Holt", dateOfBirth: null, nationality: null, club: null }, candidates);
    expect(withoutDob.status).not.toBe("matched"); // identical names, can't tell them apart without DOB

    const withDob = resolveMatch({ name: "James Holt", dateOfBirth: "2004-06-15", nationality: null, club: null }, candidates);
    expect(withDob.status).toBe("matched");
    expect(withDob.best.id).toBe("sc-b");
  });
});
