/**
 * Low-level Sportmonks Football API v3 client.
 *
 * Every detail here (base URL, auth shape, endpoint paths, response
 * shapes, field names) is confirmed directly against the real API on a
 * real Football Free Plan token (2026-09-01) — nothing here is guessed.
 * See docs/SPORTMONKS_INTEGRATION.md for the full investigation.
 *
 * Confirmed endpoints:
 *   GET /leagues                          -> list every league visible on
 *     this plan (`{data: [...], subscription: [...], rate_limit: {...}}`).
 *     `subscription[0].plans` names the active plan (e.g. "Football Free
 *     Plan") — a real way to sanity-check the token/plan, since there's no
 *     separate "verify token" endpoint.
 *   GET /leagues/{id}?include=seasons     -> one league with its seasons[]
 *     array; find `is_current: true` for the current season id.
 *   GET /fixtures/between/{start}/{end}?filters=fixtureLeagues:{id}
 *     -> fixtures in a date range (YYYY-MM-DD), scoped to one league.
 *     `state_id` on each fixture: 5 = "FT" (Full Time, i.e. finished) —
 *     confirmed against /states. Not every state is a real finish (10
 *     POSTPONED, 12 CANCELLED, etc. — only 5/7/8 are completed matches
 *     with real ratings available; this client only ever treats 5 as
 *     "finished" since that's what's been confirmed to carry ratings).
 *   GET /fixtures/{id}?include=lineups.details.type;participants
 *     -> the full match sheet. `participants[]` gives both teams with
 *     `meta.location` ("home"/"away"). `lineups[]` has one entry per
 *     player: `player_id`, `player_name`, `team_id`, `type_id` (11 =
 *     "Lineup" i.e. starter, 12 = "Bench" i.e. substitute — confirmed via
 *     /core/types), each with a `details[]` array of per-player stats;
 *     `details[].type_id` 118 = "Rating" (0-10 scale, e.g. 6.94), 119 =
 *     "Minutes Played". A lineup entry with no rating detail (unused
 *     substitute) is real, not a mapping gap — never treated as a 0.
 *   GET /players/{id}                     -> one player: `name`,
 *     `firstname`, `lastname`, `date_of_birth`, `nationality_id`. Used
 *     sparingly (only to break a matching tie, see sync-sportmonks-ratings.mjs)
 *     since it's one request per player, unlike the bulk fixture calls.
 *   GET https://api.sportmonks.com/v3/core/types
 *     -> the full type_id reference table (500 rows on one page) —
 *     **not** under /football/types, that's a 404. Used only to derive
 *     the confirmed 11/12/118/119 meanings above; not called at sync time.
 *
 * Auth: `api_token` query parameter (not a header, unlike SCOUTASTIC).
 * Every response also carries a `rate_limit: {remaining, resets_in_seconds}`
 * block — read on every call so a run can back off before actually
 * hitting 429, not just react after the fact.
 */

const FOOTBALL_BASE = "https://api.sportmonks.com/v3/football";
const DEFAULT_TIMEOUT_MS = 15_000;
const LOW_RATE_LIMIT_THRESHOLD = 30; // pause proactively once remaining drops this low

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * GET url+params, retrying on 429/5xx/timeout with exponential backoff,
 * and proactively sleeping until the window resets if the token's own
 * rate_limit.remaining is already critically low (rather than firing the
 * next request and eating a guaranteed 429).
 * Returns { ok: true, data, rateLimit } or { ok: false, error, status }.
 */
export async function sportmonksGet(path, params, token, { retries = 3, timeoutMs = DEFAULT_TIMEOUT_MS, onRetry, baseUrl = FOOTBALL_BASE } = {}) {
  const fullUrl = new URL(`${baseUrl}${path}`);
  fullUrl.searchParams.set("api_token", token);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null) fullUrl.searchParams.set(key, String(value));
  }

  let lastError = null;
  let lastStatus = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(fullUrl, { headers: { accept: "application/json" }, signal: controller.signal });
      clearTimeout(timeout);
      const body = await res.json().catch(() => null);

      if (res.ok) {
        const rateLimit = body?.rate_limit ?? null;
        if (rateLimit && rateLimit.remaining < LOW_RATE_LIMIT_THRESHOLD) {
          const wait = Math.min(rateLimit.resets_in_seconds ?? 60, 300) * 1000;
          onRetry?.({ url: fullUrl.toString(), status: "rate-limit-low", attempt, retries, waitMs: wait, remaining: rateLimit.remaining });
          await sleep(wait);
        }
        return { ok: true, data: body?.data, meta: body, rateLimit };
      }

      lastStatus = res.status;
      lastError = `HTTP ${res.status}: ${body?.message ?? "unknown error"}`;

      if ([429, 500, 502, 503, 504].includes(res.status) && attempt < retries) {
        const wait = Math.min(2 ** attempt, 30) * 1000;
        onRetry?.({ url: fullUrl.toString(), status: res.status, attempt, retries, waitMs: wait });
        await sleep(wait);
        continue;
      }
      break; // non-retryable status (401, 404, ...) — fail immediately
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

/** Confirmed real: `GET /leagues/{id}?include=seasons`. Returns the season with `is_current: true`, or null if none is flagged current. */
export async function fetchCurrentSeason(leagueId, token, opts = {}) {
  const result = await sportmonksGet(`/leagues/${leagueId}`, { include: "seasons" }, token, opts);
  if (!result.ok) return result;
  const current = (result.data?.seasons ?? []).find((s) => s.is_current);
  return { ok: true, data: current ?? null, rateLimit: result.rateLimit };
}

/**
 * Confirmed real: `GET /fixtures/between/{start}/{end}?filters=fixtureLeagues:{id}`.
 * Dates are `YYYY-MM-DD`. Only returns fixtures with `state_id === 5`
 * ("FT", confirmed via /states) — postponed/cancelled/not-yet-played
 * fixtures are filtered out here since they never carry real ratings.
 */
export async function fetchFinishedFixtures(leagueId, startDate, endDate, token, opts = {}) {
  const result = await sportmonksGet(`/fixtures/between/${startDate}/${endDate}`, { filters: `fixtureLeagues:${leagueId}` }, token, opts);
  if (!result.ok) return result;
  const finished = (result.data ?? []).filter((f) => f.state_id === 5);
  return { ok: true, data: finished, rateLimit: result.rateLimit };
}

/**
 * Confirmed real: `GET /fixtures/{id}?include=lineups.details.type;participants`.
 * Returns the raw fixture object as-is (participants[], lineups[] with
 * nested details[].type) — normalization into per-player rating rows
 * happens in fieldMap-style extraction, kept separate from this client
 * the same way scoutasticClient.mjs stays separate from fieldMap.mjs.
 */
export async function fetchFixtureWithLineups(fixtureId, token, opts = {}) {
  return sportmonksGet(`/fixtures/${fixtureId}`, { include: "lineups.details.type;participants" }, token, opts);
}

/** Confirmed real: `GET /players/{id}` -> {name, firstname, lastname, date_of_birth, nationality_id, ...}. One request per player — call sparingly (see sync-sportmonks-ratings.mjs's matching order). */
export async function fetchPlayer(playerId, token, opts = {}) {
  return sportmonksGet(`/players/${playerId}`, {}, token, opts);
}

/** Verifies the token works and reports the active plan — no dedicated "verify" endpoint exists, `/leagues` is the cheapest real call that both authenticates and returns `subscription`. */
export async function verifyToken(token, opts = {}) {
  const result = await sportmonksGet("/leagues", { per_page: 1 }, token, opts);
  if (!result.ok) return result;
  return { ok: true, plans: (result.meta?.subscription ?? []).flatMap((s) => s.plans ?? []), rateLimit: result.rateLimit };
}
