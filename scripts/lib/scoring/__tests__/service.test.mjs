import { describe, it, expect } from "vitest";
import { scorePlayer } from "../service.mjs";

/** Builds a synthetic cohort of N central-midfielder rows with a spread of realistic stat levels, so percentile ranking has something real to work against. */
function buildCohortPool(n, { iterationId = 100, competitionName = "Test League", season = "25/26" } = {}) {
  const pool = [];
  for (let i = 0; i < n; i++) {
    const level = i / (n - 1); // 0..1 spread across the cohort
    pool.push({
      playerId: 1000 + i,
      name: `Peer ${i}`,
      position: "CENTRAL_MIDFIELD",
      birthdate: "1998-01-01",
      minutes: 1500,
      iterationId,
      competitionName,
      season,
      kpis: {
        GOALS: Math.round(2 + level * 6),
        ASSISTS: Math.round(1 + level * 5),
        BYPASSED_OPPONENTS: Math.round(100 + level * 200),
        BYPASSED_DEFENDERS: Math.round(20 + level * 60),
        PACKING_XG: Math.round((1 + level * 5) * 10) / 10,
        SHOT_XG: Math.round((1 + level * 4) * 10) / 10,
        WON_GROUND_DUELS: Math.round(40 + level * 40),
        LOST_GROUND_DUELS: Math.round(60 - level * 30),
        WON_AERIAL_DUELS: Math.round(10 + level * 10),
        LOST_AERIAL_DUELS: Math.round(15 - level * 5),
        BALL_WIN_REMOVED_OPPONENTS: Math.round(30 + level * 40),
        BALL_LOSS_REMOVED_TEAMMATES: Math.round(50 - level * 20),
      },
    });
  }
  return pool;
}

const tierMap = new Map([[100, "top"]]);

function starPlayer(overrides = {}) {
  return {
    playerId: 999,
    name: "Test Star",
    position: "CENTRAL_MIDFIELD",
    birthdate: "2005-01-01", // young
    minutes: 1800,
    iterationId: 100,
    competitionName: "Test League",
    season: "25/26",
    kpis: {
      GOALS: 8,
      ASSISTS: 6,
      BYPASSED_OPPONENTS: 300,
      BYPASSED_DEFENDERS: 80,
      PACKING_XG: 6.5,
      SHOT_XG: 5.5,
      WON_GROUND_DUELS: 80,
      LOST_GROUND_DUELS: 30,
      WON_AERIAL_DUELS: 20,
      LOST_AERIAL_DUELS: 10,
      BALL_WIN_REMOVED_OPPONENTS: 70,
      BALL_LOSS_REMOVED_TEAMMATES: 30,
    },
    ...overrides,
  };
}

describe("scorePlayer — score bounds and determinism", () => {
  it("keeps Current Level and Potential within 0-100", () => {
    const pool = buildCohortPool(30);
    const result = scorePlayer({ player: starPlayer(), pool, competitionTierByIterationId: tierMap });
    expect(result.currentLevel).toBeGreaterThanOrEqual(0);
    expect(result.currentLevel).toBeLessThanOrEqual(100);
    expect(result.potential).toBeGreaterThanOrEqual(0);
    expect(result.potential).toBeLessThanOrEqual(100);
  });

  it("never returns a Potential below Current Level", () => {
    const pool = buildCohortPool(30);
    const result = scorePlayer({ player: starPlayer(), pool, competitionTierByIterationId: tierMap });
    expect(result.potential).toBeGreaterThanOrEqual(result.currentLevel);
  });

  it("is fully deterministic — identical input twice gives an identical result", () => {
    const pool = buildCohortPool(30);
    const a = scorePlayer({ player: starPlayer(), pool, competitionTierByIterationId: tierMap });
    const b = scorePlayer({ player: starPlayer(), pool, competitionTierByIterationId: tierMap });
    // calculatedAt legitimately differs (real wall-clock) — everything else must match exactly.
    function omitCalculatedAt(result) {
      const copy = { ...result };
      delete copy.calculatedAt;
      return copy;
    }
    expect(omitCalculatedAt(a)).toEqual(omitCalculatedAt(b));
  });

  it("serializes cleanly to JSON and back with no loss", () => {
    const pool = buildCohortPool(30);
    const result = scorePlayer({ player: starPlayer(), pool, competitionTierByIterationId: tierMap });
    const roundTripped = JSON.parse(JSON.stringify(result));
    expect(roundTripped).toEqual(result);
  });
});

describe("scorePlayer — minutes and sample size", () => {
  it("refuses to rate a player below the minimum-minutes threshold", () => {
    const pool = buildCohortPool(30);
    const result = scorePlayer({ player: starPlayer({ minutes: 50 }), pool, competitionTierByIterationId: tierMap });
    expect(result.ratable).toBe(false);
    expect(result.currentLevel).toBeNull();
    expect(result.reason).toMatch(/minutes/i);
  });

  it("refuses to rate a player with zero minutes", () => {
    const pool = buildCohortPool(30);
    const result = scorePlayer({ player: starPlayer({ minutes: 0 }), pool, competitionTierByIterationId: tierMap });
    expect(result.ratable).toBe(false);
  });

  it("shrinks a low-minutes player's Current Level closer to the cohort average than an identical high-minutes player with the SAME per-90 rate", () => {
    const pool = buildCohortPool(30);
    // Scale raw totals with minutes so the per-90 *rate* (and therefore the raw percentile) is identical either way — isolating reliability/shrinkage as the only real difference, not a per-90 artifact of holding totals fixed while changing minutes.
    const scaleKpis = (kpis, factor) => Object.fromEntries(Object.entries(kpis).map(([k, v]) => [k, Math.round(v * factor)]));
    const base = starPlayer();
    const low = scorePlayer({
      player: starPlayer({ minutes: 300, kpis: scaleKpis(base.kpis, 300 / 1800) }),
      pool,
      competitionTierByIterationId: tierMap,
    });
    const high = scorePlayer({
      player: starPlayer({ minutes: 3000, kpis: scaleKpis(base.kpis, 3000 / 1800) }),
      pool,
      competitionTierByIterationId: tierMap,
    });
    // Both have the same underlying rate and outperform the cohort, but the low-minutes version should be pulled further toward 50 by shrinkage.
    expect(Math.abs(low.currentLevel - 50)).toBeLessThan(Math.abs(high.currentLevel - 50));
  });
});

describe("scorePlayer — unsupported positions", () => {
  it("marks goalkeepers as not ratable, never a fabricated score", () => {
    const pool = buildCohortPool(30);
    const gk = starPlayer({ position: "GOALKEEPER" });
    const result = scorePlayer({ player: gk, pool, competitionTierByIterationId: tierMap });
    expect(result.ratable).toBe(false);
    expect(result.currentLevel).toBeNull();
    expect(result.reason).toMatch(/goalkeeper/i);
  });
});

describe("scorePlayer — cohort fallback", () => {
  it("falls back and warns when the narrow cohort is too small", () => {
    const smallPool = buildCohortPool(5); // below MIN_COHORT_SIZE
    const broaderPool = [...smallPool, ...buildCohortPool(20, { iterationId: 200, competitionName: "Other League" })];
    const result = scorePlayer({ player: starPlayer(), pool: broaderPool, competitionTierByIterationId: tierMap });
    expect(result.context.cohortLevel).not.toBe("position+competition+season");
    expect(result.warnings.some((w) => w.toLowerCase().includes("cohort fallback"))).toBe(true);
  });
});

describe("scorePlayer — competition calibration", () => {
  it("calibrates the same underlying performance lower in an unconfigured (weaker-default) competition", () => {
    const strongPool = buildCohortPool(30, { iterationId: 100, competitionName: "Jupiler Pro League" });
    const weakPool = buildCohortPool(30, { iterationId: 300, competitionName: "Some Unlisted League" });
    const inStrong = scorePlayer({
      player: starPlayer({ competitionName: "Jupiler Pro League", iterationId: 100 }),
      pool: strongPool,
      competitionTierByIterationId: tierMap,
    });
    const inWeak = scorePlayer({
      player: starPlayer({ competitionName: "Some Unlisted League", iterationId: 300 }),
      pool: weakPool,
      competitionTierByIterationId: tierMap,
    });
    expect(inWeak.currentLevel).toBeLessThan(inStrong.currentLevel);
    expect(inWeak.warnings.some((w) => w.toLowerCase().includes("provisional default"))).toBe(true);
  });
});

describe("scorePlayer — incomplete data", () => {
  it("still produces a rating from partial data, with reduced data completeness and a warning", () => {
    const pool = buildCohortPool(30);
    const sparsePlayer = starPlayer({ kpis: { BYPASSED_OPPONENTS: 150 } }); // only one of several used metrics present
    const result = scorePlayer({ player: sparsePlayer, pool, competitionTierByIterationId: tierMap });
    expect(result.ratable).toBe(true);
    const dataCompleteWarning = result.warnings.find((w) => w.includes("%"));
    expect(dataCompleteWarning).toBeDefined();
  });
});

describe("scorePlayer — strengths/weaknesses/explanation", () => {
  it("generates a non-empty, real explanation string grounded in the actual pillar results", () => {
    const pool = buildCohortPool(30);
    const result = scorePlayer({ player: starPlayer(), pool, competitionTierByIterationId: tierMap });
    expect(typeof result.explanation).toBe("string");
    expect(result.explanation.length).toBeGreaterThan(20);
    expect(result.explanation).toContain(String(result.currentLevel));
  });

  it("only calls a pillar a strength when its underlying reliability clears the configured minimum", () => {
    const pool = buildCohortPool(30);
    const result = scorePlayer({ player: starPlayer({ minutes: 280 }), pool, competitionTierByIterationId: tierMap }); // just above the ratable floor, low reliability
    for (const s of result.strengths) {
      const pillar = result.pillars.find((p) => p.key === s.pillar);
      expect(pillar.reliability).toBeGreaterThanOrEqual(0.55);
    }
  });
});
