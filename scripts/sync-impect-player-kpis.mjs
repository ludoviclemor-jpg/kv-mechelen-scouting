#!/usr/bin/env node
/**
 * Resumable Impect player-KPI crawl — works through `impect_sync_queue`
 * (seeded by scripts/sync-impect-competitions.mjs) a bounded batch of
 * competitions at a time, oldest/never-synced first, same pattern as
 * this project's existing `scoutastic_teams` crawl (db/schema.sql).
 *
 * Deliberately NOT "sync all 759 competitions in one run": each
 * competition needs 2 + squadCount requests (squads, players, then one
 * player-kpis call per squad), so the full catalog is several thousand
 * real requests — doing that in one sitting risks Impect's own rate
 * limits and takes a long time for no good reason when it can instead
 * grow incrementally across repeated runs (or a future scheduled GitHub
 * Action, once IMPECT_* secrets are added there).
 *
 * Usage:
 *   IMPECT_TOKEN_URL=... IMPECT_CLIENT_ID=... IMPECT_USERNAME=... IMPECT_PASSWORD=... \
 *     SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/sync-impect-player-kpis.mjs [--batch-size 15] [--delay-ms 150]
 */

import { createClient } from "@supabase/supabase-js";
import { createImpectClient, sleep } from "./lib/impectClient.mjs";
import { extractKpis } from "./lib/impectKpis.mjs";

function parseArgs(argv) {
  const args = { batchSize: 15, delayMs: 150 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--batch-size") args.batchSize = Number(argv[++i]);
    else if (a === "--delay-ms") args.delayMs = Number(argv[++i]);
  }
  return args;
}

function onRetry({ path, status, attempt, retries, waitMs }) {
  console.error(`  [retry] ${path} status=${status}, waiting ${waitMs}ms (attempt ${attempt}/${retries})`);
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

  const { data: queue, error: queueError } = await db
    .from("impect_sync_queue")
    .select("iteration_id")
    .order("last_synced_at", { ascending: true, nullsFirst: true })
    .limit(args.batchSize);
  if (queueError) throw queueError;

  if (!queue || queue.length === 0) {
    console.log("Queue is empty — run sync-impect-competitions.mjs first.");
    return;
  }
  console.log(`Processing ${queue.length} competitions this run.`);

  let competitionsOk = 0;
  let playersWritten = 0;

  for (const { iteration_id: iterationId } of queue) {
    try {
      const [squads, players] = await Promise.all([
        impect.get(`/v5/customerapi/iterations/${iterationId}/squads`, { onRetry }),
        impect.get(`/v5/customerapi/iterations/${iterationId}/players`, { onRetry }),
      ]);
      await sleep(args.delayMs);

      if (squads.length > 0) {
        const { error } = await db
          .from("impect_squads")
          .upsert(
            squads.map((s) => ({ squad_id: s.id, iteration_id: iterationId, name: s.name, last_synced_at: new Date().toISOString() })),
            { onConflict: "squad_id" }
          );
        if (error) throw error;
      }

      if (players.length > 0) {
        const playerRows = players.map((p) => ({
          player_id: p.id,
          firstname: p.firstname ?? null,
          lastname: p.lastname ?? null,
          commonname: p.commonname,
          birthdate: p.birthdate ?? null,
          leg: p.leg ?? null,
          height: p.height ?? null,
          transfermarkt_id: (p.idMappings ?? []).find((m) => m.transfermarkt)?.transfermarkt?.[0] ?? null,
          last_synced_at: new Date().toISOString(),
        }));
        const BATCH = 500;
        for (let i = 0; i < playerRows.length; i += BATCH) {
          const { error } = await db.from("impect_players").upsert(playerRows.slice(i, i + BATCH), { onConflict: "player_id" });
          if (error) throw error;
        }
      }

      const kpiRows = [];
      for (const squad of squads) {
        const playerKpis = await impect.get(`/v5/customerapi/iterations/${iterationId}/squads/${squad.id}/player-kpis`, { onRetry });
        await sleep(args.delayMs);
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

      if (kpiRows.length > 0) {
        const BATCH = 500;
        for (let i = 0; i < kpiRows.length; i += BATCH) {
          const { error } = await db.from("impect_player_kpis").upsert(kpiRows.slice(i, i + BATCH), { onConflict: "iteration_id,player_id" });
          if (error) throw error;
        }
      }

      await db.from("impect_sync_queue").update({ last_synced_at: new Date().toISOString() }).eq("iteration_id", iterationId);
      await db.from("impect_competitions").update({ last_synced_at: new Date().toISOString() }).eq("iteration_id", iterationId);

      competitionsOk++;
      playersWritten += kpiRows.length;
      console.log(`  [${iterationId}] ${squads.length} squads, ${kpiRows.length} player-kpi rows`);
    } catch (err) {
      console.error(`  [fail] iteration ${iterationId}: ${err.message}`);
      // Still mark as attempted so a persistently-broken competition
      // doesn't block the whole queue forever — it'll be retried again
      // once every other competition has had a turn.
      await db.from("impect_sync_queue").update({ last_synced_at: new Date().toISOString() }).eq("iteration_id", iterationId);
    }
  }

  const { count: remaining } = await db
    .from("impect_sync_queue")
    .select("iteration_id", { count: "exact", head: true })
    .is("last_synced_at", null);

  console.log(`\nCompetitions synced this run: ${competitionsOk}/${queue.length}`);
  console.log(`Player-KPI rows written: ${playersWritten}`);
  console.log(`Competitions never yet synced: ${remaining ?? "unknown"}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
