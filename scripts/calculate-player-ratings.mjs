#!/usr/bin/env node
/**
 * CLI for the deterministic position-specific rating engine
 * (scripts/lib/scoring/) — the Node/TypeScript-repo-conventions
 * equivalent of the requested `python -m scoring calculate-player` /
 * `calculate-all` commands (this repo has no Python anywhere — see
 * docs/SCORING_MODEL.md for that adaptation's full reasoning).
 *
 * Reads real Impect data already synced by scripts/sync-impect-*.mjs
 * (impect_player_kpis/impect_players/impect_squads/impect_competitions)
 * — never calls the Impect API itself — and writes to `player_ratings`.
 * Ratings are computed server-side only; the frontend only ever reads
 * the stored result (src/lib/scoring-data/remote.ts).
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/calculate-player-ratings.mjs --player-id 45824 --iteration-id 2143
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/calculate-player-ratings.mjs --all --iteration-id 2143
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/calculate-player-ratings.mjs --all --squad-id 373 --iteration-id 2143  # just one club
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/calculate-player-ratings.mjs --all --all-synced-competitions  # every competition that actually has synced player-kpis data
 */

import { createClient } from "@supabase/supabase-js";
import { scorePlayer } from "./lib/scoring/service.mjs";
import { rawPositionsForGroup, positionGroup } from "./lib/scoring/positionGroup.mjs";
import { MIN_MINUTES_FOR_RATING } from "./lib/scoring/config/scoringConfig.mjs";

function parseArgs(argv) {
  const args = { all: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--player-id") args.playerId = Number(argv[++i]);
    else if (a === "--iteration-id") args.iterationId = Number(argv[++i]);
    else if (a === "--squad-id") args.squadId = Number(argv[++i]);
    else if (a === "--all") args.all = true;
    else if (a === "--all-synced-competitions") args.allSyncedCompetitions = true;
    else if (a === "--dry-run") args.dryRun = true;
  }
  return args;
}

/**
 * Keyset pagination on `cursorColumn` (a real column of `table`) — NOT
 * `.range()` offset pagination. Confirmed live, 2026-09-13, now that
 * the full 759-competition crawl is done: `fetchPoolForPositionGroup`'s
 * real result set (every synced player in one broad position group,
 * across every competition) got large enough that later `.range()`
 * pages hit Postgres's own statement timeout — the identical real bug
 * already fixed this session for the `players` table and the
 * SkillCorner player bridge (see scripts/sync-skillcorner-physical.mjs's
 * loadPlayerBridge). `cursorColumn` should be a column with many
 * distinct values relative to any single page (here, always
 * `iteration_id` — a single competition's real row count for one
 * position group is always far below the 1,000-row page size, so a
 * page boundary never actually splits one competition's rows).
 */
async function fetchAllRows(db, table, columns, cursorColumn, build = (q) => q) {
  const rows = [];
  const PAGE = 1000; // PostgREST's own real default max-rows cap — requesting more silently returns exactly this many anyway
  let cursor = -1;
  for (;;) {
    const { data, error } = await build(db.from(table).select(columns).gt(cursorColumn, cursor)).order(cursorColumn, { ascending: true }).limit(PAGE);
    if (error) throw error;
    if (data.length === 0) break;
    rows.push(...data);
    cursor = data[data.length - 1][cursorColumn];
  }
  return rows;
}

/** Joins raw player_kpis rows with identity + competition context into the shape scorePlayer() expects. */
function joinRows(kpiRows, playersById, squadsById, competitionsById) {
  return kpiRows.map((r) => {
    const player = playersById.get(r.player_id);
    const squad = squadsById.get(r.squad_id);
    const competition = competitionsById.get(r.iteration_id);
    return {
      playerId: r.player_id,
      name: player?.commonname ?? `Player ${r.player_id}`,
      birthdate: player?.birthdate ?? null,
      transfermarktId: player?.transfermarkt_id ?? null,
      position: r.position,
      minutes: r.minutes,
      matchShare: r.match_share ?? null,
      iterationId: r.iteration_id,
      squadId: r.squad_id,
      squadName: squad?.name ?? "Unknown",
      competitionName: competition?.competition_name ?? "Unknown",
      season: competition?.season ?? "Unknown",
      kpis: r.kpis ?? {},
    };
  });
}

/**
 * Cohort-pool rows deliberately skip the players/squads/competitions
 * join that `joinRows()` does for *target* players — cohorts.mjs and
 * preprocessing.mjs only ever read `playerId`/`iterationId`/`minutes`/
 * `kpis` off a pool row (percentile ranking needs the numbers, not
 * identity). Joining identity for a whole position group's pool (often
 * several thousand rows across every synced competition) built a
 * `.in("player_id", [...])` query string that overflowed PostgREST's
 * header size limit — confirmed live (HeadersOverflowError, 16KB+ URL).
 * Skipping the unnecessary join fixes that at the root instead of
 * chunking an `.in()` clause that didn't need to exist.
 */
async function fetchPoolForPositionGroup(db, group) {
  const rawPositions = rawPositionsForGroup(group);
  if (rawPositions.length === 0) return [];
  const rows = await fetchAllRows(db, "impect_player_kpis", "iteration_id,player_id,position,minutes,kpis", "iteration_id", (q) =>
    q.in("position", rawPositions).gte("minutes", MIN_MINUTES_FOR_RATING)
  );
  return rows.map((r) => ({ playerId: r.player_id, iterationId: r.iteration_id, position: r.position, minutes: r.minutes, kpis: r.kpis ?? {} }));
}

/**
 * A `.in()` list of more than a few hundred ids builds a request URL
 * that can exceed the platform's own URL-length limit (confirmed live:
 * "414 Request-URI Too Large" from Cloudflare, on top of the earlier
 * PostgREST-header-size failure — the same real class of bug,
 * surfacing at a different layer once the id list got large enough —
 * see fetchPoolForPositionGroup's comment for the first occurrence).
 * Chunking the `.in()` list itself, not just paginating the *response*
 * (fetchAllRows already does that), is what actually fixes it.
 */
async function fetchByIdsChunked(db, table, columns, idColumn, ids) {
  const CHUNK = 150;
  const idArray = [...ids];
  const rows = [];
  for (let i = 0; i < idArray.length; i += CHUNK) {
    const chunk = idArray.slice(i, i + CHUNK);
    // A single direct query, not fetchAllRows — each chunk is capped at
    // 150 ids, always far under PostgREST's own 1,000-row page cap, so
    // there's nothing to paginate and no cursor-column ambiguity across
    // this function's different real tables (impect_players/
    // impect_squads/impect_competitions each key on a different column).
    const { data, error } = await db.from(table).select(columns).in(idColumn, chunk);
    if (error) throw error;
    rows.push(...data);
  }
  return rows;
}

async function loadJoinTables(db, playerIds, squadIds, iterationIds) {
  const [players, squads, competitions] = await Promise.all([
    fetchByIdsChunked(db, "impect_players", "player_id,commonname,birthdate,transfermarkt_id", "player_id", playerIds),
    fetchByIdsChunked(db, "impect_squads", "squad_id,name", "squad_id", squadIds),
    fetchByIdsChunked(db, "impect_competitions", "iteration_id,competition_name,season", "iteration_id", iterationIds),
  ]);
  return {
    playersById: new Map(players.map((p) => [p.player_id, p])),
    squadsById: new Map(squads.map((s) => [s.squad_id, s])),
    competitionsById: new Map(competitions.map((c) => [c.iteration_id, c])),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set.");
    process.exitCode = 1;
    return;
  }
  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  if (!args.playerId && !args.all) {
    console.error("Usage: --player-id <id> --iteration-id <id>  OR  --all --iteration-id <id> [--squad-id <id>]  OR  --all --all-synced-competitions");
    process.exitCode = 1;
    return;
  }
  if (!args.iterationId && !args.allSyncedCompetitions) {
    console.error("--iteration-id is required (or pass --all-synced-competitions to cover every synced competition at once).");
    process.exitCode = 1;
    return;
  }

  console.log("PLAYER RATING CALCULATION STARTED");

  let targetRows;
  if (args.playerId) {
    targetRows = await fetchAllRows(db, "impect_player_kpis", "iteration_id,squad_id,player_id,position,minutes,match_share,kpis", "iteration_id", (q) =>
      q.eq("iteration_id", args.iterationId).eq("player_id", args.playerId)
    );
    if (targetRows.length === 0) {
      console.error(`No impect_player_kpis row for player ${args.playerId} in iteration ${args.iterationId} — sync it first.`);
      process.exitCode = 1;
      return;
    }
  } else if (args.allSyncedCompetitions) {
    // Every competition that genuinely has synced player-kpis data —
    // NOT `impect_competitions.last_synced_at`, which the catalog sync
    // (scripts/sync-impect-competitions.mjs) stamps on all 759 rows
    // regardless of whether player data was ever crawled for them (a
    // real bug this surfaced: the frontend's competition picker used
    // that same wrong signal — see src/lib/impect-data/remote.ts).
    targetRows = await fetchAllRows(db, "impect_player_kpis", "iteration_id,squad_id,player_id,position,minutes,match_share,kpis", "iteration_id");
  } else {
    // Filtered to one real, fixed iteration_id — every matching row
    // shares that exact value, so keyset-paginating on iteration_id
    // itself would wrongly stop after the first page for any
    // competition with more than 1,000 real rows (the cursor's `.gt()`
    // check could never find a "later" iteration_id). player_id varies
    // across every real row in a single competition, so it's the real,
    // safe cursor column for this specific query shape.
    targetRows = await fetchAllRows(db, "impect_player_kpis", "iteration_id,squad_id,player_id,position,minutes,match_share,kpis", "player_id", (q) => {
      let query = q.eq("iteration_id", args.iterationId);
      if (args.squadId) query = query.eq("squad_id", args.squadId);
      return query;
    });
  }

  const playerIds = new Set(targetRows.map((r) => r.player_id));
  const squadIds = new Set(targetRows.map((r) => r.squad_id));
  const iterationIds = new Set(targetRows.map((r) => r.iteration_id));
  const { playersById, squadsById, competitionsById } = await loadJoinTables(db, playerIds, squadIds, iterationIds);
  const targets = joinRows(targetRows, playersById, squadsById, competitionsById);

  // One pool fetch per distinct position group actually needed, reused
  // across every target in that group AND across every competition in
  // this run (an --all-synced-competitions run needs each group's pool
  // only once total, not once per competition) — competition-tier
  // context is passed per-call below so the shared pool never leaks a
  // wrong tier assumption across competitions.
  const poolByGroup = new Map();
  const competitionTierByIterationId = new Map(targets.map((t) => [t.iterationId, t.competitionName]));
  const results = [];
  let ratableCount = 0;
  let skippedCount = 0;

  for (const target of targets) {
    const group = positionGroup(target.position);
    if (!poolByGroup.has(group)) {
      poolByGroup.set(group, await fetchPoolForPositionGroup(db, group));
    }
    const pool = poolByGroup.get(group);

    const rating = scorePlayer({ player: target, pool, competitionTierByIterationId });
    results.push({ rating, iterationId: target.iterationId });
    if (rating.ratable) ratableCount++;
    else skippedCount++;
  }

  if (args.dryRun) {
    console.log(`(--dry-run) would write ${results.length} ratings (${ratableCount} ratable, ${skippedCount} not).`);
    console.log(JSON.stringify(results[0]?.rating, null, 2));
    return;
  }

  const rows = results.map(({ rating: r, iterationId }) => ({
    impect_player_id: Number(r.playerId),
    iteration_id: iterationId,
    scoutastic_player_id: r.scoutasticPlayerId,
    model_version: r.modelVersion,
    calculated_at: r.calculatedAt,
    ratable: r.ratable,
    reason: r.reason ?? null,
    current_level: r.currentLevel,
    current_level_band: r.currentLevelBand,
    potential: r.potential,
    potential_range_low: r.potentialRange?.low ?? null,
    potential_range_high: r.potentialRange?.high ?? null,
    overall_percentile: r.overallPercentile,
    confidence_score: r.confidence.score,
    confidence_label: r.confidence.label,
    confidence_reasons: r.confidence.reasons,
    context: r.context,
    kv_fit: r.kvMechelenFit,
    pillars: r.pillars,
    strengths: r.strengths,
    weaknesses: r.weaknesses,
    development_priorities: r.developmentPriorities,
    explanation: r.explanation,
    warnings: r.warnings,
  }));

  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await db.from("player_ratings").upsert(rows.slice(i, i + BATCH), { onConflict: "impect_player_id,iteration_id" });
    if (error) throw error;
  }

  console.log(`Wrote ${rows.length} ratings (${ratableCount} ratable, ${skippedCount} not ratable — see each row's "reason").`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
