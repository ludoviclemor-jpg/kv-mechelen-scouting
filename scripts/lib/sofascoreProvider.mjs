/**
 * Centralized ratings data-access interface (module name is a historical
 * "SofaScore" label — see below).
 *
 * SofaScore itself has no legitimate public API — their own FAQ states:
 * "due to agreements with our data providers, we are unable to share the
 * data sources in the form of API endpoints" (confirmed 2026-08-30, see
 * docs/SOFASCORE_PROVIDER.md). Their only sanctioned integration route is
 * a media/corporate widget partnership (corporate.sofascore.com/widgets),
 * not a data feed suitable for this kind of matching/rating pipeline.
 * Direct (non-widget) requests to api.sofascore.com are also actively
 * blocked (403) from every network tested — residential, GitHub Actions,
 * and Anthropic's own infrastructure — confirmed directly, not assumed —
 * so this deliberately does not attempt to reach that host, and does not
 * attempt to bypass its bot protection (explicit product decision, not a
 * technical limitation — see docs/SOFASCORE_PROVIDER.md).
 *
 * The active implementation is **API-Football** (api-sports.io) instead —
 * a real, licensed API with a genuine `rating` field — see
 * apiFootballProvider.mjs. This module/interface predates that choice and
 * kept its original name; treat "SofaScore" in these filenames as a
 * historical label for "the ratings provider slot", not a live claim.
 *
 * This module exists so the rest of the app never has to change once a
 * legitimate provider (a licensed data feed, a different real ratings
 * source, SofaScore's own partner program, etc.) becomes available —
 * every consumer (the sync script, and indirectly the frontend via
 * data/players.json) only ever depends on this interface, never on a
 * specific vendor's API shape.
 *
 * @typedef {Object} SofaScorePlayerQuery
 * @property {string} name
 * @property {string|null} dateOfBirth - ISO date, when known
 * @property {string|null} nationality - when known
 * @property {string|null} club - current club, when known
 *
 * @typedef {Object} SofaScoreMatchResult
 * @property {"matched"|"ambiguous"|"not_found"} status
 * @property {string|null} sofascorePlayerId
 * @property {number|null} confidence - 0-1, only set when status is "matched"
 * @property {string|null} reason - human-readable explanation, esp. for "ambiguous"
 *
 * @typedef {Object} SofaScoreMatchRow
 * @property {string} date - ISO date
 * @property {string} competition
 * @property {string} opponent
 * @property {string} result
 * @property {number} minutes
 * @property {boolean} starter
 * @property {number|null} rating
 *
 * @typedef {Object} SofaScoreProvider
 * @property {(query: SofaScorePlayerQuery) => Promise<SofaScoreMatchResult>} findPlayer
 * @property {(sofascorePlayerId: string) => Promise<object|null>} getPlayerProfile
 * @property {(sofascorePlayerId: string, count: number) => Promise<object[]>} getRecentMatches
 * @property {(sofascorePlayerId: string, eventId: string) => Promise<object|null>} getMatchPlayerStatistics
 * @property {(sofascorePlayerId: string, count?: number) => Promise<{ ratings: SofaScoreMatchRow[], average: number|null, highest: number|null, lowest: number|null }>} getLastFiveRatings
 * @property {() => boolean} isConfigured
 */

/**
 * The only implementation today. Every method returns "no data" instantly
 * — no network calls — so running the sync against it is always safe and
 * fast; it exists so the rest of the pipeline (matching orchestration,
 * batching, storage) can be built and tested end-to-end before a real
 * provider exists.
 * @returns {SofaScoreProvider}
 */
function createNullProvider() {
  return {
    isConfigured: () => false,
    async findPlayer() {
      return { status: "not_found", sofascorePlayerId: null, confidence: null, reason: "no SofaScore provider configured" };
    },
    async getPlayerProfile() {
      return null;
    },
    async getRecentMatches() {
      return [];
    },
    async getMatchPlayerStatistics() {
      return null;
    },
    async getLastFiveRatings() {
      return { ratings: [], average: null, highest: null, lowest: null };
    },
  };
}

/**
 * Selects a provider by name (SOFASCORE_PROVIDER env var). Only "null" is
 * implemented today. Extend this — never the callers — when a real
 * provider becomes available.
 * @returns {SofaScoreProvider}
 */
export async function getSofaScoreProvider(providerName = process.env.SOFASCORE_PROVIDER) {
  const name = (providerName || "null").toLowerCase();
  if (name === "null" || name === "none" || name === "") {
    return createNullProvider();
  }
  if (name === "api-football") {
    const { createApiFootballProvider } = await import("./apiFootballProvider.mjs");
    return createApiFootballProvider();
  }
  throw new Error(
    `SOFASCORE_PROVIDER="${providerName}" is not implemented. Only "null" and "api-football" exist today — ` +
      `see docs/SOFASCORE_PROVIDER.md for how to add another provider.`
  );
}
