#!/usr/bin/env node
/**
 * Impect squad-ratings sync — first real Impect Data API integration
 * (docs/impect-openapi-v4.1.2.json has the full confirmed API surface;
 * docs/impect-kpi-definitions.json and docs/impect-player-profiles.json
 * are the real KPI/role-profile catalogs discovered alongside it).
 *
 * Scoped deliberately small for this first pass: Jupiler Pro League
 * 2026/27 (iterationId 2143, confirmed live against GET
 * /v5/customerapi/iterations) squad ratings only — real, dated
 * team-strength values Impect itself computes, not anything derived or
 * invented here.
 *
 * Architecture note: unlike the Scoutastic/Sportmonks sync scripts, this
 * writes to a committed static JSON file (src/data/) instead of Supabase
 * — the per-scout-privacy DB migration this project's `db/schema.sql`
 * depends on hasn't been applied to production yet, and this integration
 * was explicitly asked to proceed without waiting on that. This still
 * respects the same non-negotiable rule those scripts follow: Impect
 * credentials are read from the environment only, this script runs
 * server-side (locally or via a future GitHub Action), and the frontend
 * never talks to Impect directly — it only ever reads the committed
 * output file. Once the DB migration lands, this can move to a Postgres
 * table + RLS like every other provider, same as Sportmonks did.
 *
 * Usage:
 *   IMPECT_TOKEN_URL=... IMPECT_CLIENT_ID=... IMPECT_USERNAME=... IMPECT_PASSWORD=... \
 *     node scripts/sync-impect-squad-ratings.mjs
 */

const API_BASE = "https://api.impect.com";
const ITERATION_ID = 2143; // Jupiler Pro League, 26/27 — confirmed live via GET /v5/customerapi/iterations
const COMPETITION_NAME = "Jupiler Pro League";
const SEASON = "26/27";

async function getAccessToken() {
  const tokenUrl = process.env.IMPECT_TOKEN_URL;
  const clientId = process.env.IMPECT_CLIENT_ID;
  const username = process.env.IMPECT_USERNAME;
  const password = process.env.IMPECT_PASSWORD;
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
  return data.access_token;
}

async function impectGet(token, path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { accept: "application/json", Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GET ${path} failed: HTTP ${res.status}`);
  const json = await res.json();
  return json.data;
}

async function main() {
  console.log("IMPECT SQUAD RATINGS SYNC STARTED");
  const token = await getAccessToken();

  const [squads, ratingsData] = await Promise.all([
    impectGet(token, `/v5/customerapi/iterations/${ITERATION_ID}/squads`),
    impectGet(token, `/v5/customerapi/iterations/${ITERATION_ID}/squads/ratings`),
  ]);

  const squadName = new Map(squads.map((s) => [s.id, s.name]));
  const entries = ratingsData.squadRatingsEntries;
  if (!entries || entries.length === 0) throw new Error("No squadRatingsEntries returned — nothing to write.");
  const latest = entries.reduce((a, b) => (a.date > b.date ? a : b));

  const rows = latest.squadRatings
    .map((r) => ({ squadId: r.squadId, squadName: squadName.get(r.squadId) ?? "Unknown", rating: Math.round(r.value * 10000) / 10000 }))
    .sort((a, b) => b.rating - a.rating)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  const out = {
    iterationId: ITERATION_ID,
    competitionName: COMPETITION_NAME,
    season: SEASON,
    asOfDate: latest.date,
    fetchedAt: new Date().toISOString(),
    source: "Impect Data API — GET /v5/customerapi/iterations/{id}/squads/ratings",
    ratings: rows,
  };

  const { writeFile } = await import("node:fs/promises");
  const path = new URL("../src/data/impect-squad-ratings.json", import.meta.url);
  await writeFile(path, JSON.stringify(out, null, 2) + "\n");

  console.log(`Wrote ${rows.length} squad ratings (as of ${latest.date}) to src/data/impect-squad-ratings.json`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
