/**
 * Low-level SCOUTASTIC API client.
 *
 * Every detail here (base URL shape, auth header, endpoint paths, param
 * names) is carried over from a prior verification pass against the real
 * API — nothing here is guessed. See docs/SCOUTASTIC_SYNC.md for what's
 * confirmed vs. still unverified.
 *
 * Confirmed endpoints:
 *   GET /player?externalId=...            -> one player, full detail
 *   GET /competitions/{id}/teams?...      -> { teamIds: [...] } (or a bare array)
 *   GET /players?teamId=...&...           -> that team's squad
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
      performanceSummary: "false",
      performanceHistory: "false",
      debuts: "false",
      injuryData: "false",
      includeMissedMatches: "false",
    },
    apiKey,
    { retries, onRetry }
  );
}

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

export async function fetchTeamPlayers(apiBase, apiKey, teamId, { gender = "male", limit = 100, retries, onRetry } = {}) {
  const result = await apiGet(
    `${apiBase}/players`,
    {
      teamId,
      gender,
      marketValues: "true",
      performanceData: "false",
      performanceSummary: "false",
      performanceHistory: "false",
      debuts: "false",
      injuryData: "false",
      includeMissedMatches: "false",
      limit,
      fastMode: "false",
    },
    apiKey,
    { retries, onRetry }
  );
  if (!result.ok) return result;

  const raw = result.data;
  if (Array.isArray(raw)) return { ok: true, data: raw };
  if (raw && typeof raw === "object") {
    for (const key of ["players", "data", "items", "results"]) {
      if (Array.isArray(raw[key])) return { ok: true, data: raw[key] };
    }
  }
  return { ok: false, error: `Unrecognized /players?teamId=${teamId} response shape: ${JSON.stringify(Object.keys(raw ?? {}))}`, status: null };
}
