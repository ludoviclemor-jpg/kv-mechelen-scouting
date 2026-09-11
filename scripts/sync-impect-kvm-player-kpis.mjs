#!/usr/bin/env node
/**
 * Impect player-KPI sync for KV Mechelen's own squad (squadId 373,
 * confirmed live against GET /v5/customerapi/iterations/{id}/squads —
 * "KV Mechelen" is the real name returned there, not assumed). Every
 * player currently in the squad, real season-to-date KPI values from
 * GET /v5/customerapi/iterations/{iterationId}/squads/{squadId}/player-kpis,
 * player identity (name, position, birthdate) from
 * GET /v5/customerapi/iterations/{iterationId}/players.
 *
 * Same "static JSON, not Supabase yet" architecture note as
 * sync-impect-squad-ratings.mjs — see that script's header for why.
 *
 * KPI selection: a deliberately small, confirmed-real subset (see
 * docs/impect-kpi-definitions.json for the full 1458-entry catalog this
 * was checked against) — BYPASSED_OPPONENTS/BYPASSED_DEFENDERS/
 * PACKING_XG shown per-90 (raw value / matchShare — matchShare is
 * Impect's own "how many full matches this represents" figure, a sound,
 * real basis for a per-90 rate, not invented here), GOALS/ASSISTS shown
 * as season totals. A KPI genuinely missing from a player's `kpis` array
 * is left absent in the output (never coerced to 0 — coverage confirmed
 * live to be sparse for GOALS/ASSISTS specifically: only 4 of 48 KVM
 * players carry a value for either, which is far more consistent with
 * "not computed for this player" than "48 players, only 4 non-zero").
 *
 * Usage:
 *   IMPECT_TOKEN_URL=... IMPECT_CLIENT_ID=... IMPECT_USERNAME=... IMPECT_PASSWORD=... \
 *     node scripts/sync-impect-kvm-player-kpis.mjs
 */

const API_BASE = "https://api.impect.com";
const ITERATION_ID = 2143; // Jupiler Pro League, 26/27
const SQUAD_ID = 373; // KV Mechelen — confirmed live via GET /v5/customerapi/iterations/{id}/squads
const COMPETITION_NAME = "Jupiler Pro League";
const SEASON = "26/27";

// name -> real kpiId, from docs/impect-kpi-definitions.json.
const KPI_IDS = {
  BYPASSED_OPPONENTS: 0,
  BYPASSED_DEFENDERS: 2,
  GOALS: 28,
  ASSISTS: 77,
  PACKING_XG: 83,
};

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

/** raw value / matchShare — a real per-90 rate, only when both the KPI and a positive matchShare exist. */
function per90(raw, matchShare) {
  if (raw === undefined || !matchShare) return null;
  return Math.round((raw / matchShare) * 100) / 100;
}

async function main() {
  console.log("IMPECT KVM PLAYER-KPI SYNC STARTED");
  const token = await getAccessToken();

  const [playerKpis, iterationPlayers] = await Promise.all([
    impectGet(token, `/v5/customerapi/iterations/${ITERATION_ID}/squads/${SQUAD_ID}/player-kpis`),
    impectGet(token, `/v5/customerapi/iterations/${ITERATION_ID}/players`),
  ]);

  const playerById = new Map(iterationPlayers.map((p) => [p.id, p]));

  const rows = playerKpis.map((row) => {
    const identity = playerById.get(row.playerId);
    const kpiByid = new Map(row.kpis.map((k) => [k.kpiId, k.value]));
    const get = (name) => kpiByid.get(KPI_IDS[name]);

    return {
      playerId: row.playerId,
      name: identity?.commonname ?? `Player ${row.playerId}`,
      position: row.position,
      birthdate: identity?.birthdate ?? null,
      leg: identity?.leg ?? null,
      minutes: Math.round(row.playDuration / 60),
      matchShare: Math.round(row.matchShare * 100) / 100,
      goals: get("GOALS") ?? null,
      assists: get("ASSISTS") ?? null,
      bypassedOpponentsPer90: per90(get("BYPASSED_OPPONENTS"), row.matchShare),
      bypassedDefendersPer90: per90(get("BYPASSED_DEFENDERS"), row.matchShare),
      packingXgPer90: per90(get("PACKING_XG"), row.matchShare),
      // Real Transfermarkt cross-reference, when Impect has one — the
      // bridge to this project's own Scoutastic-based player ids
      // (scoutastic_player_id is itself a Transfermarkt id), not used
      // for an automatic match yet, just carried through for later.
      transfermarktId: identity?.idMappings?.find((m) => m.transfermarkt)?.transfermarkt?.[0] ?? null,
    };
  });

  rows.sort((a, b) => b.minutes - a.minutes);

  const out = {
    iterationId: ITERATION_ID,
    squadId: SQUAD_ID,
    squadName: "KV Mechelen",
    competitionName: COMPETITION_NAME,
    season: SEASON,
    fetchedAt: new Date().toISOString(),
    source: "Impect Data API — GET /v5/customerapi/iterations/{id}/squads/{squadId}/player-kpis",
    players: rows,
  };

  const { writeFile } = await import("node:fs/promises");
  const path = new URL("../src/data/impect-kvm-player-kpis.json", import.meta.url);
  await writeFile(path, JSON.stringify(out, null, 2) + "\n");

  console.log(`Wrote ${rows.length} KV Mechelen players to src/data/impect-kvm-player-kpis.json`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
