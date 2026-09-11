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
    else if (a === "--dry-run") args.dryRun = true;
  }
  return args;
}

/** Paginated read — PostgREST caps a `.select()` at 1,000 rows/request regardless of `.limit()` (see docs/SCOUTASTIC_SYNC.md; same pattern reused from scripts/sync-matches.mjs). */
async function fetchAllRows(db, table, columns, build = (q) => q) {
  const rows = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await build(db.from(table).select(columns)).range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
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
  const rows = await fetchAllRows(db, "impect_player_kpis", "iteration_id,player_id,position,minutes,kpis", (q) =>
    q.in("position", rawPositions).gte("minutes", MIN_MINUTES_FOR_RATING)
  );
  return rows.map((r) => ({ playerId: r.player_id, iterationId: r.iteration_id, position: r.position, minutes: r.minutes, kpis: r.kpis ?? {} }));
}

async function loadJoinTables(db, playerIds, squadIds, iterationIds) {
  const [players, squads, competitions] = await Promise.all([
    playerIds.size > 0 ? fetchAllRows(db, "impect_players", "player_id,commonname,birthdate,transfermarkt_id", (q) => q.in("player_id", [...playerIds])) : [],
    squadIds.size > 0 ? fetchAllRows(db, "impect_squads", "squad_id,name", (q) => q.in("squad_id", [...squadIds])) : [],
    iterationIds.size > 0
      ? fetchAllRows(db, "impect_competitions", "iteration_id,competition_name,season", (q) => q.in("iteration_id", [...iterationIds]))
      : [],
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
    console.error("Usage: --player-id <id> --iteration-id <id>  OR  --all --iteration-id <id> [--squad-id <id>]");
    process.exitCode = 1;
    return;
  }
  if (!args.iterationId) {
    console.error("--iteration-id is required.");
    process.exitCode = 1;
    return;
  }

  console.log("PLAYER RATING CALCULATION STARTED");

  let targetRows;
  if (args.playerId) {
    targetRows = await fetchAllRows(db, "impect_player_kpis", "iteration_id,squad_id,player_id,position,minutes,match_share,kpis", (q) =>
      q.eq("iteration_id", args.iterationId).eq("player_id", args.playerId)
    );
    if (targetRows.length === 0) {
      console.error(`No impect_player_kpis row for player ${args.playerId} in iteration ${args.iterationId} — sync it first.`);
      process.exitCode = 1;
      return;
    }
  } else {
    targetRows = await fetchAllRows(db, "impect_player_kpis", "iteration_id,squad_id,player_id,position,minutes,match_share,kpis", (q) => {
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

  // One pool fetch per distinct position group actually needed, reused across every target in that group (a batch run needs this only once per group, not once per player).
  const poolByGroup = new Map();
  const results = [];
  let ratableCount = 0;
  let skippedCount = 0;

  for (const target of targets) {
    const group = positionGroup(target.position);
    if (!poolByGroup.has(group)) {
      poolByGroup.set(group, await fetchPoolForPositionGroup(db, group));
    }
    const pool = poolByGroup.get(group);

    // No real competition-strength-tier source exists yet beyond scoringConfig.mjs's own provisional map — every competition is its own "tier" for the fallback hierarchy's middle level today (a documented limitation, not a silent skip; see cohorts.mjs).
    const competitionTierByIterationId = new Map([[target.iterationId, target.competitionName]]);

    const rating = scorePlayer({ player: target, pool, competitionTierByIterationId });
    results.push(rating);
    if (rating.ratable) ratableCount++;
    else skippedCount++;
  }

  if (args.dryRun) {
    console.log(`(--dry-run) would write ${results.length} ratings (${ratableCount} ratable, ${skippedCount} not).`);
    console.log(JSON.stringify(results[0], null, 2));
    return;
  }

  const rows = results.map((r) => ({
    impect_player_id: Number(r.playerId),
    iteration_id: args.iterationId,
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
