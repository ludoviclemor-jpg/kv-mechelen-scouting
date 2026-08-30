#!/usr/bin/env node
/**
 * SCOUTASTIC sync — the only script that talks to the real SCOUTASTIC API.
 *
 * Crawls competitions -> teams -> squads (there is no documented "list all
 * players" endpoint — see docs/SCOUTASTIC_SYNC.md for why), upserts the
 * result into data/players.json, and never deletes a player who drops out
 * of a response — they're marked `active: false` instead.
 *
 * Usage:
 *   SCOUTASTIC_API_KEY=... node scripts/sync-scoutastic.mjs --list-competitions
 *   SCOUTASTIC_API_KEY=... node scripts/sync-scoutastic.mjs --inspect-team <teamId>
 *   SCOUTASTIC_API_KEY=... node scripts/sync-scoutastic.mjs --inspect-player <externalId>
 *   SCOUTASTIC_API_KEY=... node scripts/sync-scoutastic.mjs --only NO1 --dry-run
 *   SCOUTASTIC_API_KEY=... node scripts/sync-scoutastic.mjs
 *
 * The API key is read exclusively from the SCOUTASTIC_API_KEY environment
 * variable (or --api-key, for convenience in a one-off local shell — never
 * pass it in a way that could land in shell history you'd share/commit).
 * It is never written to any file this script produces and never printed.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  baseUrl,
  fetchCompetitionTeams,
  fetchTeamPlayers,
  fetchPlayer,
} from "./lib/scoutasticClient.mjs";
import { mapScoutasticPlayer } from "./lib/fieldMap.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const CONFIG_DIR = path.join(ROOT, "src", "lib", "scoutastic", "config");
const EASTERN_EUROPE_PATH = path.join(CONFIG_DIR, "easternEuropeanCountries.json");

// Overridable via --competitions-file / --data-file (testing only — see
// docs/SCOUTASTIC_SYNC.md); production always uses the real repo paths.
let COMPETITIONS_PATH = path.join(CONFIG_DIR, "competitions.json");
let DATA_PATH = path.join(ROOT, "data", "players.json");

function parseArgs(argv) {
  const args = { gender: "male", delayMs: 300, retries: 3, limitTeams: null, only: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--list-competitions") args.listCompetitions = true;
    else if (a === "--update-config") args.updateConfig = true;
    else if (a === "--inspect-team") args.inspectTeam = argv[++i];
    else if (a === "--inspect-player") args.inspectPlayer = argv[++i];
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--include-unverified") args.includeUnverified = true;
    else if (a === "--only") args.only = argv[++i].split(",").map((s) => s.trim().toUpperCase());
    else if (a === "--limit-teams") args.limitTeams = Number(argv[++i]);
    else if (a === "--delay-ms") args.delayMs = Number(argv[++i]);
    else if (a === "--retries") args.retries = Number(argv[++i]);
    else if (a === "--gender") args.gender = argv[++i];
    else if (a === "--club-subdomain") args.clubSubdomain = argv[++i];
    else if (a === "--api-key") args.apiKey = argv[++i];
    else if (a === "--competitions-file") args.competitionsFile = argv[++i]; // testing only
    else if (a === "--data-file") args.dataFile = argv[++i]; // testing only
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadJson(p, fallback) {
  if (!existsSync(p)) return fallback;
  return JSON.parse(readFileSync(p, "utf-8"));
}

function onRetry({ url, status, attempt, retries, waitMs }) {
  console.error(`  [retry] ${url} status=${status}, waiting ${waitMs}ms (attempt ${attempt}/${retries})`);
}

async function listCompetitions(apiBase, apiKey, competitions, args) {
  console.log(`${"country".padEnd(20)} ${"tier".padEnd(5)} ${"competitionId".padEnd(14)} result`);
  console.log("-".repeat(70));
  let ok = 0;
  let bad = 0;
  const results = [];
  for (const c of competitions) {
    const res = await fetchCompetitionTeams(apiBase, apiKey, c.competitionId, {
      gender: args.gender,
      retries: args.retries,
      onRetry,
    });
    if (!res.ok) {
      console.log(`${c.country.padEnd(20)} ${String(c.tier).padEnd(5)} ${c.competitionId.padEnd(14)} FAILED — ${res.error}`);
      bad++;
      results.push({ ...c, verified: false, teamCount: null });
    } else if (res.data.length === 0) {
      console.log(`${c.country.padEnd(20)} ${String(c.tier).padEnd(5)} ${c.competitionId.padEnd(14)} resolved but 0 teams — suspicious`);
      bad++;
      results.push({ ...c, verified: false, teamCount: 0 });
    } else {
      console.log(`${c.country.padEnd(20)} ${String(c.tier).padEnd(5)} ${c.competitionId.padEnd(14)} OK — ${res.data.length} teams`);
      ok++;
      results.push({ ...c, verified: true, teamCount: res.data.length });
    }
    await sleep(args.delayMs);
  }
  console.log("-".repeat(70));
  console.log(`${ok} OK, ${bad} need attention (out of ${competitions.length})`);

  if (args.updateConfig) {
    const raw = JSON.parse(readFileSync(COMPETITIONS_PATH, "utf-8"));
    for (const updated of results) {
      const entry = raw.competitions.find((c) => c.competitionId === updated.competitionId);
      if (entry) entry.verified = updated.verified;
    }
    writeFileSync(COMPETITIONS_PATH, JSON.stringify(raw, null, 2) + "\n");
    console.log(`\nUpdated ${COMPETITIONS_PATH} with verified flags.`);
  } else {
    console.log("\n(Run again with --update-config to persist these verified flags into competitions.json.)");
  }
}

async function inspectTeam(apiBase, apiKey, teamId, args) {
  const res = await fetchTeamPlayers(apiBase, apiKey, teamId, { gender: args.gender, retries: args.retries, onRetry });
  if (!res.ok) {
    console.error(`Inspect failed: ${res.error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`--- ${res.data.length} players returned for team ${teamId} ---`);
  console.log(JSON.stringify(res.data.slice(0, 2), null, 2));
  if (res.data[0]) {
    console.log("\n--- Top-level keys on first player ---");
    console.log(Object.keys(res.data[0]));
  }
}

async function inspectPlayer(apiBase, apiKey, externalId, args) {
  const res = await fetchPlayer(apiBase, apiKey, externalId, { gender: args.gender, retries: args.retries, onRetry });
  if (!res.ok) {
    console.error(`Inspect failed: ${res.error}`);
    process.exitCode = 1;
    return;
  }
  console.log("--- RAW RESPONSE ---");
  console.log(JSON.stringify(res.data, null, 2));
  console.log("\n--- Top-level keys ---");
  console.log(Object.keys(res.data));
  const { player, warnings } = mapScoutasticPlayer(res.data, {
    externalId,
    competitionId: null,
    competitionCountry: null,
    isEasternEuropeanLeague: false,
    nowIso: new Date().toISOString(),
    imageBaseUrl: args.imageBaseUrl,
  });
  console.log("\n--- MAPPED PLAYER ---");
  console.log(JSON.stringify(player, null, 2));
  if (warnings.length) {
    console.log("\n--- WARNINGS ---");
    warnings.forEach((w) => console.log(`  - ${w}`));
  }
}

// Fields SCOUTASTIC actually owns. Everything else on a Player record
// (status/notes = local scouting state, sofascore* /matches/ratings* =
// SofaScore enrichment) belongs to a different system and must survive a
// SCOUTASTIC sync untouched.
const SCOUTASTIC_FIELDS = [
  "firstName", "lastName", "name", "photoUrl", "dateOfBirth", "nationality", "secondNationality",
  "isAfrican", "position", "positionRaw", "secondaryPositions", "club", "previousClub",
  "teams", "league", "leagueCountry", "competitionId", "isEasternEuropeanLeague",
  "heightCm", "preferredFoot", "agent", "marketValueEUR", "contractExpiry",
  "appearances", "minutes", "goals", "assists",
];

function pick(obj, keys) {
  return Object.fromEntries(keys.map((k) => [k, obj[k]]));
}

function fieldsEqual(a, b) {
  return SCOUTASTIC_FIELDS.every((f) => JSON.stringify(a[f]) === JSON.stringify(b[f]));
}

async function runSync(apiBase, apiKey, competitions, args) {
  const nowIso = new Date().toISOString();
  const startedAt = Date.now();
  console.log("SCOUTASTIC SYNC STARTED");

  const existing = loadJson(DATA_PATH, { meta: {}, players: [] });
  const byId = new Map(existing.players.map((p) => [p.scoutasticPlayerId, p]));
  const easternEuropeCountries = new Set(loadJson(EASTERN_EUROPE_PATH, []));

  const seenThisRun = new Set();
  const crawledCompetitionIds = new Set();
  let retrieved = 0;
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let failed = 0;
  const failures = [];
  const competitionsFailed = [];

  for (const comp of competitions) {
    const teamsRes = await fetchCompetitionTeams(apiBase, apiKey, comp.competitionId, {
      gender: args.gender,
      retries: args.retries,
      onRetry,
    });
    if (!teamsRes.ok) {
      console.error(`  [skip] ${comp.country} tier ${comp.tier} (${comp.competitionId}): ${teamsRes.error}`);
      competitionsFailed.push(comp.competitionId);
      continue;
    }

    let teamIds = teamsRes.data;
    if (args.limitTeams) teamIds = teamIds.slice(0, args.limitTeams);
    console.log(`[${comp.country} tier ${comp.tier} / ${comp.competitionId}] ${teamIds.length} teams`);
    crawledCompetitionIds.add(comp.competitionId);

    for (const teamId of teamIds) {
      const playersRes = await fetchTeamPlayers(apiBase, apiKey, teamId, {
        gender: args.gender,
        retries: args.retries,
        onRetry,
      });
      await sleep(args.delayMs);

      if (!playersRes.ok) {
        console.error(`  [fail] team ${teamId}: ${playersRes.error}`);
        failed++;
        failures.push({ scope: "team", teamId, competitionId: comp.competitionId, error: playersRes.error });
        continue;
      }

      for (const raw of playersRes.data) {
        retrieved++;
        try {
          const { player: mapped, warnings } = mapScoutasticPlayer(raw, {
            externalId: raw.externalId ?? raw.id,
            competitionId: comp.competitionId,
            competitionCountry: comp.country,
            isEasternEuropeanLeague: easternEuropeCountries.has(comp.country),
            nowIso,
            imageBaseUrl: args.imageBaseUrl,
          });
          warnings.forEach((w) => console.error(`  [warn] ${mapped.name || mapped.scoutasticPlayerId}: ${w}`));

          seenThisRun.add(mapped.scoutasticPlayerId);
          const prior = byId.get(mapped.scoutasticPlayerId);

          if (!prior) {
            const record = {
              ...mapped,
              id: `sc-${mapped.scoutasticPlayerId}`,
              createdAt: nowIso,
              updatedAt: nowIso,
              addedDate: nowIso.slice(0, 10),
            };
            byId.set(mapped.scoutasticPlayerId, record);
            created++;
          } else if (!fieldsEqual(prior, mapped)) {
            // Only SCOUTASTIC-owned fields (SCOUTASTIC_FIELDS, see
            // fieldsEqual below) come from `mapped`. Local scouting state
            // (status/notes) and SofaScore enrichment are owned by other
            // systems (Postgres, a future SofaScore sync) — this sync must
            // never reset them back to their just-mapped defaults.
            const record = {
              ...prior,
              ...pick(mapped, SCOUTASTIC_FIELDS),
              id: prior.id,
              createdAt: prior.createdAt,
              addedDate: prior.addedDate,
              updatedAt: nowIso,
              lastSyncedAt: nowIso,
              active: true,
            };
            byId.set(mapped.scoutasticPlayerId, record);
            updated++;
          } else {
            prior.lastSyncedAt = nowIso;
            prior.active = true;
            unchanged++;
          }
        } catch (err) {
          failed++;
          failures.push({ scope: "player", teamId, competitionId: comp.competitionId, error: String(err) });
          console.error(`  [fail] player on team ${teamId}: ${err}`);
        }
      }
    }
  }

  // Detect players no longer returned, but only within competitions we
  // actually finished crawling this run — never penalize a player for a
  // competition/team fetch that itself failed.
  let deactivated = 0;
  for (const player of byId.values()) {
    if (
      crawledCompetitionIds.has(player.competitionId) &&
      !seenThisRun.has(player.scoutasticPlayerId) &&
      player.active
    ) {
      player.active = false;
      player.updatedAt = nowIso;
      deactivated++;
    }
  }

  const players = Array.from(byId.values());
  const durationSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  const status = competitionsFailed.length === 0 ? "success" : crawledCompetitionIds.size === 0 ? "failed" : "partial";

  const output = {
    meta: {
      source: "SCOUTASTIC",
      lastSyncedAt: nowIso,
      lastSyncStatus: status,
      lastSyncSummary: {
        competitionsAttempted: competitions.length,
        competitionsSucceeded: crawledCompetitionIds.size,
        competitionsFailed,
        playersRetrieved: retrieved,
        playersCreated: created,
        playersUpdated: updated,
        playersUnchanged: unchanged,
        playersFailed: failed,
        playersDeactivated: deactivated,
        durationSeconds: Number(durationSec),
      },
      playersCount: players.length,
      activePlayersCount: players.filter((p) => p.active).length,
    },
    players,
  };

  if (!args.dryRun) {
    writeFileSync(DATA_PATH, JSON.stringify(output, null, 2) + "\n");
  }

  console.log(`\nPlayers retrieved: ${retrieved}`);
  console.log(`Players created: ${created}`);
  console.log(`Players updated: ${updated}`);
  console.log(`Players unchanged: ${unchanged}`);
  console.log(`Players failed: ${failed}`);
  if (deactivated) console.log(`Players deactivated (no longer returned): ${deactivated}`);
  if (competitionsFailed.length) console.log(`Competitions failed: ${competitionsFailed.join(", ")}`);
  console.log(`Sync completed: ${nowIso.slice(0, 16).replace("T", " ")}`);
  if (args.dryRun) console.log("(--dry-run: data/players.json was NOT written)");

  if (status === "failed") process.exitCode = 1;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.competitionsFile) COMPETITIONS_PATH = path.resolve(args.competitionsFile);
  if (args.dataFile) DATA_PATH = path.resolve(args.dataFile);

  const apiKey = args.apiKey || process.env.SCOUTASTIC_API_KEY;
  if (!apiKey) {
    console.error("No API key. Set the SCOUTASTIC_API_KEY environment variable and re-run.");
    process.exitCode = 1;
    return;
  }

  const clubSubdomain = args.clubSubdomain || process.env.SCOUTASTIC_CLUB_SUBDOMAIN || "kvmechelen";
  const apiBase = process.env.SCOUTASTIC_API_BASE_URL || baseUrl(clubSubdomain);
  // imageUrlV2 (the only publicly-fetchable photo field) is relative to
  // the API's origin, not /api/v1 — e.g. https://kvmechelen.scoutastic.com
  args.imageBaseUrl = new URL(apiBase).origin;

  if (args.inspectTeam) return inspectTeam(apiBase, apiKey, args.inspectTeam, args);
  if (args.inspectPlayer) return inspectPlayer(apiBase, apiKey, args.inspectPlayer, args);

  const config = loadJson(COMPETITIONS_PATH, { competitions: [] });
  let competitions = config.competitions;
  if (args.only) competitions = competitions.filter((c) => args.only.includes(c.competitionId.toUpperCase()));
  if (!args.listCompetitions && !args.includeUnverified) {
    const skipped = competitions.filter((c) => !c.verified);
    if (skipped.length) {
      console.error(
        `Skipping ${skipped.length} unverified competition(s): ${skipped.map((c) => c.competitionId).join(", ")} ` +
          `(run with --list-competitions --update-config first, or pass --include-unverified to force).`
      );
    }
    competitions = competitions.filter((c) => c.verified);
  }
  if (competitions.length === 0) {
    console.error("No competitions to sync (none matched --only, or none are verified — see message above).");
    process.exitCode = 1;
    return;
  }

  if (args.listCompetitions) return listCompetitions(apiBase, apiKey, competitions, args);
  return runSync(apiBase, apiKey, competitions, args);
}

main();
