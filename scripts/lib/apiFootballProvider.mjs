/**
 * API-Football (api-sports.io) ratings provider — a real, licensed
 * implementation of the SofaScoreProvider interface (see
 * sofascoreProvider.mjs; the interface predates this provider and stayed
 * generic on purpose — "SofaScore" in that filename is now a historical
 * label for "the ratings provider slot", not a claim about which vendor
 * is active).
 *
 * Confirmed via official docs/support content (not guessed):
 *   Base URL: https://v3.football.api-sports.io
 *   Auth:     x-apisports-key: <key>   (direct API-Sports key, NOT the
 *             RapidAPI path — that uses a different host + header pair;
 *             if the key turns out to be a RapidAPI key instead, this
 *             needs API_FOOTBALL_BASE_URL overriding)
 *   GET /players?search=|team=&season=|id=&season=   — player lookup,
 *       20 results/page, `search` needs >= 3 characters
 *   GET /fixtures?team=&last=N                        — a team's most
 *       recent N fixtures
 *   GET /fixtures/players?fixture=                    — every player's
 *       stats for one fixture, including a numeric `rating` field
 *
 * NOT confirmed against a real response yet (no key exists to test
 * with) — verify with `node scripts/sync-sofascore.mjs --inspect-player`
 * before trusting the full sync, exactly like SCOUTASTIC was verified:
 *   - Exact JSON path to `rating` inside /fixtures/players (best-effort
 *     guess below: response[].players[].statistics[].games.rating)
 *   - Whether /players search reliably finds lower-league Eastern
 *     European players — API-Football's depth varies a lot by league,
 *     richest for the "top five", possibly partial for smaller ones
 *   - Real per-player request count (design assumes ~10-12: 1 search +
 *     1 team-fixtures + up to ~8 per-fixture lookups to find 5 games
 *     the player actually appears in — there is no confirmed "last N
 *     fixtures for this specific player" shortcut, only team-level)
 *
 * Rate limit: enforced here, not just documented — see MAX_REQUESTS_PER_RUN.
 */

import { resolveMatch } from "./sofascoreMatching.mjs";

const DEFAULT_BASE_URL = "https://v3.football.api-sports.io";
const CURRENT_SEASON = new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1; // European season convention: Jul-Jun

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createApiFootballProvider() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  const baseUrl = process.env.API_FOOTBALL_BASE_URL || DEFAULT_BASE_URL;
  const configured = Boolean(apiKey);

  // Hard per-process budget so a bug can never blow through the free
  // tier's 100/day limit in one run — separate from and in addition to
  // whatever --batch-size the sync script is given.
  const MAX_REQUESTS_PER_RUN = Number(process.env.API_FOOTBALL_MAX_REQUESTS_PER_RUN || 90);
  let requestCount = 0;

  async function apiGet(path, params, { retries = 3 } = {}) {
    if (requestCount >= MAX_REQUESTS_PER_RUN) {
      throw new Error(`API-Football request budget exhausted for this run (${MAX_REQUESTS_PER_RUN} requests)`);
    }
    const url = new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
    for (const [k, v] of Object.entries(params ?? {})) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }

    let lastError = null;
    for (let attempt = 1; attempt <= retries; attempt++) {
      requestCount++;
      try {
        const res = await fetch(url, { headers: { "x-apisports-key": apiKey } });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.errors) ? data.errors.length > 0 : data.errors && Object.keys(data.errors).length > 0) {
            throw new Error(`API-Football error: ${JSON.stringify(data.errors)}`);
          }
          return data;
        }
        if ([429, 500, 502, 503, 504].includes(res.status) && attempt < retries) {
          const wait = Math.min(2 ** attempt, 20) * 1000;
          console.error(`  [retry] ${url.pathname} status=${res.status}, waiting ${wait}ms (attempt ${attempt}/${retries})`);
          await sleep(wait);
          continue;
        }
        lastError = `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`;
        break;
      } catch (err) {
        lastError = String(err);
        if (attempt < retries) await sleep(Math.min(2 ** attempt, 20) * 1000);
      }
    }
    throw new Error(`API-Football request failed: ${lastError}`);
  }

  /** Finds candidate players by name via /players?search=. */
  async function searchCandidates(name) {
    if (!name || name.trim().length < 3) return [];
    const data = await apiGet("/players", { search: name.trim(), season: CURRENT_SEASON });
    return (data.response ?? []).map((row) => ({
      id: String(row.player.id),
      name: row.player.name,
      dateOfBirth: row.player.birth?.date ?? null,
      nationality: row.player.nationality ?? null,
      club: row.statistics?.[0]?.team?.name ?? null,
      _apiFootballTeamId: row.statistics?.[0]?.team?.id ?? null,
    }));
  }

  async function findPlayer(query) {
    if (!configured) return { status: "not_found", sofascorePlayerId: null, confidence: null, reason: "API_FOOTBALL_KEY not set" };
    const candidates = await searchCandidates(query.name);
    const result = resolveMatch(query, candidates);
    return {
      status: result.status,
      sofascorePlayerId: result.best ? result.best.id : null,
      confidence: result.confidence,
      reason: result.reason,
      // stashed for getLastFiveRatings, which needs the player's current team id
      _teamId: result.best?._apiFootballTeamId ?? null,
    };
  }

  async function getPlayerProfile(playerId) {
    if (!configured) return null;
    const data = await apiGet("/players", { id: playerId, season: CURRENT_SEASON });
    return data.response?.[0] ?? null;
  }

  /** A team's recent fixtures — the API is team-centric, not player-centric, for this. */
  async function getRecentMatches(teamId, count = 10) {
    if (!configured || !teamId) return [];
    const data = await apiGet("/fixtures", { team: teamId, last: count });
    return data.response ?? [];
  }

  async function getMatchPlayerStatistics(playerId, fixtureId) {
    if (!configured) return null;
    const data = await apiGet("/fixtures/players", { fixture: fixtureId });
    for (const team of data.response ?? []) {
      const row = team.players?.find((p) => String(p.player.id) === String(playerId));
      if (row) return row;
    }
    return null;
  }

  /**
   * Walks a player's team's recent fixtures, pulling per-fixture stats
   * until 5 games with an actual rating are found (or fixtures run out).
   * `teamId` comes from the matched candidate's current club — pass it
   * via the object findPlayer() returned.
   */
  async function getLastFiveRatings(playerId, teamId) {
    const empty = { ratings: [], average: null, highest: null, lowest: null };
    if (!configured || !teamId) return empty;

    const fixtures = await getRecentMatches(teamId, 10);
    const ratings = [];

    for (const fx of fixtures) {
      if (ratings.length >= 5) break;
      let stats;
      try {
        stats = await getMatchPlayerStatistics(playerId, fx.fixture.id);
      } catch {
        continue; // one bad fixture lookup shouldn't sink the whole player
      }
      const gameStats = stats?.statistics?.[0]?.games;
      if (!gameStats || gameStats.minutes === null) continue; // didn't play

      const isHome = fx.teams.home.id === Number(teamId);
      ratings.push({
        date: fx.fixture.date?.slice(0, 10) ?? null,
        competition: fx.league?.name ?? null,
        opponent: isHome ? fx.teams.away.name : fx.teams.home.name,
        result: `${fx.goals.home}-${fx.goals.away} ${
          fx.teams.home.winner === true ? "W" : fx.teams.home.winner === false ? "L" : "D"
        }`,
        minutes: gameStats.minutes ?? 0,
        starter: Boolean(gameStats.substitute === false),
        rating: gameStats.rating !== null && gameStats.rating !== undefined ? Number(gameStats.rating) : null,
      });
    }

    const numeric = ratings.map((r) => r.rating).filter((r) => r !== null);
    return {
      ratings,
      average: numeric.length ? Math.round((numeric.reduce((a, b) => a + b, 0) / numeric.length) * 100) / 100 : null,
      highest: numeric.length ? Math.max(...numeric) : null,
      lowest: numeric.length ? Math.min(...numeric) : null,
    };
  }

  return {
    isConfigured: () => configured,
    findPlayer,
    getPlayerProfile,
    getRecentMatches,
    getMatchPlayerStatistics,
    getLastFiveRatings,
    getRequestCount: () => requestCount,
  };
}
