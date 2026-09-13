#!/usr/bin/env node
/**
 * One-time backfill for `players.name_unaccented`/`club_unaccented`
 * (db/migrations/2026-09-11_part2_players_columns.sql)
 * — done here via the REST API in batches, not as a single SQL Editor
 * `UPDATE`, because that UPDATE times out the SQL Editor's own request
 * timeout across the real ~180k-row `players` table (confirmed live).
 * The migration's trigger already keeps these columns correct for every
 * future insert/update; this script only needs to run once for rows
 * that existed before the migration.
 *
 * Writes via the `backfill_players_unaccented` RPC
 * (db/migrations/2026-09-11_part4_backfill_function.sql) — a real, plain
 * `UPDATE`, not a `.upsert()`. Confirmed live: `.upsert()` took the
 * INSERT path for at least one row and failed a NOT NULL constraint on
 * `scoutastic_player_id`, a column this backfill never touches — a bulk
 * `UPDATE ... FROM unnest(...)` can never insert a new row, so that
 * whole failure class is structurally impossible here.
 *
 * Keyset pagination (order by the unique `id`, page via `.gt()` on the
 * last-seen id) — not `.range()` offset pagination, which was already
 * confirmed live this session to hit Postgres's own statement timeout
 * on later pages of this same ~180k-row table (see
 * scripts/sync-skillcorner-physical.mjs's loadPlayerBridge for the
 * identical real fix).
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/backfill-unaccented-columns.mjs
 */

import { createClient } from "@supabase/supabase-js";

/** Same real accent-stripping approach as src/lib/utils.ts's stripAccents (kept as a tiny standalone copy here — this is a plain Node script, not a TS import from src/). */
function stripAccents(value) {
  return (value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** GIN index maintenance on this batch's two trigram indexes occasionally spikes one particular UPDATE well past the others (confirmed live: smooth for ~60k rows, then one batch hit Postgres's own statement timeout) — retry with backoff rather than losing the whole run over one slow batch. */
async function rpcWithRetry(db, name, params, { retries = 5 } = {}) {
  for (let attempt = 1; ; attempt++) {
    const { error } = await db.rpc(name, params);
    if (!error) return;
    if (attempt > retries) throw error;
    const waitMs = Math.min(2000 * 2 ** (attempt - 1), 20000);
    console.error(`  [retry] ${name} failed (${error.message}), waiting ${waitMs}ms (attempt ${attempt}/${retries})`);
    await sleep(waitMs);
  }
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set.");
    process.exitCode = 1;
    return;
  }
  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  console.log("BACKFILL players.name_unaccented / club_unaccented STARTED");

  const PAGE = 1000;
  const UPDATE_BATCH = 250; // smaller than PAGE — keeps any single RPC call's GIN index maintenance small enough to stay well under the timeout
  let cursor = "";
  let totalUpdated = 0;
  let totalScanned = 0;

  for (;;) {
    const { data, error } = await db
      .from("players")
      .select("id,name,club,name_unaccented,club_unaccented")
      .gt("id", cursor)
      .order("id", { ascending: true })
      .limit(PAGE);
    if (error) throw error;
    if (data.length === 0) break;

    totalScanned += data.length;
    const rowsNeedingBackfill = data
      .filter((r) => r.name_unaccented === null || r.club_unaccented === null)
      .map((r) => ({ id: r.id, name_unaccented: stripAccents(r.name), club_unaccented: stripAccents(r.club) }));

    for (let i = 0; i < rowsNeedingBackfill.length; i += UPDATE_BATCH) {
      const chunk = rowsNeedingBackfill.slice(i, i + UPDATE_BATCH);
      await rpcWithRetry(db, "backfill_players_unaccented", {
        ids: chunk.map((r) => r.id),
        names_unaccented: chunk.map((r) => r.name_unaccented),
        clubs_unaccented: chunk.map((r) => r.club_unaccented),
      });
      totalUpdated += chunk.length;
    }

    cursor = data[data.length - 1].id;
    if (totalScanned % 20000 === 0) console.log(`  ...scanned ${totalScanned}, updated ${totalUpdated} so far`);
    if (data.length < PAGE) break;
  }

  console.log(`\nScanned ${totalScanned} real players.`);
  console.log(`Backfilled ${totalUpdated} rows (the rest already had both columns set — trigger-populated, or a repeat run).`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
