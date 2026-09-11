#!/usr/bin/env node
/**
 * SkillCorner competition-edition catalog sync — one real, cheap crawl
 * (GET /api/competition_editions/, confirmed live: 1541 real
 * competition-seasons) that seeds `skillcorner_competition_editions` and
 * the resumable `skillcorner_sync_queue` (scripts/sync-skillcorner-physical.mjs
 * works through that queue in bounded batches — same split-into-two-
 * scripts reasoning as the Impect integration).
 *
 * Safe to re-run: editions are upserted (real data may change), and the
 * queue only ever gets *new* edition ids inserted — an edition already
 * in the queue keeps its existing last_synced_at, never reset.
 *
 * Usage:
 *   SKILLCORNER_USERNAME=... SKILLCORNER_PASSWORD=... \
 *     SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/sync-skillcorner-competition-editions.mjs [--dry-run]
 */

import { createClient } from "@supabase/supabase-js";
import { createSkillcornerClient } from "./lib/skillcornerClient.mjs";

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
  const skillcorner = createSkillcornerClient();

  console.log("SKILLCORNER COMPETITION EDITIONS SYNC STARTED");
  const editions = await skillcorner.getAllPages("/competition_editions/", { user: "false" }, { onRetry });
  console.log(`Fetched ${editions.length} real competition editions from SkillCorner.`);

  const nowIso = new Date().toISOString();
  const rows = editions.map((e) => ({
    id: e.id,
    competition_id: e.competition.id,
    competition_name: e.competition.name,
    area: e.competition.area ?? null,
    season_id: e.season?.id ?? null,
    season_name: e.season?.name ?? null,
    gender: e.competition.gender ?? null,
    age_group: e.competition.age_group ?? null,
    last_synced_at: nowIso,
  }));

  if (args.dryRun) {
    console.log(`(--dry-run) would upsert ${rows.length} competition editions.`);
    return;
  }

  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await db.from("skillcorner_competition_editions").upsert(rows.slice(i, i + BATCH), { onConflict: "id" });
    if (error) throw error;
  }
  console.log(`Upserted ${rows.length} competition editions.`);

  const { data: existing, error: existingError } = await db.from("skillcorner_sync_queue").select("competition_edition_id");
  if (existingError) throw existingError;
  const existingIds = new Set((existing ?? []).map((r) => r.competition_edition_id));
  const newQueueRows = rows.filter((r) => !existingIds.has(r.id)).map((r) => ({ competition_edition_id: r.id, last_synced_at: null }));

  if (newQueueRows.length > 0) {
    const { error: insertError } = await db.from("skillcorner_sync_queue").insert(newQueueRows);
    if (insertError) throw insertError;
  }
  console.log(`Queue: ${newQueueRows.length} new competition editions added, ${existingIds.size} already tracked.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
