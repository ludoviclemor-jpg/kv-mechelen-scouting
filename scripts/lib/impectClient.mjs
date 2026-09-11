/**
 * Low-level Impect Data API client. Everything here (auth flow, base
 * URL, endpoint paths, response shapes) is confirmed directly against
 * the real API via its own OpenAPI spec — see
 * docs/impect-openapi-v4.1.2.json. Nothing here is guessed.
 *
 * Auth: OAuth2 password grant against a Keycloak realm (confirmed live,
 * 2026-09-11) — `IMPECT_TOKEN_URL` is the full token endpoint
 * (https://login.impect.com/auth/realms/production/protocol/openid-connect/token),
 * not something this client constructs itself, since the `/auth` prefix
 * isn't documented anywhere and was only found by trial. Access tokens
 * are valid ~24h; this client fetches one lazily and reuses it for the
 * life of the process rather than a token per request.
 */

const API_BASE = "https://api.impect.com";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createImpectClient() {
  const tokenUrl = process.env.IMPECT_TOKEN_URL;
  const clientId = process.env.IMPECT_CLIENT_ID;
  const username = process.env.IMPECT_USERNAME;
  const password = process.env.IMPECT_PASSWORD;

  let cachedToken = null;

  async function login() {
    if (!tokenUrl || !clientId || !username || !password) {
      throw new Error("Missing IMPECT_TOKEN_URL / IMPECT_CLIENT_ID / IMPECT_USERNAME / IMPECT_PASSWORD in the environment.");
    }
    const body = new URLSearchParams({ client_id: clientId, grant_type: "password", username, password });
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw new Error(`Impect login failed: HTTP ${res.status}`);
    const data = await res.json();
    cachedToken = data.access_token;
    return cachedToken;
  }

  /** GET path, retrying on 429/5xx with backoff. Returns the real `data` field, never fabricates a fallback. */
  async function get(path, { retries = 3, onRetry } = {}) {
    if (!cachedToken) await login();

    for (let attempt = 1; attempt <= retries + 1; attempt++) {
      const res = await fetch(`${API_BASE}${path}`, {
        headers: { accept: "application/json", Authorization: `Bearer ${cachedToken}` },
      });

      if (res.status === 401 && attempt === 1) {
        // token might have just expired — refresh once and retry immediately, doesn't count against the retry budget
        await login();
        continue;
      }

      if (res.ok) {
        const json = await res.json();
        return json.data;
      }

      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt > retries) {
        throw new Error(`GET ${path} failed: HTTP ${res.status}`);
      }
      const waitMs = Math.min(2000 * 2 ** (attempt - 1), 15000);
      if (onRetry) onRetry({ path, status: res.status, attempt, retries, waitMs });
      await sleep(waitMs);
    }
    throw new Error(`GET ${path}: exhausted retries`); // unreachable, satisfies control flow
  }

  return { get };
}

export { sleep };
