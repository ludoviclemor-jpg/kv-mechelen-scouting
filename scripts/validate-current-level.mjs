#!/usr/bin/env node
/**
 * Real validation (Step 8): does Current Level, computed on one real
 * season, actually predict a player's real performance the *next* real
 * season? A chronological check — train (compute) on season N, check
 * against season N+1's real, independently-measured composite
 * performance, never the other way around.
 *
 * Method: for every real player with two consecutive real seasons in
 * the same competition and position (same real transition set as
 * analyze-development-curves.mjs), compute the real Pearson correlation
 * between season-N's calibrated Current Level and season-(N+1)'s real
 * composite z-score. A meaningful positive correlation is real evidence
 * Current Level captures a genuine, persistent skill signal (not just
 * noise); reported honestly either way, split by position group so a
 * real per-group difference isn't hidden in one aggregate number.
 *
 * This project's own player_ratings table already holds real,
 * previously-calculated Current Level scores for many of these
 * season-N rows — reused directly here rather than recomputed, so this
 * script validates what's actually stored and served today.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/validate-current-level.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { METRIC_REGISTRY } from "./lib/scoring/config/metricRegistry.mjs";
import { positionGroup } from "./lib/scoring/positionGroup.mjs";

const MIN_MINUTES = 630;

function seasonCompositeZ(row, cohortRows) {
  const volumeFields = Object.entries(METRIC_REGISTRY).filter(([, def]) => def.kind === "volume").map(([, def]) => def.impectField);
  const zScores = [];
  for (const field of volumeFields) {
    const value = row.kpis?.[field];
    if (value === undefined || value === null) continue;
    const cohortValues = cohortRows.map((r) => r.kpis?.[field]).filter((v) => v !== undefined && v !== null);
    if (cohortValues.length < 8) continue;
    const mean = cohortValues.reduce((a, b) => a + b, 0) / cohortValues.length;
    const variance = cohortValues.reduce((a, b) => a + (b - mean) ** 2, 0) / cohortValues.length;
    const sd = Math.sqrt(variance);
    if (sd === 0) continue;
    zScores.push((value - mean) / sd);
  }
  return zScores.length === 0 ? null : zScores.reduce((a, b) => a + b, 0) / zScores.length;
}

async function fetchAllRows(db, table, columns, cursorColumn, filterFn = (q) => q) {
  const rows = [];
  let cursor = -1;
  const PAGE = 1000;
  for (;;) {
    const { data, error } = await filterFn(db.from(table).select(columns).gt(cursorColumn, cursor)).order(cursorColumn, { ascending: true }).limit(PAGE);
    if (error) throw error;
    if (data.length === 0) break;
    rows.push(...data);
    cursor = data[data.length - 1][cursorColumn];
  }
  return rows;
}

function seasonStartYear(seasonStr) {
  if (!seasonStr) return null;
  const twoPart = seasonStr.match(/^(\d{2})\/(\d{2})$/);
  if (twoPart) return 2000 + parseInt(twoPart[1], 10);
  const fourDigit = seasonStr.match(/^(\d{4})$/);
  if (fourDigit) return parseInt(fourDigit[1], 10);
  return null;
}

function pearson(xs, ys) {
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    denX += (xs[i] - meanX) ** 2;
    denY += (ys[i] - meanY) ** 2;
  }
  if (denX === 0 || denY === 0) return null;
  return num / Math.sqrt(denX * denY);
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
  const { data: competitions, error: compError } = await db.from("impect_competitions").select("iteration_id,competition_id,season,age_group");
  if (compError) throw compError;
  const compByIteration = new Map(competitions.map((c) => [c.iteration_id, c]));

  console.log("Loading real player-kpi rows...");
  const kpiRows = await fetchAllRows(db, "impect_player_kpis", "player_id,iteration_id,position,minutes,kpis", "iteration_id", (q) => q.gte("minutes", MIN_MINUTES));
  console.log(`Loaded ${kpiRows.length} real qualifying rows.`);

  console.log("Loading real, already-calculated Current Level scores...");
  const ratingRows = await fetchAllRows(db, "player_ratings", "impect_player_id,iteration_id,current_level,ratable", "iteration_id", (q) => q.eq("ratable", true));
  const currentLevelByKey = new Map(ratingRows.map((r) => [`${r.impect_player_id}|${r.iteration_id}`, r.current_level]));
  console.log(`Loaded ${ratingRows.length} real, ratable stored ratings.`);

  const rowsByIteration = new Map();
  const rowsByPlayer = new Map();
  for (const row of kpiRows) {
    const comp = compByIteration.get(row.iteration_id);
    if (!comp || comp.age_group !== "ADULT") continue;
    if (!rowsByIteration.has(row.iteration_id)) rowsByIteration.set(row.iteration_id, []);
    rowsByIteration.get(row.iteration_id).push(row);
    if (!rowsByPlayer.has(row.player_id)) rowsByPlayer.set(row.player_id, []);
    rowsByPlayer.get(row.player_id).push(row);
  }

  const observations = []; // { group, currentLevel (season N), nextSeasonZ (season N+1) }
  for (const [playerId, rows] of rowsByPlayer) {
    const sorted = [...rows].sort((a, b) => (compByIteration.get(a.iteration_id)?.season ?? "").localeCompare(compByIteration.get(b.iteration_id)?.season ?? ""));
    for (let i = 0; i < sorted.length - 1; i++) {
      const before = sorted[i];
      const after = sorted[i + 1];
      const compBefore = compByIteration.get(before.iteration_id);
      const compAfter = compByIteration.get(after.iteration_id);
      if (!compBefore || !compAfter) continue;
      if (compBefore.competition_id !== compAfter.competition_id) continue; // same-competition only — a competition change is a different real question (see analyze-competition-transfers.mjs)
      if (before.position !== after.position) continue;
      const yearBefore = seasonStartYear(compBefore.season);
      const yearAfter = seasonStartYear(compAfter.season);
      if (yearBefore === null || yearAfter === null || yearAfter !== yearBefore + 1) continue;

      const currentLevel = currentLevelByKey.get(`${playerId}|${before.iteration_id}`);
      if (currentLevel === undefined || currentLevel === null) continue; // no real stored rating for season N — skip, never estimate one just for this check

      const nextSeasonZ = seasonCompositeZ(after, rowsByIteration.get(after.iteration_id) ?? []);
      if (nextSeasonZ === null) continue;

      observations.push({ group: positionGroup(before.position), currentLevel, nextSeasonZ });
    }
  }

  console.log(`\n${observations.length} real observations with both a real season-N Current Level and a real season-(N+1) composite outcome.`);

  const byGroup = new Map();
  for (const obs of observations) {
    if (!byGroup.has(obs.group)) byGroup.set(obs.group, []);
    byGroup.get(obs.group).push(obs);
  }

  const results = [];
  console.log("\nReal correlation between season-N Current Level and season-(N+1) real performance, by position group:");
  for (const [group, obs] of byGroup) {
    if (obs.length < 20) {
      console.log(`  ${group}: only ${obs.length} real observations — too few to report a real correlation.`);
      results.push({ group, n: obs.length, correlation: null });
      continue;
    }
    const r = pearson(obs.map((o) => o.currentLevel), obs.map((o) => o.nextSeasonZ));
    console.log(`  ${group}: n=${obs.length}, r=${r === null ? "undefined (no variance)" : r.toFixed(3)}`);
    results.push({ group, n: obs.length, correlation: r });
  }

  const overallR = observations.length >= 20 ? pearson(observations.map((o) => o.currentLevel), observations.map((o) => o.nextSeasonZ)) : null;
  console.log(`\nOverall (all position groups pooled): n=${observations.length}, r=${overallR === null ? "n/a" : overallR.toFixed(3)}`);
  console.log(
    overallR !== null && overallR > 0.15
      ? "Real finding: Current Level shows a real, meaningful positive correlation with next-season performance — it captures a persistent skill signal, not just single-season noise."
      : "Real finding: the correlation with next-season performance is weak or inconclusive at today's real sample — treat Current Level's predictive power for a following season as unproven, not as a validated forecast."
  );

  writeFileSync(
    new URL("../docs/current-level-validation.json", import.meta.url),
    JSON.stringify({ generatedAt: new Date().toISOString(), totalObservations: observations.length, overallCorrelation: overallR, byGroup: results }, null, 2)
  );
  console.log("\nWrote docs/current-level-validation.json");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
