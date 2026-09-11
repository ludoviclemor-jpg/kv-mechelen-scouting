#!/usr/bin/env node
/**
 * Resumable Impect player-KPI crawl — works through `impect_sync_queue`
 * (seeded by scripts/sync-impect-competitions.mjs) a bounded batch of
 * competitions at a time, oldest/never-synced first, same pattern as
 * this project's existing `scoutastic_teams` crawl (db/schema.sql).
 *
 * Usage:
 *   IMPECT_TOKEN_URL=... IMPECT_CLIENT_ID=... IMPECT_USERNAME=... IMPECT_PASSWORD=... \
 *     SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/sync-impect-player-kpis.mjs [--batch-size 15] [--delay-ms 150] [--only 1234] [--all]
 *
 * `--all` works through the *entire* remaining queue in one long-lived
 * process instead of exiting after one batch — needed because a player
 * can have `player_ratings`/`impect_player_kpis` rows only from whatever
 * competitions happened to be crawled so far, which silently misses a
 * player's *current* club/competition if that one hasn't been reached
 * yet (confirmed live: Erling Haaland and Lamine Yamal's current clubs'
 * 2025/26 competitions were still unsynced after only 71/759
 * competitions had ever been crawled, so their shown rating/physical
 * data was years out of date). Each competition needs 2 + squadCount
 * real requests, so this can run for hours — resilient to transient
 * network blips the same way scripts/sync-skillcorner-physical.mjs is.
 */

import { createClient } from "@supabase/supabase-js";
import { createImpectClient, sleep, dedupeByKey } from "./lib/impectClient.mjs";
import { extractKpis } from "./lib/impectKpis.mjs";

function parseArgs(argv) {
  const args = { batchSize: 15, delayMs: 150, only: null, all: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--batch-size") args.batchSize = Number(argv[++i]);
    else if (a === "--delay-ms") args.delayMs = Number(argv[++i]);
    else if (a === "--only") args.only = Number(argv[++i]); // sync one specific iteration id on demand, outside the normal queue order
    else if (a === "--all") args.all = true;
  }
  return args;
}

function onRetry({ path, status, attempt, retries, waitMs }) {
  console.error(`  [retry] ${path} status=${status}, waiting ${waitMs}ms (attempt ${attempt}/${retries})`);
}

/** Processes one competition end-to-end: fetch, upsert squads/players/kpis, mark queue. Returns real counts, never throws (a per-competition failure is logged and the competition marked attempted so it doesn't block the rest of the queue forever). */
async function processCompetition(db, impect, iterationId, delayMs) {
  try {
    const [squads, players] = await Promise.all([
      impect.get(`/v5/customerapi/iterations/${iterationId}/squads`, { onRetry }),
      impect.get(`/v5/customerapi/iterations/${iterationId}/players`, { onRetry }),
    ]);
    await sleep(delayMs);

    if (squads.length > 0) {
      const squadRows = dedupeByKey(
        squads.map((s) => ({ squad_id: s.id, iteration_id: iterationId, name: s.name, last_synced_at: new Date().toISOString() })),
        (r) => r.squad_id
      );
      const { error } = await db.from("impect_squads").upsert(squadRows, { onConflict: "squad_id" });
      if (error) throw error;
    }

    if (players.length > 0) {
      const playerRows = dedupeByKey(
        players.map((p) => ({
          player_id: p.id,
          firstname: p.firstname ?? null,
          lastname: p.lastname ?? null,
          commonname: p.commonname,
          birthdate: p.birthdate ?? null,
          leg: p.leg ?? null,
          height: p.height ?? null,
          transfermarkt_id: (p.idMappings ?? []).find((m) => m.transfermarkt)?.transfermarkt?.[0] ?? null,
          last_synced_at: new Date().toISOString(),
        })),
        (r) => r.player_id
      );
      const BATCH = 500;
      for (let i = 0; i < playerRows.length; i += BATCH) {
        const { error } = await db.from("impect_players").upsert(playerRows.slice(i, i + BATCH), { onConflict: "player_id" });
        if (error) throw error;
      }
    }

    const kpiRows = [];
    for (const squad of squads) {
      const playerKpis = await impect.get(`/v5/customerapi/iterations/${iterationId}/squads/${squad.id}/player-kpis`, { onRetry });
      await sleep(delayMs);
      for (const row of playerKpis) {
        kpiRows.push({
          iteration_id: iterationId,
          squad_id: squad.id,
          player_id: row.playerId,
          position: row.position ?? null,
          minutes: Math.round(row.playDuration / 60),
          match_share: row.matchShare,
          kpis: extractKpis(row.kpis),
          updated_at: new Date().toISOString(),
        });
      }
    }

    const dedupedKpiRows = dedupeByKey(kpiRows, (r) => `${r.iteration_id}:${r.player_id}`);
    if (dedupedKpiRows.length > 0) {
      const BATCH = 500;
      for (let i = 0; i < dedupedKpiRows.length; i += BATCH) {
        const { error } = await db.from("impect_player_kpis").upsert(dedupedKpiRows.slice(i, i + BATCH), { onConflict: "iteration_id,player_id" });
        if (error) throw error;
      }
    }

    await db.from("impect_sync_queue").update({ last_synced_at: new Date().toISOString() }).eq("iteration_id", iterationId);
    await db.from("impect_competitions").update({ last_synced_at: new Date().toISOString() }).eq("iteration_id", iterationId);

    console.log(`  [${iterationId}] ${squads.length} squads, ${dedupedKpiRows.length} player-kpi rows`);
    return { ok: true, playersWritten: dedupedKpiRows.length };
  } catch (err) {
    console.error(`  [fail] iteration ${iterationId}: ${err.message}`);
    // Still mark as attempted so a persistently-broken competition
    // doesn't block the whole queue forever. Guarded in its own
    // try/catch — a transient network blip here shouldn't crash a
    // multi-hour `--all` run over one failed timestamp update.
    try {
      await db.from("impect_sync_queue").update({ last_synced_at: new Date().toISOString() }).eq("iteration_id", iterationId);
    } catch (updateErr) {
      console.error(`  [fail] iteration ${iterationId}: also failed to mark as attempted: ${updateErr.message}`);
    }
    return { ok: false, playersWritten: 0 };
  }
}

/** `onlyUnsynced` matters for `--all` — see scripts/sync-skillcorner-physical.mjs's identical helper for why. */
async function fetchQueueBatch(db, batchSize, { onlyUnsynced = false } = {}) {
  let query = db.from("impect_sync_queue").select("iteration_id").order("last_synced_at", { ascending: true, nullsFirst: true }).limit(batchSize);
  if (onlyUnsynced) query = query.is("last_synced_at", null);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((r) => r.iteration_id);
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
  const impect = createImpectClient();

  console.log("IMPECT PLAYER-KPI CRAWL STARTED");

  let competitionsOk = 0;
  let competitionsTotal = 0;
  let playersWritten = 0;

  if (args.only !== null) {
    console.log("Processing 1 competition this run.");
    const result = await processCompetition(db, impect, args.only, args.delayMs);
    competitionsTotal = 1;
    competitionsOk += result.ok ? 1 : 0;
    playersWritten += result.playersWritten;
  } else if (args.all) {
    console.log("Processing the entire remaining queue this run (--all).");
    for (;;) {
      let queue;
      for (let attempt = 1; ; attempt++) {
        try {
          queue = await fetchQueueBatch(db, args.batchSize, { onlyUnsynced: true });
          break;
        } catch (err) {
          if (attempt > 5) throw err;
          const waitMs = Math.min(2000 * 2 ** (attempt - 1), 30000);
          console.error(`  [retry] fetchQueueBatch failed (${err.message}), waiting ${waitMs}ms (attempt ${attempt}/5)`);
          await sleep(waitMs);
        }
      }
      if (queue.length === 0) break;
      for (const iterationId of queue) {
        const result = await processCompetition(db, impect, iterationId, args.delayMs);
        competitionsTotal++;
        competitionsOk += result.ok ? 1 : 0;
        playersWritten += result.playersWritten;
      }
    }
  } else {
    const queue = await fetchQueueBatch(db, args.batchSize);
    if (queue.length === 0) {
      console.log("Queue is empty — run sync-impect-competitions.mjs first.");
      return;
    }
    console.log(`Processing ${queue.length} competitions this run.`);
    for (const iterationId of queue) {
      const result = await processCompetition(db, impect, iterationId, args.delayMs);
      competitionsTotal++;
      competitionsOk += result.ok ? 1 : 0;
      playersWritten += result.playersWritten;
    }
  }

  let remaining = "unknown";
  try {
    const { count } = await db.from("impect_sync_queue").select("iteration_id", { count: "exact", head: true }).is("last_synced_at", null);
    remaining = count ?? "unknown";
  } catch (err) {
    console.error(`  [warn] couldn't fetch remaining-count summary: ${err.message}`);
  }

  console.log(`\nCompetitions synced this run: ${competitionsOk}/${competitionsTotal}`);
  console.log(`Player-KPI rows written: ${playersWritten}`);
  console.log(`Competitions never yet synced: ${remaining}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
