#!/usr/bin/env node
/**
 * Impect player-KPI sync for the *entire* Jupiler Pro League (all 18
 * squads, iterationId 2143, 26/27 — confirmed live), not just KV
 * Mechelen. Supersedes scripts/sync-impect-kvm-player-kpis.mjs's
 * single-squad scope after the club asked for every player in the
 * league, not only their own squad — deliberately still bounded to one
 * real, relevant competition rather than Impect's full ~759-iteration
 * worldwide catalog, which is far too large to bundle into a dashboard
 * (see the conversation this was built from for the sizing discussion).
 *
 * One player-kpis request per squad (18 real requests, not a scrape of
 * arbitrary IDs), plus one iteration-wide players request for identity.
 * Same static-JSON architecture note as the other impect sync scripts —
 * see sync-impect-squad-ratings.mjs's header for why.
 *
 * KPI set (all confirmed real names/ids — see
 * docs/impect-kpi-definitions.json, 137 top-level KPIs): goals, assists,
 * shots and shot-xG, packing xG, bypassed opponents/defenders,
 * ground+aerial duel win/loss, ball win/loss. A KPI absent from a
 * player's `kpis` array stays absent in the output (never coerced to 0
 * — see sync-impect-kvm-player-kpis.mjs's comment for why that matters
 * here).
 *
 * Usage:
 *   IMPECT_TOKEN_URL=... IMPECT_CLIENT_ID=... IMPECT_USERNAME=... IMPECT_PASSWORD=... \
 *     node scripts/sync-impect-league-player-kpis.mjs
 */

const API_BASE = "https://api.impect.com";
const ITERATION_ID = 2143; // Jupiler Pro League, 26/27
const COMPETITION_NAME = "Jupiler Pro League";
const SEASON = "26/27";

const KPI_IDS = {
  GOALS: 28,
  ASSISTS: 77,
  SHOT_AT_GOAL_NUMBER: 100,
  SHOT_XG: 82,
  PACKING_XG: 83,
  BYPASSED_OPPONENTS: 0,
  BYPASSED_DEFENDERS: 2,
  WON_GROUND_DUELS: 94,
  LOST_GROUND_DUELS: 95,
  WON_AERIAL_DUELS: 96,
  LOST_AERIAL_DUELS: 97,
  BALL_WIN_REMOVED_OPPONENTS: 24,
  BALL_LOSS_REMOVED_TEAMMATES: 21,
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function per90(raw, matchShare) {
  if (raw === undefined || !matchShare) return null;
  return Math.round((raw / matchShare) * 100) / 100;
}

/** Real derived ratio from real component values (never a fabricated field of its own on Impect's side). */
function winPercent(won, lost) {
  if (won === undefined && lost === undefined) return null;
  const w = won ?? 0;
  const l = lost ?? 0;
  const total = w + l;
  if (total === 0) return null;
  return Math.round((w / total) * 1000) / 10; // one decimal place
}

async function main() {
  console.log("IMPECT LEAGUE-WIDE PLAYER-KPI SYNC STARTED");
  const token = await getAccessToken();

  const squads = await impectGet(token, `/v5/customerapi/iterations/${ITERATION_ID}/squads`);
  const iterationPlayers = await impectGet(token, `/v5/customerapi/iterations/${ITERATION_ID}/players`);
  const playerById = new Map(iterationPlayers.map((p) => [p.id, p]));

  const rows = [];
  for (const squad of squads) {
    const kpis = await impectGet(token, `/v5/customerapi/iterations/${ITERATION_ID}/squads/${squad.id}/player-kpis`);
    for (const row of kpis) {
      const identity = playerById.get(row.playerId);
      const kpiById = new Map(row.kpis.map((k) => [k.kpiId, k.value]));
      const get = (name) => kpiById.get(KPI_IDS[name]);

      rows.push({
        playerId: row.playerId,
        name: identity?.commonname ?? `Player ${row.playerId}`,
        position: row.position,
        squadId: squad.id,
        squadName: squad.name,
        birthdate: identity?.birthdate ?? null,
        minutes: Math.round(row.playDuration / 60),
        matchShare: Math.round(row.matchShare * 100) / 100,
        goals: get("GOALS") ?? null,
        assists: get("ASSISTS") ?? null,
        shotsPer90: per90(get("SHOT_AT_GOAL_NUMBER"), row.matchShare),
        shotXgPer90: per90(get("SHOT_XG"), row.matchShare),
        packingXgPer90: per90(get("PACKING_XG"), row.matchShare),
        bypassedOpponentsPer90: per90(get("BYPASSED_OPPONENTS"), row.matchShare),
        bypassedDefendersPer90: per90(get("BYPASSED_DEFENDERS"), row.matchShare),
        groundDuelWinPercent: winPercent(get("WON_GROUND_DUELS"), get("LOST_GROUND_DUELS")),
        aerialDuelWinPercent: winPercent(get("WON_AERIAL_DUELS"), get("LOST_AERIAL_DUELS")),
        ballWinPer90: per90(get("BALL_WIN_REMOVED_OPPONENTS"), row.matchShare),
        ballLossPer90: per90(get("BALL_LOSS_REMOVED_TEAMMATES"), row.matchShare),
        transfermarktId: identity?.idMappings?.find((m) => m.transfermarkt)?.transfermarkt?.[0] ?? null,
      });
    }
    console.log(`  [${squad.name}] ${kpis.length} players`);
    await sleep(150); // gentle pacing across 18 real requests, not a burst
  }

  rows.sort((a, b) => b.minutes - a.minutes);

  const out = {
    iterationId: ITERATION_ID,
    competitionName: COMPETITION_NAME,
    season: SEASON,
    squadCount: squads.length,
    fetchedAt: new Date().toISOString(),
    source: "Impect Data API — GET /v5/customerapi/iterations/{id}/squads/{squadId}/player-kpis (all squads)",
    players: rows,
  };

  const { writeFile, unlink } = await import("node:fs/promises");
  const path = new URL("../src/data/impect-league-player-kpis.json", import.meta.url);
  await writeFile(path, JSON.stringify(out, null, 2) + "\n");

  // Superseded by this league-wide file — remove the old single-squad one.
  try {
    await unlink(new URL("../src/data/impect-kvm-player-kpis.json", import.meta.url));
  } catch {
    // already gone — fine
  }

  console.log(`Wrote ${rows.length} players across ${squads.length} squads to src/data/impect-league-player-kpis.json`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
