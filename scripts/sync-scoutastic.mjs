#!/usr/bin/env node
/**
 * SCOUTASTIC player sync — the batched, resumable squad crawl that
 * populates the `players` table from the competition/team catalog built
 * by scripts/sync-competitions.mjs.
 *
 * Architecture:
 *   scoutastic_teams (crawl queue, ordered by last_crawled_at)
 *     -> a batch of teams, each cross-referenced against competition_teams
 *        + scoutastic_competitions to find its "primary" competition
 *        (the in-scope one — active + Senior + male + European — with the
 *        lowest `level`, i.e. the actual league, not a cup/qualifier)
 *     -> GET /players?teamId=... per team (debuts=true, cheap — no extra
 *        request cost, see docs/COMPETITIONS.md)
 *     -> mapScoutasticPlayer() (scripts/lib/fieldMap.mjs) — real debut
 *        detection included
 *     -> upsert into `players` (service_role key, bypasses RLS)
 *     -> scoutastic_teams.last_crawled_at updated for the processed batch
 *
 * Deliberately NOT one full pass per run — 6,993 teams in scope (see
 * docs/COMPETITIONS.md) is real work, spread across many scheduled runs,
 * same reasoning as scripts/sync-sofascore.mjs's batching. A team already
 * crawled keeps its place in the queue by `last_crawled_at`, so a run
 * always picks up the least-recently-crawled teams first — nothing is
 * silently skipped and nothing is repeatedly re-crawled while older teams
 * wait.
 *
 * Only SCOUTASTIC-owned columns are ever written on an update — ratings
 * fields (sofascore_*, matches, rating_*) are simply never included in the
 * upsert payload, so Postgres's ON CONFLICT DO UPDATE leaves them
 * untouched automatically. No manual "preserve" merge logic needed (that
 * was necessary for the old data/players.json design, not for a real
 * upsert).
 *
 * Known gap, documented rather than silently skipped: no deactivation
 * logic yet (a player who leaves a team isn't marked `active: false`) —
 * `players` has no team_id column to reliably detect "no longer on this
 * squad" against, only a club name string. See docs/SCOUTASTIC_SYNC.md.
 *
 * Usage:
 *   SCOUTASTIC_API_KEY=... node scripts/sync-scoutastic.mjs --dry-run --batch-size 5
 *   SCOUTASTIC_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/sync-scoutastic.mjs
 *   SCOUTASTIC_API_KEY=... node scripts/sync-scoutastic.mjs --inspect-team 294
 *
 * Credentials are read exclusively from environment variables — never
 * written to any file this script produces, never logged, never printed.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { baseUrl, fetchTeamPlayers } from "./lib/scoutasticClient.mjs";
import { mapScoutasticPlayer } from "./lib/fieldMap.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const EASTERN_EUROPE_PATH = path.join(ROOT, "src", "lib", "scoutastic", "config", "easternEuropeanCountries.json");

function parseArgs(argv) {
  const args = { gender: "male", delayMs: 250, retries: 3, batchSize: 300, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--batch-size") args.batchSize = Number(argv[++i]);
    else if (a === "--delay-ms") args.delayMs = Number(argv[++i]);
    else if (a === "--retries") args.retries = Number(argv[++i]);
    else if (a === "--gender") args.gender = argv[++i];
    else if (a === "--club-subdomain") args.clubSubdomain = argv[++i];
    else if (a === "--api-key") args.apiKey = argv[++i];
    else if (a === "--inspect-team") args.inspectTeam = argv[++i];
    else if (a === "--only-team") args.onlyTeam = argv[++i]; // testing: force-crawl one specific team id
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function onRetry({ url, status, attempt, retries, waitMs }) {
  console.error(`  [retry] ${url} status=${status}, waiting ${waitMs}ms (attempt ${attempt}/${retries})`);
}

function loadJson(p, fallback) {
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return fallback;
  }
}

/**
 * PostgREST caps an unpaginated `.select()` at 1,000 rows by default —
 * silently, no error, no truncation flag. `scoutastic_competitions` alone
 * is 2,435 rows, so reading it without this wrapper would quietly load
 * less than half the table. Confirmed the hard way once already (see
 * docs/COMPETITIONS.md) — always use this for anything not already
 * bounded by a small filter (like `.in("team_id", <one batch>)`).
 */
async function fetchAllRows(db, table, columns) {
  const rows = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await db.from(table).select(columns).range(from, from + PAGE - 1);
    if (error) return { ok: false, error };
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return { ok: true, data: rows };
}

/** Maps our internal Player shape (camelCase) to the `players` table's columns (snake_case). Only SCOUTASTIC-owned fields — never touches ratings columns. */
function toPlayerRow(player, nowIso) {
  return {
    id: `sc-${player.scoutasticPlayerId}`,
    scoutastic_player_id: player.scoutasticPlayerId,
    source: player.source,
    first_name: player.firstName,
    last_name: player.lastName,
    name: player.name,
    photo_url: player.photoUrl,
    date_of_birth: player.dateOfBirth,
    nationality: player.nationality,
    second_nationality: player.secondNationality,
    is_african: player.isAfrican,
    position: player.position,
    position_raw: player.positionRaw,
    secondary_positions: player.secondaryPositions,
    club: player.club,
    previous_club: player.previousClub,
    teams: player.teams,
    league: player.league,
    league_country: player.leagueCountry,
    competition_id: player.competitionId,
    is_eastern_european_league: player.isEasternEuropeanLeague,
    height_cm: player.heightCm,
    preferred_foot: player.preferredFoot,
    agent: player.agent,
    market_value_eur: player.marketValueEUR,
    contract_expiry: player.contractExpiry,
    appearances: player.appearances,
    minutes: player.minutes,
    goals: player.goals,
    assists: player.assists,
    last_synced_at: nowIso,
    active: true,
    is_youth_or_reserve: player.isYouthOrReserve,
    is_debutant: player.isDebutant,
    debut_date: player.debutDate,
  };
}

async function inspectTeam(apiBase, apiKey, teamId, args) {
  const res = await fetchTeamPlayers(apiBase, apiKey, teamId, { gender: args.gender, retries: args.retries, debuts: true, onRetry });
  if (!res.ok) {
    console.error(`Inspect failed: ${res.error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`--- ${res.data.length} players returned for team ${teamId} ---`);
  console.log(JSON.stringify(res.data.slice(0, 2), null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const apiKey = args.apiKey || process.env.SCOUTASTIC_API_KEY;
  if (!apiKey) {
    console.error("No API key. Set the SCOUTASTIC_API_KEY environment variable and re-run.");
    process.exitCode = 1;
    return;
  }

  const clubSubdomain = args.clubSubdomain || process.env.SCOUTASTIC_CLUB_SUBDOMAIN || "kvmechelen";
  const apiBase = process.env.SCOUTASTIC_API_BASE_URL || baseUrl(clubSubdomain);
  const imageBaseUrl = new URL(apiBase).origin;

  if (args.inspectTeam) return inspectTeam(apiBase, apiKey, args.inspectTeam, args);

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    if (args.dryRun && args.onlyTeam) {
      console.log("(--dry-run --only-team with no database — no competition context, league/debut fields will be null.)");
    } else {
      console.error(
        "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set. " +
          (args.dryRun
            ? "Set both to test the crawl against the real queue/competitions without writing anything, or pass --only-team <id> to test one team with no database at all."
            : "Nothing can be written without them.")
      );
      process.exitCode = 1;
      return;
    }
  }

  // Reads always happen when credentials are present, even in --dry-run —
  // only the actual write calls further down are gated on `!args.dryRun`.
  // service_role is fine to use for read-only dry-run testing too; it's
  // the same credential either way, just not exercising its write path.
  let db = null;
  if (supabaseUrl && serviceRoleKey) {
    const { createClient } = await import("@supabase/supabase-js");
    db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  }

  console.log("SCOUTASTIC PLAYER SYNC STARTED");
  const startedAt = Date.now();
  const nowIso = new Date().toISOString();
  const easternEuropeCountries = new Set(loadJson(EASTERN_EUROPE_PATH, []));

  // --- 1. Load the competition catalog once (cheap: ~2,435 rows) ---
  let competitionsById = new Map();
  if (db) {
    const res = await fetchAllRows(db, "scoutastic_competitions", "competition_id,area,is_european,age_category,gender,is_active,level");
    if (!res.ok) {
      console.error(`Failed to load competitions: ${res.error.message}`);
      process.exitCode = 1;
      return;
    }
    competitionsById = new Map(res.data.map((c) => [c.competition_id, c]));
  }
  if (competitionsById.size === 0 && !args.dryRun) {
    console.error("No competitions in scoutastic_competitions — run scripts/sync-competitions.mjs first.");
    process.exitCode = 1;
    return;
  }

  function isInScope(competitionId) {
    const c = competitionsById.get(competitionId);
    return Boolean(c && c.is_european && c.is_active && c.age_category === "Senior" && c.gender === "male");
  }

  // --- 2. Pick a batch of teams to crawl ---
  let teamIds;
  if (args.onlyTeam) {
    teamIds = [args.onlyTeam];
  } else if (db) {
    const { data, error } = await db
      .from("scoutastic_teams")
      .select("team_id")
      .order("last_crawled_at", { ascending: true, nullsFirst: true })
      .limit(args.batchSize);
    if (error) {
      console.error(`Failed to load team queue: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    teamIds = data.map((r) => r.team_id);
  } else {
    console.error("--dry-run needs --only-team <id> (no database to read the team queue from).");
    process.exitCode = 1;
    return;
  }

  if (teamIds.length === 0) {
    console.log("No teams to crawl (queue empty — run scripts/sync-competitions.mjs first, or everything is already up to date).");
    return;
  }

  // --- 3. Find each team's primary in-scope competition ---
  let teamCompetitions = new Map(); // team_id -> competition_id
  if (db) {
    const { data, error } = await db.from("competition_teams").select("competition_id,team_id").in("team_id", teamIds);
    if (error) {
      console.error(`Failed to load competition_teams: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    const byTeam = new Map();
    for (const row of data) {
      if (!isInScope(row.competition_id)) continue;
      const list = byTeam.get(row.team_id) ?? [];
      list.push(row.competition_id);
      byTeam.set(row.team_id, list);
    }
    for (const [teamId, compIds] of byTeam) {
      const primary = compIds
        .map((id) => competitionsById.get(id))
        .sort((a, b) => (a.level ?? 999) - (b.level ?? 999))[0];
      teamCompetitions.set(teamId, primary.competition_id);
    }
  } else if (args.onlyTeam) {
    console.log("(--dry-run --only-team: no competition context available — league/debut fields will be null for this test.)");
  }

  // --- 4. Crawl ---
  let teamsProcessed = 0;
  let teamsSkippedNoContext = 0;
  let teamsFailed = 0;
  let playersRetrieved = 0;
  let playersUpserted = 0;
  let playersFailed = 0;
  let debutantsFound = 0;
  const failures = [];
  const crawledTeamIds = [];

  for (const teamId of teamIds) {
    const competitionId = teamCompetitions.get(teamId) ?? null;
    const competition = competitionId ? competitionsById.get(competitionId) : null;

    if (!competitionId && db) {
      // Team is queued but has no in-scope competition link (e.g. the
      // competition it belonged to became inactive since it was queued)
      // — still mark it crawled so it doesn't block the batch forever,
      // but don't fetch a squad for it.
      teamsSkippedNoContext++;
      crawledTeamIds.push(teamId);
      continue;
    }

    const res = await fetchTeamPlayers(apiBase, apiKey, teamId, {
      gender: args.gender,
      retries: args.retries,
      debuts: true,
      onRetry,
    });
    await sleep(args.delayMs);

    if (!res.ok) {
      teamsFailed++;
      failures.push({ teamId, error: res.error });
      console.error(`  [fail] team ${teamId}: ${res.error}`);
      continue;
    }

    teamsProcessed++;
    crawledTeamIds.push(teamId);

    const playerRows = [];
    for (const raw of res.data) {
      playersRetrieved++;
      try {
        const { player, warnings } = mapScoutasticPlayer(raw, {
          externalId: raw.externalId ?? raw.id,
          competitionId,
          competitionCountry: competition?.area ?? null,
          isEasternEuropeanLeague: competition ? easternEuropeCountries.has(competition.area) : false,
          nowIso,
          imageBaseUrl,
        });
        warnings.forEach((w) => console.error(`  [warn] ${player.name || player.scoutasticPlayerId}: ${w}`));
        if (player.isDebutant) debutantsFound++;
        playerRows.push(toPlayerRow(player, nowIso));
      } catch (err) {
        playersFailed++;
        failures.push({ teamId, scope: "player", error: String(err) });
        console.error(`  [fail] player on team ${teamId}: ${err}`);
      }
    }

    if (!args.dryRun && playerRows.length > 0) {
      const { error } = await db.from("players").upsert(playerRows, { onConflict: "scoutastic_player_id" });
      if (error) {
        console.error(`  [fail] upsert for team ${teamId}: ${error.message}`);
        playersFailed += playerRows.length;
      } else {
        playersUpserted += playerRows.length;
      }
    } else if (args.dryRun) {
      playersUpserted += playerRows.length; // counted as "would upsert"
    }

    console.log(`[team ${teamId}${competition ? ` / ${competition.area}` : ""}] ${res.data.length} players`);
  }

  // --- 5. Mark crawled teams (advances the resumable queue) ---
  if (!args.dryRun && crawledTeamIds.length > 0) {
    const { error } = await db.from("scoutastic_teams").update({ last_crawled_at: nowIso }).in("team_id", crawledTeamIds);
    if (error) console.error(`  [fail] updating last_crawled_at: ${error.message}`);
  }

  // --- 6. Update sync_meta ---
  const durationSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  const status = teamsFailed === 0 ? "success" : teamsProcessed > 0 ? "partial" : "failed";

  if (!args.dryRun && db) {
    const [{ count: playersCount }, { count: activePlayersCount }] = await Promise.all([
      db.from("players").select("id", { count: "exact", head: true }),
      db.from("players").select("id", { count: "exact", head: true }).eq("active", true),
    ]);
    const { error } = await db.from("sync_meta").upsert(
      {
        source: "SCOUTASTIC",
        last_synced_at: nowIso,
        last_sync_status: status,
        last_sync_summary: {
          competitionsAttempted: teamIds.length,
          competitionsSucceeded: teamsProcessed,
          competitionsFailed: failures.filter((f) => !f.scope).map((f) => f.teamId),
          playersRetrieved,
          playersCreated: 0, // not distinguished from updated in an upsert-only design
          playersUpdated: playersUpserted,
          playersUnchanged: 0,
          playersFailed,
          playersDeactivated: 0,
          durationSeconds: Number(durationSec),
        },
        players_count: playersCount ?? 0,
        active_players_count: activePlayersCount ?? 0,
      },
      { onConflict: "source" }
    );
    if (error) console.error(`  [fail] updating sync_meta: ${error.message}`);
  }

  console.log(`\nTeams processed: ${teamsProcessed}`);
  if (teamsSkippedNoContext) console.log(`Teams skipped (no in-scope competition): ${teamsSkippedNoContext}`);
  console.log(`Teams failed: ${teamsFailed}`);
  console.log(`Players retrieved: ${playersRetrieved}`);
  console.log(`Players upserted${args.dryRun ? " (dry-run, not written)" : ""}: ${playersUpserted}`);
  console.log(`Players failed: ${playersFailed}`);
  console.log(`New/recent debutants detected this batch: ${debutantsFound}`);
  console.log(`Duration: ${durationSec}s`);
  console.log(`Sync completed: ${nowIso.slice(0, 16).replace("T", " ")}`);
  if (args.dryRun) console.log("(--dry-run: nothing written to Postgres)");

  if (status === "failed") process.exitCode = 1;
}

main();
