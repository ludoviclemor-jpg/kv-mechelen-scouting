#!/usr/bin/env node
/**
 * SCOUTASTIC competition sync — discovers every competition SCOUTASTIC
 * knows about (GET /competitions, confirmed ~2,439 worldwide — see
 * docs/COMPETITIONS.md for the confirmed response shape) and upserts them
 * into Postgres (`scoutastic_competitions`, `competition_teams`).
 *
 * Deliberately cheap and NOT batched/resumable like the player-squad
 * crawl: the whole discovery is ~25 requests (at limit=100), since a
 * competition's team list comes back inline — there's no reason to spread
 * this over multiple runs, so every run does a complete pass.
 *
 * Stores every competition, not just European ones — `is_european`
 * (association = 'UEFA') is a column, not a fetch-time filter, so the
 * Competitions page can default to Europe without losing the ability to
 * broaden scope later without a re-crawl.
 *
 * Usage:
 *   SCOUTASTIC_API_KEY=... node scripts/sync-competitions.mjs --dry-run
 *   SCOUTASTIC_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/sync-competitions.mjs
 *
 * Credentials are read exclusively from environment variables — never
 * written to any file this script produces, never logged, never printed.
 * SUPABASE_SERVICE_ROLE_KEY bypasses Row Level Security by design (that's
 * what lets a backend script write to tables the frontend can only read)
 * — it must never reach the browser or a committed file; GitHub Actions
 * secret only, same handling as SCOUTASTIC_API_KEY.
 */

import { baseUrl, fetchAllCompetitions } from "./lib/scoutasticClient.mjs";

function parseArgs(argv) {
  const args = { gender: "male", delayMs: 200, retries: 3, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--delay-ms") args.delayMs = Number(argv[++i]);
    else if (a === "--retries") args.retries = Number(argv[++i]);
    else if (a === "--gender") args.gender = argv[++i];
    else if (a === "--club-subdomain") args.clubSubdomain = argv[++i];
    else if (a === "--api-key") args.apiKey = argv[++i];
  }
  return args;
}

function onRetry({ url, status, attempt, retries, waitMs }) {
  console.error(`  [retry] ${url} status=${status}, waiting ${waitMs}ms (attempt ${attempt}/${retries})`);
}

/** Maps one raw SCOUTASTIC competition object to our `scoutastic_competitions` row shape. */
function mapCompetition(raw, nowIso) {
  return {
    competition_id: String(raw.transfermarktId ?? ""),
    name: typeof raw.name === "string" ? raw.name : null,
    area: typeof raw.area === "string" ? raw.area : null,
    association: typeof raw.association === "string" ? raw.association : null,
    is_european: raw.association === "UEFA",
    age_category: typeof raw.ageCategory === "string" ? raw.ageCategory : null,
    gender: typeof raw.gender === "string" ? raw.gender : null,
    is_active: Boolean(raw.isActive),
    level: typeof raw.level === "number" ? raw.level : null,
    level_definition: typeof raw.levelDefinition === "string" ? raw.levelDefinition : null,
    logo_url: typeof raw.imageUrlV2 === "string" && raw.imageUrlV2 ? raw.imageUrlV2 : null,
    available_seasons: Array.isArray(raw.availableSeasons) ? raw.availableSeasons : [],
    current_season: typeof raw.season === "number" ? raw.season : null,
    season_start_date: typeof raw.startDate === "string" ? raw.startDate.slice(0, 10) : null,
    season_end_date: typeof raw.endDate === "string" ? raw.endDate.slice(0, 10) : null,
    team_count: Array.isArray(raw.teamIds) ? raw.teamIds.length : 0,
    last_scoutastic_sync_at: nowIso,
  };
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

  console.log("COMPETITION SYNC STARTED");
  const startedAt = Date.now();

  const result = await fetchAllCompetitions(apiBase, apiKey, { gender: args.gender, retries: args.retries, onRetry });
  if (!result.ok) {
    console.error(`Failed to fetch competitions: ${result.error}`);
    process.exitCode = 1;
    return;
  }

  const nowIso = new Date().toISOString();
  const raw = result.data.filter((c) => typeof c?.transfermarktId === "string" && c.transfermarktId);
  const skippedNoId = result.data.length - raw.length;

  const competitions = raw.map((c) => mapCompetition(c, nowIso));
  const european = competitions.filter((c) => c.is_european);
  const europeanActive = european.filter((c) => c.is_active);
  const europeanSeniorMale = europeanActive.filter((c) => c.age_category === "Senior" && c.gender === "male");

  const competitionTeamRows = raw.flatMap((c) =>
    Array.isArray(c.teamIds) ? c.teamIds.map((teamId) => ({ competition_id: c.transfermarktId, team_id: String(teamId) })) : []
  );

  const durationSec = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log(`\nCompetitions fetched: ${result.data.length}${result.partial ? " (partial — a later page failed)" : ""}`);
  if (skippedNoId) console.log(`Skipped (no transfermarktId): ${skippedNoId}`);
  console.log(`European (association = UEFA): ${european.length}`);
  console.log(`  active: ${europeanActive.length}`);
  console.log(`  active + Senior + male: ${europeanSeniorMale.length}`);
  console.log(`Competition-team links: ${competitionTeamRows.length}`);
  console.log(`Fetch duration: ${durationSec}s`);

  if (args.dryRun) {
    console.log("\n--dry-run: nothing written. Sample of 3 European competitions:");
    console.log(JSON.stringify(european.slice(0, 3), null, 2));
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "\nSUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — nothing written. " +
        "Re-run with --dry-run to inspect results without a database, or set both env vars to persist."
    );
    process.exitCode = 1;
    return;
  }

  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  console.log("\nUpserting competitions...");
  const COMP_BATCH = 500;
  for (let i = 0; i < competitions.length; i += COMP_BATCH) {
    const batch = competitions.slice(i, i + COMP_BATCH);
    const { error } = await db.from("scoutastic_competitions").upsert(batch, { onConflict: "competition_id" });
    if (error) {
      console.error(`  [fail] competitions batch ${i}-${i + batch.length}: ${error.message}`);
      process.exitCode = 1;
    }
  }

  console.log("Upserting competition-team links...");
  const LINK_BATCH = 1000;
  for (let i = 0; i < competitionTeamRows.length; i += LINK_BATCH) {
    const batch = competitionTeamRows.slice(i, i + LINK_BATCH);
    const { error } = await db.from("competition_teams").upsert(batch, { onConflict: "competition_id,team_id" });
    if (error) {
      console.error(`  [fail] competition_teams batch ${i}-${i + batch.length}: ${error.message}`);
      process.exitCode = 1;
    }
  }

  console.log("Queuing newly-discovered teams for the squad crawl...");
  const uniqueTeamIds = [...new Set(competitionTeamRows.map((r) => r.team_id))];
  const TEAM_BATCH = 1000;
  for (let i = 0; i < uniqueTeamIds.length; i += TEAM_BATCH) {
    const batch = uniqueTeamIds.slice(i, i + TEAM_BATCH).map((team_id) => ({ team_id }));
    // ignoreDuplicates: a team already in the crawl queue keeps its
    // existing last_crawled_at — this only ever adds newly-seen teams.
    const { error } = await db.from("scoutastic_teams").upsert(batch, { onConflict: "team_id", ignoreDuplicates: true });
    if (error) {
      console.error(`  [fail] scoutastic_teams batch ${i}-${i + batch.length}: ${error.message}`);
      process.exitCode = 1;
    }
  }

  console.log(`\nDone. ${competitions.length} competitions, ${competitionTeamRows.length} links, ${uniqueTeamIds.length} unique teams queued.`);
  console.log(`Sync completed: ${nowIso.slice(0, 16).replace("T", " ")}`);
}

main();
