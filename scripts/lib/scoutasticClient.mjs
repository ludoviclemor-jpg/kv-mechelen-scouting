/**
 * Low-level SCOUTASTIC API client.
 *
 * Every detail here (base URL shape, auth header, endpoint paths, param
 * names, response shapes) is confirmed directly against the real API —
 * nothing here is guessed. See docs/SCOUTASTIC_SYNC.md for what's
 * confirmed vs. still unverified.
 *
 * Confirmed endpoints:
 *   GET /player?externalId=...        -> one player, full detail. The
 *     player's own stable id is `transfermarktId` (there is no
 *     `externalId` field on the player object itself — that's only the
 *     query param name and a field on nested `teams[]` entries).
 *   GET /competitions/{id}/teams?...  -> a full competition object; the
 *     `teamIds` field is a flat array matching `teams[].externalId`.
 *   GET /players?teamId=...&...       -> a Mongoose-paginate wrapper
 *     (`{ docs, totalPages, page, hasNextPage, nextPage, ... }`), not a
 *     bare array — fetchTeamPlayers() walks every page.
 *
 * Auth: `Authorization: <api_key>` header — the raw key, NOT "Bearer <key>".
 */

const DEFAULT_TIMEOUT_MS = 15_000;

export function baseUrl(subdomain) {
  return `https://${subdomain}.scoutastic.com/api/v1`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * GET url+params, retrying on 429/5xx/timeout with exponential backoff.
 * Returns { ok: true, data } on success, or { ok: false, error, status }
 * after retries are exhausted — callers must handle failure explicitly,
 * never silently treat it as "empty".
 */
export async function apiGet(url, params, apiKey, { retries = 3, timeoutMs = DEFAULT_TIMEOUT_MS, onRetry } = {}) {
  const fullUrl = new URL(url);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null) fullUrl.searchParams.set(key, String(value));
  }

  let lastError = null;
  let lastStatus = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(fullUrl, {
        headers: { accept: "application/json", Authorization: apiKey },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        return { ok: true, data: await res.json() };
      }

      lastStatus = res.status;
      const bodyText = await res.text().catch(() => "");
      lastError = `HTTP ${res.status}: ${bodyText.slice(0, 200)}`;

      if ([429, 500, 502, 503, 504].includes(res.status) && attempt < retries) {
        const wait = Math.min(2 ** attempt, 30) * 1000;
        onRetry?.({ url: fullUrl.toString(), status: res.status, attempt, retries, waitMs: wait });
        await sleep(wait);
        continue;
      }
      break; // non-retryable status (e.g. 401, 404) — fail immediately
    } catch (err) {
      clearTimeout(timeout);
      lastError = err.name === "AbortError" ? `Timeout after ${timeoutMs}ms` : String(err);
      lastStatus = null;
      if (attempt < retries) {
        const wait = Math.min(2 ** attempt, 30) * 1000;
        onRetry?.({ url: fullUrl.toString(), status: "network-error", attempt, retries, waitMs: wait });
        await sleep(wait);
        continue;
      }
    }
  }

  return { ok: false, error: lastError, status: lastStatus };
}

export async function fetchPlayer(apiBase, apiKey, externalId, { gender = "male", retries, onRetry } = {}) {
  return apiGet(
    `${apiBase}/player`,
    {
      externalId,
      gender,
      marketValues: "true",
      performanceData: "false",
      performanceSummary: "true", // confirmed available — powers appearances/minutes/goals/assists
      performanceHistory: "false", // match-by-match detail — not consumed yet (Phase 4/SofaScore territory)
      debuts: "false",
      injuryData: "false",
      includeMissedMatches: "false",
    },
    apiKey,
    { retries, onRetry }
  );
}

/**
 * Confirmed real shape: a full competition object (name, area, teams[],
 * etc.), not a bare `{ teamIds }` — but it also carries a flat `teamIds`
 * array that matches `teams[].externalId` exactly, which is what this
 * returns.
 */
export async function fetchCompetitionTeams(apiBase, apiKey, competitionId, { gender = "male", retries, onRetry } = {}) {
  const result = await apiGet(`${apiBase}/competitions/${competitionId}/teams`, { gender }, apiKey, { retries, onRetry });
  if (!result.ok) return result;
  const raw = result.data;
  const teamIds = Array.isArray(raw) ? raw : raw?.teamIds ?? null;
  if (teamIds === null) {
    return { ok: false, error: `Unrecognized /competitions/${competitionId}/teams response shape`, status: null };
  }
  return { ok: true, data: teamIds };
}

/**
 * GET /competitions (no id) — confirmed real, bare endpoint listing every
 * competition SCOUTASTIC knows about (2,439 at last count), not scoped to
 * any club. Same Mongoose-paginate wrapper shape as fetchTeamPlayers.
 *
 * Confirmed real per-competition fields (see docs/COMPETITIONS.md for the
 * full confirmed shape and a real sample): `transfermarktId` (the stable
 * competition code, matches what `fetchCompetitionTeams`/the rest of this
 * project calls `competitionId`), `name`, `area` (country/region name, no
 * separate id field exists), `association` (confederation code, e.g.
 * "UEFA"), `gender`, `ageCategory`, `isActive`, `level` + `levelDefinition`
 * (SCOUTASTIC's own combined tier/type label — not split into separate
 * fields, so this project doesn't invent that split either),
 * `imageUrl`/`imageUrlV2`, `availableSeasons`, `season`, `startDate`,
 * `endDate`, and — importantly — `teamIds`: the competition's team list is
 * included inline here, so discovering every competition AND every
 * competition's teams costs ~25 requests total (at limit=100), not one
 * request per competition.
 */
export async function fetchAllCompetitions(apiBase, apiKey, { limit = 100, retries, onRetry } = {}) {
  const all = [];
  let page = 1;

  while (true) {
    const result = await apiGet(`${apiBase}/competitions`, { page, limit }, apiKey, { retries, onRetry });
    if (!result.ok) return all.length > 0 ? { ok: true, data: all, partial: true, error: result.error } : result;

    const raw = result.data;
    const pageDocs = Array.isArray(raw?.docs) ? raw.docs : null;
    if (pageDocs === null) {
      return { ok: false, error: `Unrecognized /competitions response shape: ${JSON.stringify(Object.keys(raw ?? {}))}`, status: null };
    }
    all.push(...pageDocs);

    if (!raw.hasNextPage || !raw.nextPage) break;
    page = raw.nextPage;
  }

  return { ok: true, data: all };
}

/**
 * Confirmed real shape: a Mongoose-paginate wrapper — `{ docs, totalPages,
 * page, hasNextPage, nextPage, ... }`, not a bare array or `{ players }`.
 * Squads have stayed under one page (`limit`) in practice, but this walks
 * every page for real rather than assuming that always holds.
 */
export async function fetchTeamPlayers(apiBase, apiKey, teamId, { gender = "male", limit = 100, retries, onRetry } = {}) {
  const allPlayers = [];
  let page = 1;

  while (true) {
    const result = await apiGet(
      `${apiBase}/players`,
      {
        teamId,
        gender,
        marketValues: "true",
        performanceData: "false",
        performanceSummary: "true", // confirmed available — powers appearances/minutes/goals/assists
        performanceHistory: "false",
        debuts: "false",
        injuryData: "false",
        includeMissedMatches: "false",
        limit,
        page,
        fastMode: "false",
      },
      apiKey,
      { retries, onRetry }
    );
    if (!result.ok) return allPlayers.length > 0 ? { ok: true, data: allPlayers, partial: true, error: result.error } : result;

    const raw = result.data;
    let pagePlayers = null;
    if (Array.isArray(raw)) {
      pagePlayers = raw;
    } else if (raw && typeof raw === "object") {
      for (const key of ["docs", "players", "data", "items", "results"]) {
        if (Array.isArray(raw[key])) {
          pagePlayers = raw[key];
          break;
        }
      }
    }
    if (pagePlayers === null) {
      return {
        ok: false,
        error: `Unrecognized /players?teamId=${teamId} response shape: ${JSON.stringify(Object.keys(raw ?? {}))}`,
        status: null,
      };
    }

    allPlayers.push(...pagePlayers);

    if (!raw?.hasNextPage || !raw?.nextPage) break;
    page = raw.nextPage;
  }

  return { ok: true, data: allPlayers };
}
