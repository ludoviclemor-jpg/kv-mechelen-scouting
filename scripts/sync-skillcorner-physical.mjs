#!/usr/bin/env node
/**
 * Resumable SkillCorner physical-data crawl — works through
 * `skillcorner_sync_queue` (seeded by
 * scripts/sync-skillcorner-competition-editions.mjs) a bounded batch of
 * competition editions at a time, oldest/never-synced first, same
 * pattern as scripts/sync-impect-player-kpis.mjs.
 *
 * For each competition edition, fetches real per-player, per-90-
 * normalized physical metrics (GET /api/physical/?competition_edition=X
 * &group_by=player&average_per=p90, confirmed live) and matches each
 * SkillCorner player to this project's own `players` table by an exact
 * (normalized name, birthdate) match — the only real bridge SkillCorner
 * offers (it has no cross-reference id of its own, see
 * skillcornerClient.mjs's header). A SkillCorner player who doesn't
 * match is skipped, never guessed.
 *
 * Usage:
 *   SKILLCORNER_USERNAME=... SKILLCORNER_PASSWORD=... \
 *     SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/sync-skillcorner-physical.mjs [--batch-size 25] [--delay-ms 150] [--only 1194]
 */

import { createClient } from "@supabase/supabase-js";
import { createSkillcornerClient, sleep } from "./lib/skillcornerClient.mjs";

function parseArgs(argv) {
  const args = { batchSize: 25, delayMs: 150, only: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--batch-size") args.batchSize = Number(argv[++i]);
    else if (a === "--delay-ms") args.delayMs = Number(argv[++i]);
    else if (a === "--only") args.only = Number(argv[++i]);
  }
  return args;
}

function onRetry({ path, status, attempt, retries, waitMs }) {
  console.error(`  [retry] ${path} status=${status}, waiting ${waitMs}ms (attempt ${attempt}/${retries})`);
}

function normalizeName(name) {
  return (name ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // strip diacritics — real accent-rendering differences seen between Scoutastic and SkillCorner exports
}

/**
 * Loads every real (name, birthdate) -> scoutastic_player_id pair once.
 * Players without a birthdate can never be matched (no reliable
 * disambiguator), so they're excluded rather than risking a false match
 * on name alone.
 *
 * Keyset pagination (order by the unique `scoutastic_player_id`, page
 * via `.gt()` on the last-seen id), not `.range()` offset pagination —
 * confirmed live that `.range()` over this table's real ~180k rows hits
 * Postgres's own statement timeout on later pages (OFFSET must scan and
 * discard every skipped row first, getting slower each page); keyset
 * pagination's `WHERE id > cursor` stays a fast indexed lookup on every
 * page regardless of how far in it is.
 */
async function loadPlayerBridge(db) {
  const map = new Map();
  const PAGE = 1000;
  let cursor = "";
  for (;;) {
    const { data, error } = await db
      .from("players")
      .select("scoutastic_player_id,name,date_of_birth")
      .not("date_of_birth", "is", null)
      .gt("scoutastic_player_id", cursor)
      .order("scoutastic_player_id", { ascending: true })
      .limit(PAGE);
    if (error) throw error;
    for (const r of data) map.set(`${r.date_of_birth}|${normalizeName(r.name)}`, r.scoutastic_player_id);
    if (data.length < PAGE) break;
    cursor = data[data.length - 1].scoutastic_player_id;
  }
  return map;
}

function mapPhysicalRow(row, competitionEditionId, competitionName, seasonName, scoutasticPlayerId) {
  return {
    scoutastic_player_id: scoutasticPlayerId,
    competition_edition_id: competitionEditionId,
    skillcorner_player_id: row.player_id,
    competition_name: competitionName,
    season_name: seasonName,
    position: row.position ?? null,
    position_group: row.position_group ?? null,
    count_match: row.count_match,
    minutes_avg_per_match: row.minutes_full_all ?? null,
    total_distance_p90: row.total_distance_full_all_p90 ?? null,
    total_metersperminute: row.total_metersperminute_full_all_p90 ?? row.total_metersperminute_full_all ?? null,
    running_distance_p90: row.running_distance_full_all_p90 ?? null,
    hsr_distance_p90: row.hsr_distance_full_all_p90 ?? null,
    hsr_count_p90: row.hsr_count_full_all_p90 ?? null,
    sprint_distance_p90: row.sprint_distance_full_all_p90 ?? null,
    sprint_count_p90: row.sprint_count_full_all_p90 ?? null,
    hi_distance_p90: row.hi_distance_full_all_p90 ?? null,
    hi_count_p90: row.hi_count_full_all_p90 ?? null,
    medaccel_count_p90: row.medaccel_count_full_all_p90 ?? null,
    highaccel_count_p90: row.highaccel_count_full_all_p90 ?? null,
    meddecel_count_p90: row.meddecel_count_full_all_p90 ?? null,
    highdecel_count_p90: row.highdecel_count_full_all_p90 ?? null,
    psv99: row.psv99 ?? null,
    psv99_top5: row.psv99_top5 ?? null,
    peak_velocity: row.peak_velocity ?? null,
    peak_velocity_top3: row.peak_velocity_top3 ?? null,
    updated_at: new Date().toISOString(),
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
  const skillcorner = createSkillcornerClient();

  console.log("SKILLCORNER PHYSICAL-DATA CRAWL STARTED");
  console.log("Loading the real player bridge (name + birthdate) from `players`…");
  const bridge = await loadPlayerBridge(db);
  console.log(`Bridge ready: ${bridge.size} real (name, birthdate) pairs.`);

  let queue;
  if (args.only !== null) {
    const { data, error } = await db.from("skillcorner_competition_editions").select("id,competition_name,season_name").eq("id", args.only).single();
    if (error) throw error;
    queue = [data];
  } else {
    const { data, error: queueError } = await db
      .from("skillcorner_sync_queue")
      .select("competition_edition_id, skillcorner_competition_editions(id,competition_name,season_name)")
      .order("last_synced_at", { ascending: true, nullsFirst: true })
      .limit(args.batchSize);
    if (queueError) throw queueError;
    queue = (data ?? []).map((r) => r.skillcorner_competition_editions);
  }

  if (!queue || queue.length === 0) {
    console.log("Queue is empty — run sync-skillcorner-competition-editions.mjs first.");
    return;
  }
  console.log(`Processing ${queue.length} competition editions this run.`);

  let editionsOk = 0;
  let rowsWritten = 0;
  let rowsUnmatched = 0;

  for (const edition of queue) {
    try {
      // group_by includes position_group because SkillCorner tracks it
      // per match, not as one fixed season role (confirmed live: the
      // same player gets a separate row per position_group they were
      // tracked in that competition) — grouping by player alone silently
      // drops the field entirely. For each player, the row with the
      // most matches is kept as their representative position/season
      // profile — a real, disclosed simplification (their most common
      // real role), not a fabricated single value.
      const rows = await skillcorner.getAllCursor(
        "/physical/",
        { competition_edition: String(edition.id), group_by: "player,position_group", average_per: "p90", page_size: "100" },
        { onRetry }
      );
      await sleep(args.delayMs);

      const primaryRowByPlayer = new Map();
      for (const row of rows) {
        const existing = primaryRowByPlayer.get(row.player_id);
        if (!existing || row.count_match > existing.count_match) primaryRowByPlayer.set(row.player_id, row);
      }

      const physicalRows = [];
      for (const row of primaryRowByPlayer.values()) {
        const key = `${row.player_birthdate}|${normalizeName(row.player_name)}`;
        const scoutasticPlayerId = bridge.get(key);
        if (!scoutasticPlayerId) {
          rowsUnmatched++;
          continue;
        }
        physicalRows.push(mapPhysicalRow(row, edition.id, edition.competition_name, edition.season_name, scoutasticPlayerId));
      }

      if (physicalRows.length > 0) {
        const BATCH = 500;
        for (let i = 0; i < physicalRows.length; i += BATCH) {
          const { error } = await db
            .from("skillcorner_player_physical")
            .upsert(physicalRows.slice(i, i + BATCH), { onConflict: "scoutastic_player_id,competition_edition_id" });
          if (error) throw error;
        }
      }

      await db.from("skillcorner_sync_queue").update({ last_synced_at: new Date().toISOString() }).eq("competition_edition_id", edition.id);
      await db.from("skillcorner_competition_editions").update({ last_synced_at: new Date().toISOString() }).eq("id", edition.id);

      editionsOk++;
      rowsWritten += physicalRows.length;
      console.log(`  [${edition.id}] ${edition.competition_name} ${edition.season_name}: ${rows.length} SkillCorner rows, ${physicalRows.length} matched to real players`);
    } catch (err) {
      console.error(`  [fail] edition ${edition.id}: ${err.message}`);
      await db.from("skillcorner_sync_queue").update({ last_synced_at: new Date().toISOString() }).eq("competition_edition_id", edition.id);
    }
  }

  const { count: remaining } = await db
    .from("skillcorner_sync_queue")
    .select("competition_edition_id", { count: "exact", head: true })
    .is("last_synced_at", null);

  console.log(`\nEditions synced this run: ${editionsOk}/${queue.length}`);
  console.log(`Physical rows written: ${rowsWritten} (matched to real players)`);
  console.log(`SkillCorner rows skipped (no bridge match): ${rowsUnmatched}`);
  console.log(`Editions never yet synced: ${remaining ?? "unknown"}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
