#!/usr/bin/env node
/**
 * One-off analysis: mines this project's own real synced data for
 * within-competition, within-position season-over-season development
 * (same real z-score composite as analyze-competition-transfers.mjs,
 * but here tracking one player's own trajectory across consecutive
 * real seasons in the SAME competition + position group, to avoid
 * confounding real development with a competition-strength change).
 *
 * Real chronological validation, not a same-sample fit-and-report: the
 * age-bucket curve is fit using every real transition EXCEPT the most
 * recent real season globally, then checked against real transitions
 * INTO that held-out most-recent season (never seen during fitting) —
 * per the brief's explicit "chronological train/test split, no future
 * information in the input."
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/analyze-development-curves.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { METRIC_REGISTRY } from "./lib/scoring/config/metricRegistry.mjs";
import { positionGroup } from "./lib/scoring/positionGroup.mjs";

const MIN_MINUTES = 630;
const AGE_BUCKETS = [
  { label: "18-20", min: 18, max: 20 },
  { label: "21-23", min: 21, max: 23 },
  { label: "24-26", min: 24, max: 26 },
  { label: "27-29", min: 27, max: 29 },
  { label: "30+", min: 30, max: 99 },
];

function ageBucketFor(age) {
  return AGE_BUCKETS.find((b) => age >= b.min && age <= b.max)?.label ?? null;
}

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

/** Keyset pagination on `cursorColumn` (a real, indexed numeric column of `table`) — see analyze-competition-transfers.mjs's identical helper for why not `.range()`. */
async function fetchAllRows(db, table, columns, cursorColumn, filterFn = (q) => q) {
  const rows = [];
  let cursor = -1;
  const PAGE = 1000; // PostgREST's own real default max-rows cap (confirmed live) — requesting more silently returns exactly this many anyway
  for (;;) {
    const { data, error } = await filterFn(db.from(table).select(columns).gt(cursorColumn, cursor)).order(cursorColumn, { ascending: true }).limit(PAGE);
    if (error) throw error;
    if (data.length === 0) break;
    rows.push(...data);
    cursor = data[data.length - 1][cursorColumn];
  }
  return rows;
}

function ageAt(birthdate, seasonStartYear) {
  if (!birthdate || seasonStartYear === null) return null;
  const dob = new Date(birthdate);
  return seasonStartYear - dob.getFullYear();
}

/** Real season start year from Impect's own season string ("18/19" -> 2018, "2019" -> 2019) — a real, disclosed parse, not a guess: both formats were confirmed live this session across the real synced catalog. */
function seasonStartYear(seasonStr) {
  if (!seasonStr) return null;
  const twoPart = seasonStr.match(/^(\d{2})\/(\d{2})$/);
  if (twoPart) return 2000 + parseInt(twoPart[1], 10);
  const fourDigit = seasonStr.match(/^(\d{4})$/);
  if (fourDigit) return parseInt(fourDigit[1], 10);
  return null;
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

  console.log("Loading real competition catalog and player identities...");
  const { data: competitions, error: compError } = await db.from("impect_competitions").select("iteration_id,competition_id,season,age_group");
  if (compError) throw compError;
  const compByIteration = new Map(competitions.map((c) => [c.iteration_id, c]));

  const players = await fetchAllRows(db, "impect_players", "player_id,birthdate", "player_id", (q) => q.not("birthdate", "is", null));
  const birthdateByPlayer = new Map(players.map((p) => [p.player_id, p.birthdate]));
  console.log(`${birthdateByPlayer.size} real players with a known birthdate.`);

  console.log("Loading real player-kpi rows...");
  const kpiRows = await fetchAllRows(db, "impect_player_kpis", "player_id,iteration_id,position,minutes,kpis", "iteration_id", (q) => q.gte("minutes", MIN_MINUTES));
  console.log(`Loaded ${kpiRows.length} real qualifying rows.`);

  const rowsByIteration = new Map();
  const rowsByPlayer = new Map();
  for (const row of kpiRows) {
    const comp = compByIteration.get(row.iteration_id);
    if (!comp || comp.age_group !== "ADULT") continue;
    if (!birthdateByPlayer.has(row.player_id)) continue;
    if (!rowsByIteration.has(row.iteration_id)) rowsByIteration.set(row.iteration_id, []);
    rowsByIteration.get(row.iteration_id).push(row);
    if (!rowsByPlayer.has(row.player_id)) rowsByPlayer.set(row.player_id, []);
    rowsByPlayer.get(row.player_id).push(row);
  }
  console.log(`${rowsByPlayer.size} real players with a birthdate and a qualifying season.`);

  // Real same-competition, same-position season-to-season transitions only — a competition or position change is a different real signal (see analyze-competition-transfers.mjs), not development.
  const transitions = [];
  for (const [playerId, rows] of rowsByPlayer) {
    const sorted = [...rows].sort((a, b) => (compByIteration.get(a.iteration_id)?.season ?? "").localeCompare(compByIteration.get(b.iteration_id)?.season ?? ""));
    for (let i = 0; i < sorted.length - 1; i++) {
      const before = sorted[i];
      const after = sorted[i + 1];
      const compBefore = compByIteration.get(before.iteration_id);
      const compAfter = compByIteration.get(after.iteration_id);
      if (!compBefore || !compAfter) continue;
      if (compBefore.competition_id !== compAfter.competition_id) continue; // real transfer, not development — excluded here
      if (before.position !== after.position) continue;
      const group = positionGroup(before.position);
      const yearBefore = seasonStartYear(compBefore.season);
      const yearAfter = seasonStartYear(compAfter.season);
      if (yearBefore === null || yearAfter === null || yearAfter !== yearBefore + 1) continue; // only real, truly consecutive seasons
      const age = ageAt(birthdateByPlayer.get(playerId), yearBefore);
      if (age === null || age < 15 || age > 42) continue; // sanity bound against a real bad birthdate
      const zBefore = seasonCompositeZ(before, rowsByIteration.get(before.iteration_id) ?? []);
      const zAfter = seasonCompositeZ(after, rowsByIteration.get(after.iteration_id) ?? []);
      if (zBefore === null || zAfter === null) continue;
      transitions.push({ playerId, group, age, yearAfter, deltaZ: zAfter - zBefore });
    }
  }
  console.log(`\n${transitions.length} real same-competition, same-position, consecutive-season transitions found.`);

  const mostRecentYear = Math.max(...transitions.map((t) => t.yearAfter));
  const trainSet = transitions.filter((t) => t.yearAfter < mostRecentYear);
  const testSet = transitions.filter((t) => t.yearAfter === mostRecentYear);
  console.log(`Chronological split: ${trainSet.length} training transitions (before ${mostRecentYear}), ${testSet.length} held-out test transitions (${mostRecentYear} only).`);

  // Fit: mean real deltaZ per (position group, age bucket) on the training set only.
  const curve = new Map(); // "group|bucket" -> mean deltaZ
  const byKey = new Map();
  for (const t of trainSet) {
    const bucket = ageBucketFor(t.age);
    if (!bucket) continue;
    const key = `${t.group}|${bucket}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(t.deltaZ);
  }
  for (const [key, deltas] of byKey) {
    if (deltas.length < 10) continue; // real, disclosed minimum sample per bucket
    curve.set(key, { n: deltas.length, meanDeltaZ: deltas.reduce((a, b) => a + b, 0) / deltas.length });
  }

  console.log(`\nFitted ${curve.size} real (position group, age bucket) cells with >= 10 real training observations:`);
  for (const [key, { n, meanDeltaZ }] of [...curve.entries()].sort()) {
    console.log(`  ${key}: n=${n}, meanDeltaZ=${Math.round(meanDeltaZ * 1000) / 1000}`);
  }

  // Real chronological validation: does the fitted curve predict the held-out test set better than a naive "no development" (deltaZ=0) baseline?
  let modelSqError = 0;
  let baselineSqError = 0;
  let evaluated = 0;
  for (const t of testSet) {
    const bucket = ageBucketFor(t.age);
    const cell = bucket ? curve.get(`${t.group}|${bucket}`) : null;
    if (!cell) continue;
    modelSqError += (t.deltaZ - cell.meanDeltaZ) ** 2;
    baselineSqError += (t.deltaZ - 0) ** 2;
    evaluated++;
  }

  console.log(`\nHeld-out validation on ${evaluated} real, unseen ${mostRecentYear} transitions:`);
  if (evaluated < 30) {
    console.log("  Too few held-out observations to draw a real conclusion — not enough recent-season data yet.");
  } else {
    const modelMSE = modelSqError / evaluated;
    const baselineMSE = baselineSqError / evaluated;
    console.log(`  Model MSE: ${modelMSE.toFixed(4)} vs. naive "no development" baseline MSE: ${baselineMSE.toFixed(4)}`);
    console.log(
      modelMSE < baselineMSE
        ? "  Real finding: the fitted age-development curve predicts held-out next-season change better than assuming no change."
        : "  Real finding: the fitted age-development curve does NOT beat the naive no-change baseline on held-out data — not safe to use as a precise predictor yet."
    );
  }

  const outPath = new URL("../docs/development-curve-analysis.json", import.meta.url);
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        minMinutes: MIN_MINUTES,
        trainTransitions: trainSet.length,
        testTransitions: testSet.length,
        testYear: mostRecentYear,
        evaluated,
        modelMSE: evaluated >= 30 ? modelSqError / evaluated : null,
        baselineMSE: evaluated >= 30 ? baselineSqError / evaluated : null,
        curve: Object.fromEntries(curve),
      },
      null,
      2
    )
  );
  console.log("\nWrote docs/development-curve-analysis.json");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
