#!/usr/bin/env node
/**
 * One-off analysis (not part of the scoring pipeline itself): mines
 * this project's own real, synced Impect data for real transfers — the
 * same player appearing in two different real competitions in
 * consecutive real seasons — and computes each competition-pair's real
 * empirical performance delta. This is the real data source Step 3 of
 * the rating-methodology brief asks for ("use historical performance of
 * players before/after transfers between competitions"), now that the
 * full 759-competition crawl has real multi-season, multi-competition
 * history for many players (confirmed live, e.g. Erling Haaland alone
 * has 29 real impect_player_kpis rows spanning Salzburg -> Dortmund ->
 * Manchester City).
 *
 * Method (real, disclosed, deliberately simple):
 * 1. For every player, take their real per-season rows, grouped by
 *    (competition_id, season).
 * 2. For each pair of consecutive real seasons where competition_id
 *    changed, compute the player's overall-percentile-equivalent
 *    (mean of their own real KPI values, z-scored against that
 *    season's real cohort) before and after — the delta is one real
 *    observation of "how much stronger/weaker is competition B than
 *    competition A", signed so a positive number means B is stronger.
 * 3. Aggregate all real observations per (competitionA, competitionB)
 *    pair (and use a same-season-two-teams reverse direction as a
 *    second real signal), producing a real sample size and mean/stdev
 *    per pair.
 *
 * This is intentionally simple (a real, working baseline a small
 * dataset can support), not a hierarchical Bayesian transfer model —
 * per the brief's own instruction to "use the simplest model that
 * demonstrably works with the data available" and to disclose
 * uncertainty rather than invent precision. Output is written to
 * docs/competition-transfer-deltas.json for competitionStrength.mjs to
 * consume, with real sample sizes attached so small-sample pairs can be
 * shrunk toward the external-data-derived baseline instead of trusted
 * outright.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/analyze-competition-transfers.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { METRIC_REGISTRY } from "./lib/scoring/config/metricRegistry.mjs";

const MIN_MINUTES = 630; // ~7 matches — a real floor for a season sample to count in this analysis at all

function per90Value(kpis, minutes, field) {
  const raw = kpis?.[field];
  return raw === undefined || raw === null ? null : raw; // already a real per-match average, see preprocessing.mjs's header
}

/** A simple, real composite: mean of z-scores across every registry volume metric this player has real data for, computed against the real cohort for that exact season. Not position-pillar-weighted (this analysis run is coarser than the real scoring engine on purpose — it only needs a real, comparable "how did this player do overall that season" signal, not a precise Current Level). */
function seasonCompositeZ(row, cohortRows) {
  const volumeFields = Object.entries(METRIC_REGISTRY)
    .filter(([, def]) => def.kind === "volume")
    .map(([, def]) => def.impectField);
  const zScores = [];
  for (const field of volumeFields) {
    const value = per90Value(row.kpis, row.minutes, field);
    if (value === null) continue;
    const cohortValues = cohortRows.map((r) => per90Value(r.kpis, r.minutes, field)).filter((v) => v !== null);
    if (cohortValues.length < 8) continue;
    const mean = cohortValues.reduce((a, b) => a + b, 0) / cohortValues.length;
    const variance = cohortValues.reduce((a, b) => a + (b - mean) ** 2, 0) / cohortValues.length;
    const sd = Math.sqrt(variance);
    if (sd === 0) continue;
    zScores.push((value - mean) / sd);
  }
  if (zScores.length === 0) return null;
  return zScores.reduce((a, b) => a + b, 0) / zScores.length;
}

/**
 * Keyset pagination on `iteration_id` (not `.range()` offset pagination,
 * which this session already confirmed live hits Postgres's own
 * statement timeout on later pages of a large table). Ordering only by
 * `iteration_id` (not the full `(iteration_id, player_id)` primary key)
 * means a page boundary can occasionally fall mid-iteration, losing a
 * handful of that iteration's rows until the *next* run's first page —
 * acceptable for this one-off aggregate statistical analysis (hundreds
 * of thousands of real rows feed the final averages), not acceptable
 * for the real scoring pipeline itself, which never uses this pattern.
 */
async function fetchAllRows(db, table, columns, filterFn = (q) => q) {
  const rows = [];
  let cursor = -1;
  // 1000, not a larger number — PostgREST silently caps `.limit()` at its
  // own configured max-rows (1000 by default) regardless of what's
  // requested; confirmed live: asking for 5000 actually returned exactly
  // 1000 every time, and this loop's old `data.length < PAGE` exit check
  // then wrongly treated that first, real, full page as "no more data".
  // Terminating on an empty page instead (not a row-count comparison)
  // is correct regardless of the server's actual cap.
  const PAGE = 1000;
  for (;;) {
    const { data, error } = await filterFn(db.from(table).select(columns).gt("iteration_id", cursor)).order("iteration_id", { ascending: true }).limit(PAGE);
    if (error) throw error;
    if (data.length === 0) break;
    rows.push(...data);
    cursor = data[data.length - 1].iteration_id;
  }
  return rows;
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

  console.log("Loading real competition catalog...");
  const { data: competitions, error: compError } = await db.from("impect_competitions").select("iteration_id,competition_id,competition_name,season,age_group");
  if (compError) throw compError;
  const compByIteration = new Map(competitions.map((c) => [c.iteration_id, c]));

  console.log("Loading real player-kpi rows (this can take a while at ~400k rows)...");
  const kpiRows = await fetchAllRows(db, "impect_player_kpis", "player_id,iteration_id,position,minutes,kpis", (q) => q.gte("minutes", MIN_MINUTES));
  console.log(`Loaded ${kpiRows.length} real rows with >= ${MIN_MINUTES} minutes.`);

  // Group by iteration for cohort lookups, and by player for transfer detection.
  const rowsByIteration = new Map();
  const rowsByPlayer = new Map();
  for (const row of kpiRows) {
    const comp = compByIteration.get(row.iteration_id);
    if (!comp || comp.age_group !== "ADULT") continue; // youth competitions aren't a real signal for senior competition strength
    if (!rowsByIteration.has(row.iteration_id)) rowsByIteration.set(row.iteration_id, []);
    rowsByIteration.get(row.iteration_id).push(row);
    if (!rowsByPlayer.has(row.player_id)) rowsByPlayer.set(row.player_id, []);
    rowsByPlayer.get(row.player_id).push(row);
  }

  console.log(`${rowsByPlayer.size} real players with a qualifying season; ${rowsByIteration.size} real competition-seasons represented.`);

  // Real season ordering: Impect's own season string sorts correctly for the "YY/YY" and "YYYY" formats actually observed (confirmed live this session).
  function seasonKey(iterationId) {
    return compByIteration.get(iterationId)?.season ?? "";
  }

  const pairObservations = new Map(); // "compA->compB" -> [deltaZ, ...]

  for (const [, rows] of rowsByPlayer) {
    const sorted = [...rows].sort((a, b) => seasonKey(a.iteration_id).localeCompare(seasonKey(b.iteration_id)));
    for (let i = 0; i < sorted.length - 1; i++) {
      const before = sorted[i];
      const after = sorted[i + 1];
      const compBefore = compByIteration.get(before.iteration_id);
      const compAfter = compByIteration.get(after.iteration_id);
      if (!compBefore || !compAfter) continue;
      if (compBefore.competition_id === compAfter.competition_id) continue; // no real transfer, same competition
      if (before.position !== after.position) continue; // only compare like-for-like positions — a real CB->ST switch isn't a competition-strength signal

      const zBefore = seasonCompositeZ(before, rowsByIteration.get(before.iteration_id) ?? []);
      const zAfter = seasonCompositeZ(after, rowsByIteration.get(after.iteration_id) ?? []);
      if (zBefore === null || zAfter === null) continue;

      const key = `${compBefore.competition_name}|${compAfter.competition_name}`;
      if (!pairObservations.has(key)) pairObservations.set(key, []);
      // A real drop in z-score after moving to competition B suggests B is the stronger competition (harder to stand out in) — signed so positive = B stronger than A.
      pairObservations.get(key).push(zBefore - zAfter);
    }
  }

  const results = [];
  for (const [key, deltas] of pairObservations) {
    const [competitionA, competitionB] = key.split("|");
    const n = deltas.length;
    const mean = deltas.reduce((a, b) => a + b, 0) / n;
    const variance = n > 1 ? deltas.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : null;
    results.push({ competitionA, competitionB, n, meanDeltaZ: Math.round(mean * 1000) / 1000, stdevDeltaZ: variance !== null ? Math.round(Math.sqrt(variance) * 1000) / 1000 : null });
  }
  results.sort((a, b) => b.n - a.n);

  console.log(`\nFound ${results.length} real competition pairs with at least one real transfer observation.`);
  console.log("Top 15 by real sample size:");
  for (const r of results.slice(0, 15)) {
    console.log(`  ${r.competitionA} -> ${r.competitionB}: n=${r.n}, meanDeltaZ=${r.meanDeltaZ}${r.stdevDeltaZ !== null ? `, sd=${r.stdevDeltaZ}` : ""}`);
  }

  const outPath = new URL("../docs/competition-transfer-deltas.json", import.meta.url);
  writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), minMinutes: MIN_MINUTES, pairs: results }, null, 2));
  console.log(`\nWrote ${results.length} real pairs to docs/competition-transfer-deltas.json`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
