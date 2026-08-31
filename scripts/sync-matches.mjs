#!/usr/bin/env node
/**
 * SCOUTASTIC match sync — powers the Explore feature (docs/EXPLORE.md).
 *
 * GET /matches only really filters by `competitionId` + `season`
 * (confirmed — `date`/`matchId` are silently ignored) — so "browse
 * matches by day" is only possible by syncing matches into Postgres and
 * querying there, same reasoning as the player crawl.
 *
 * Scoped to each in-scope competition's *current* season only (from
 * `scoutastic_competitions.current_season`, already known from
 * sync-competitions.mjs) — not the full historical archive SCOUTASTIC
 * also has back to the 1970s. One request per competition in the common
 * case (a season rarely exceeds the 1,000-row page size); not
 * batched/resumable like the player crawl since the whole pass is a few
 * hundred requests, similar cost to sync-competitions.mjs.
 *
 * Usage:
 *   SCOUTASTIC_API_KEY=... node scripts/sync-matches.mjs --dry-run
 *   SCOUTASTIC_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/sync-matches.mjs
 *
 * Credentials are read exclusively from environment variables — never
 * written to any file this script produces, never logged, never printed.
 */

import { baseUrl, fetchCompetitionMatches } from "./lib/scoutasticClient.mjs";

function parseArgs(argv) {
  const args = { gender: "male", delayMs: 200, retries: 3, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--delay-ms") args.delayMs = Number(argv[++i]);
    else if (a === "--retries") args.retries = Number(argv[++i]);
    else if (a === "--api-key") args.apiKey = argv[++i];
    else if (a === "--club-subdomain") args.clubSubdomain = argv[++i];
    else if (a === "--only-competition") args.onlyCompetition = argv[++i]; // testing: one competition only
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function onRetry({ url, status, attempt, retries, waitMs }) {
  console.error(`  [retry] ${url} status=${status}, waiting ${waitMs}ms (attempt ${attempt}/${retries})`);
}

/** Paginated read helper — PostgREST caps a `.select()` at 1,000 rows/request even with an explicit larger `.limit()` (see docs/SCOUTASTIC_SYNC.md). */
async function fetchAllRows(db, table, columns, build = (q) => q) {
  const rows = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await build(db.from(table).select(columns)).range(from, from + PAGE - 1);
    if (error) return { ok: false, error };
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return { ok: true, data: rows };
}

/** Maps one raw SCOUTASTIC match object to our `matches` row shape. */
function mapMatch(raw, nowIso) {
  return {
    id: String(raw.transfermarktId ?? ""),
    competition_id: typeof raw.competitionId === "string" ? raw.competitionId : null,
    season: typeof raw.season === "string" ? raw.season : null,
    matchday: typeof raw.matchday === "number" ? raw.matchday : null,
    date: typeof raw.date === "string" ? raw.date : null,
    status: typeof raw.status === "string" ? raw.status : null,
    score: typeof raw.score === "string" ? raw.score : null,
    score_home: raw.scoreHome !== undefined && raw.scoreHome !== null ? Number(raw.scoreHome) : null,
    score_away: raw.scoreAway !== undefined && raw.scoreAway !== null ? Number(raw.scoreAway) : null,
    home_team_id: raw.homeTeamId !== undefined && raw.homeTeamId !== null ? String(raw.homeTeamId) : null,
    away_team_id: raw.awayTeamId !== undefined && raw.awayTeamId !== null ? String(raw.awayTeamId) : null,
    home_team_name: typeof raw.homeTeamName === "string" ? raw.homeTeamName : null,
    away_team_name: typeof raw.awayTeamName === "string" ? raw.awayTeamName : null,
    home_team_tactic: typeof raw.homeTeamTactic === "string" ? raw.homeTeamTactic : null,
    away_team_tactic: typeof raw.awayTeamTactic === "string" ? raw.awayTeamTactic : null,
    venue_name: typeof raw.venueName === "string" ? raw.venueName : null,
    venue_city: typeof raw.venueCity === "string" ? raw.venueCity : null,
    venue_area: typeof raw.venueArea === "string" ? raw.venueArea : null,
    referee_name: typeof raw.refereeName === "string" ? raw.refereeName : null,
    home_team_players: Array.isArray(raw.homeTeamPlayers) ? raw.homeTeamPlayers : [],
    away_team_players: Array.isArray(raw.awayTeamPlayers) ? raw.awayTeamPlayers : [],
    events: Array.isArray(raw.events) ? raw.events : [],
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

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — needed to read the competition list even for --dry-run " +
        "(unless --only-competition is also given)."
    );
    if (!args.onlyCompetition) {
      process.exitCode = 1;
      return;
    }
  }

  let db = null;
  if (supabaseUrl && serviceRoleKey) {
    const { createClient } = await import("@supabase/supabase-js");
    db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  }

  console.log("MATCH SYNC STARTED");
  const startedAt = Date.now();
  const nowIso = new Date().toISOString();

  let competitions;
  if (args.onlyCompetition) {
    // Testing convenience: season is required by the API, but we don't
    // know a specific competition's current_season without the database —
    // default to the current calendar year, overridable isn't needed for
    // a quick manual test.
    competitions = [{ competition_id: args.onlyCompetition, current_season: String(new Date().getFullYear()) }];
  } else {
    const res = await fetchAllRows(db, "scoutastic_competitions", "competition_id,current_season", (q) =>
      q.eq("is_european", true).eq("is_active", true).eq("age_category", "Senior").eq("gender", "male").not("current_season", "is", null)
    );
    if (!res.ok) {
      console.error(`Failed to load competitions: ${res.error.message}`);
      process.exitCode = 1;
      return;
    }
    competitions = res.data;
  }

  console.log(`Competitions to sync: ${competitions.length}`);

  let competitionsOk = 0;
  let competitionsFailed = 0;
  let matchesRetrieved = 0;
  let matchesUpserted = 0;
  const failures = [];

  for (const comp of competitions) {
    const res = await fetchCompetitionMatches(apiBase, apiKey, comp.competition_id, comp.current_season, { retries: 3, onRetry });
    await sleep(args.delayMs);

    if (!res.ok) {
      competitionsFailed++;
      failures.push({ competitionId: comp.competition_id, error: res.error });
      console.error(`  [fail] ${comp.competition_id}: ${res.error}`);
      continue;
    }

    competitionsOk++;
    matchesRetrieved += res.data.length;
    const rows = res.data.filter((m) => typeof m?.transfermarktId === "string" && m.transfermarktId).map((m) => mapMatch(m, nowIso));

    console.log(`[${comp.competition_id}] ${rows.length} matches (season ${comp.current_season})`);

    if (!args.dryRun && db && rows.length > 0) {
      const BATCH = 500;
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const { error } = await db.from("matches").upsert(batch, { onConflict: "id" });
        if (error) {
          console.error(`  [fail] upsert for ${comp.competition_id} batch ${i}-${i + batch.length}: ${error.message}`);
        } else {
          matchesUpserted += batch.length;
        }
      }
    } else if (args.dryRun) {
      matchesUpserted += rows.length;
    }
  }

  const durationSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\nCompetitions synced: ${competitionsOk}/${competitions.length}`);
  if (competitionsFailed) console.log(`Competitions failed: ${competitionsFailed}`);
  console.log(`Matches retrieved: ${matchesRetrieved}`);
  console.log(`Matches upserted${args.dryRun ? " (dry-run, not written)" : ""}: ${matchesUpserted}`);
  console.log(`Duration: ${durationSec}s`);
  console.log(`Sync completed: ${nowIso.slice(0, 16).replace("T", " ")}`);
  if (args.dryRun) console.log("(--dry-run: nothing written to Postgres)");

  if (competitionsOk === 0 && competitions.length > 0) process.exitCode = 1;
}

main();
