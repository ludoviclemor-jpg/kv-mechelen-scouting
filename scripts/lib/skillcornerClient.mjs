/**
 * Low-level SkillCorner API client. A genuinely separate API/account
 * from Impect — www.skillcorner.com, HTTP Basic Auth (confirmed live,
 * 2026-09-11, against docs/skillcorner-openapi.json's real OpenAPI 3.1
 * spec, security schemes ['Basic', 'api_key', 'cookieAuth']). Used only
 * for real physical performance data (distance, sprints, high-speed
 * running, etc.) — Impect's own KPI/Score catalogs contain none of that.
 *
 * Pagination: this API uses two different real styles depending on the
 * endpoint (confirmed live) — `limit`/`offset` for catalog endpoints
 * (/competition_editions/, /teams/, /players/) and `page_size`/`after`
 * cursor pagination for /physical/. Both helpers below are real, not
 * guessed — each was hit live and its actual `next`/`after` shape
 * inspected before being wired up.
 */

const API_BASE = "https://www.skillcorner.com/api";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createSkillcornerClient() {
  const username = process.env.SKILLCORNER_USERNAME;
  const password = process.env.SKILLCORNER_PASSWORD;

  if (!username || !password) {
    throw new Error("Missing SKILLCORNER_USERNAME / SKILLCORNER_PASSWORD in the environment.");
  }
  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;

  /** GET path (with querystring already applied), retrying on 429/5xx with backoff. Returns the raw parsed JSON body — callers unwrap `.results` themselves since not every endpoint is paginated the same way. */
  async function get(path, { retries = 3, onRetry } = {}) {
    for (let attempt = 1; attempt <= retries + 1; attempt++) {
      const res = await fetch(`${API_BASE}${path}`, {
        headers: { accept: "application/json", Authorization: authHeader },
      });

      if (res.ok) return res.json();

      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt > retries) {
        const body = await res.text().catch(() => "");
        throw new Error(`GET ${path} failed: HTTP ${res.status} ${body.slice(0, 300)}`);
      }
      const waitMs = Math.min(2000 * 2 ** (attempt - 1), 15000);
      if (onRetry) onRetry({ path, status: res.status, attempt, retries, waitMs });
      await sleep(waitMs);
    }
    throw new Error(`GET ${path}: exhausted retries`); // unreachable, satisfies control flow
  }

  /** Walks a limit/offset-paginated endpoint (competition_editions/teams/players) to completion, returning every real result row. */
  async function getAllPages(path, params, { onRetry } = {}) {
    const results = [];
    let offset = 0;
    const limit = params.limit ?? 200;
    for (;;) {
      const qs = new URLSearchParams({ ...params, limit: String(limit), offset: String(offset) });
      const page = await get(`${path}?${qs}`, { onRetry });
      results.push(...(page.results ?? []));
      if (!page.next) break;
      offset += limit;
    }
    return results;
  }

  /** Walks a page_size/after cursor-paginated endpoint (/physical/) to completion. */
  async function getAllCursor(path, params, { onRetry } = {}) {
    const results = [];
    let after;
    for (;;) {
      const qs = new URLSearchParams({ ...params, ...(after ? { after } : {}) });
      const page = await get(`${path}?${qs}`, { onRetry });
      results.push(...(page.results ?? []));
      if (!page.next) break;
      after = new URL(page.next).searchParams.get("after");
      if (!after) break;
    }
    return results;
  }

  return { get, getAllPages, getAllCursor };
}

export { sleep };
