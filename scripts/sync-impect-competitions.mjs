#!/usr/bin/env node
/**
 * Impect competition catalog sync — one real, cheap request
 * (GET /v5/customerapi/iterations, confirmed live: 759 competition-
 * seasons worldwide) that seeds `impect_competitions` and the resumable
 * `impect_sync_queue` (scripts/sync-impect-player-kpis.mjs works through
 * that queue in bounded batches — see that script's header for why this
 * is split into two scripts).
 *
 * Safe to re-run: competitions are upserted (real data may change), and
 * the queue only ever gets *new* iteration ids inserted — an
 * iteration_id already in the queue keeps its existing last_synced_at,
 * never reset back to "never synced".
 *
 * Usage:
 *   IMPECT_TOKEN_URL=... IMPECT_CLIENT_ID=... IMPECT_USERNAME=... IMPECT_PASSWORD=... \
 *     SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/sync-impect-competitions.mjs [--dry-run]
 */

import { createClient } from "@supabase/supabase-js";
import { createImpectClient } from "./lib/impectClient.mjs";

function parseArgs(argv) {
  const args = { dryRun: false };
  for (const a of argv) if (a === "--dry-run") args.dryRun = true;
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

  console.log("IMPECT COMPETITIONS SYNC STARTED");
  const iterations = await impect.get("/v5/customerapi/iterations", { onRetry });
  console.log(`Fetched ${iterations.length} real iterations from Impect.`);

  const nowIso = new Date().toISOString();
  const rows = iterations.map((it) => ({
    iteration_id: it.id,
    competition_id: it.competition.id,
    competition_name: it.competition.name,
    competition_type: it.competition.type,
    season: it.season,
    country_id: it.competition.countryId,
    gender: it.competition.gender,
    age_group: it.competition.ageGroup,
    transfermarkt_ids: (it.idMappings ?? []).find((m) => m.transfermarkt)?.transfermarkt ?? [],
    last_synced_at: nowIso,
  }));

  if (args.dryRun) {
    console.log(`(--dry-run) would upsert ${rows.length} competitions.`);
    return;
  }

  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await db.from("impect_competitions").upsert(rows.slice(i, i + BATCH), { onConflict: "iteration_id" });
    if (error) throw error;
  }
  console.log(`Upserted ${rows.length} competitions.`);

  // Seed the resumable queue with any iteration ids not already in it —
  // never overwrite an existing row's progress.
  const { data: existing, error: existingError } = await db.from("impect_sync_queue").select("iteration_id");
  if (existingError) throw existingError;
  const existingIds = new Set((existing ?? []).map((r) => r.iteration_id));
  const newQueueRows = rows.filter((r) => !existingIds.has(r.iteration_id)).map((r) => ({ iteration_id: r.iteration_id, last_synced_at: null }));

  if (newQueueRows.length > 0) {
    const { error: insertError } = await db.from("impect_sync_queue").insert(newQueueRows);
    if (insertError) throw insertError;
  }
  console.log(`Queue: ${newQueueRows.length} new competitions added, ${existingIds.size} already tracked.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
