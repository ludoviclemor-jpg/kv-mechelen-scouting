#!/usr/bin/env node
/**
 * Ratings enrichment sync (module/file names are a historical "SofaScore"
 * label). Currently a pure no-op: no real ratings provider is connected
 * (see docs/SOFASCORE_PROVIDER.md) — scripts/lib/sofascoreProvider.mjs
 * always returns the null provider, which finds nothing and rates
 * nothing. An earlier API-Football implementation was removed per
 * explicit instruction; it was never connected to a real key.
 *
 * Also worth knowing before trying to make this do anything real: this
 * script still targets DATA_PATH (data/players.json) below, not the real
 * Postgres `players` table the rest of the app now reads from (see
 * docs/SCOUTASTIC_SYNC.md — the player sync itself already made that
 * move; this one hasn't yet). Wiring up a real provider here would need
 * that same migration first, or it would enrich a file nothing reads.
 *
 * Scope, as designed (kept for whenever this is revived): only African
 * debutant candidates (isAfrican && isEasternEuropeanLeague &&
 * !isYouthOrReserve), not the full player set — the free API-Football
 * tier's 100 requests/day made covering everything impractical, and this
 * scope directly powers the African Debutants page. Pass --include-all
 * to override (not recommended on a rate-limited free tier).
 *
 * Design (kept for whenever a real provider is connected):
 *   - Never re-search a player whose sofascoreMatchStatus is already
 *     "matched"/"ambiguous"/"not_found" — those are terminal until a
 *     human or a stronger provider revisits them. Only "pending" players
 *     get findPlayer() calls.
 *   - Matched players get their ratings refreshed periodically (default:
 *     older than --refresh-after-days), not on every run.
 *   - A hard per-run request budget, enforced inside whichever provider
 *     is active, stops a run cleanly before it could blow through a rate
 *     limit, rather than after the fact.
 *   - --delay-ms between provider calls + the provider's own retry/backoff
 *     is the rate-limit protection.
 *
 * Usage:
 *   node scripts/sync-sofascore.mjs                    # process a batch
 *   node scripts/sync-sofascore.mjs --batch-size 8 --dry-run
 *   node scripts/sync-sofascore.mjs --inspect-player "Full Name"
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getSofaScoreProvider } from "./lib/sofascoreProvider.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATA_PATH = path.join(ROOT, "data", "players.json");

function parseArgs(argv) {
  const args = { batchSize: 8, delayMs: 500, refreshAfterDays: 14, dryRun: false, includeAll: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--batch-size") args.batchSize = Number(argv[++i]);
    else if (a === "--delay-ms") args.delayMs = Number(argv[++i]);
    else if (a === "--refresh-after-days") args.refreshAfterDays = Number(argv[++i]);
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--include-all") args.includeAll = true;
    else if (a === "--inspect-player") args.inspectPlayer = argv[++i];
    else if (a === "--data-file") args.dataFile = argv[++i]; // testing only
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function daysSince(isoDate) {
  if (!isoDate) return Infinity;
  return (Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24);
}

function inScope(player, args) {
  if (args.includeAll) return true;
  return player.isAfrican && player.isEasternEuropeanLeague && !player.isYouthOrReserve;
}

function selectBatch(players, args) {
  const scoped = players.filter((p) => inScope(p, args));
  const pending = scoped.filter((p) => p.sofascoreMatchStatus === "pending");
  const staleMatches = scoped.filter(
    (p) => p.sofascoreMatchStatus === "matched" && daysSince(p.lastSofaScoreSyncAt) >= args.refreshAfterDays
  );
  staleMatches.sort((a, b) => daysSince(b.lastSofaScoreSyncAt) - daysSince(a.lastSofaScoreSyncAt));
  return { batch: [...pending, ...staleMatches].slice(0, args.batchSize), scopedTotal: scoped.length };
}

async function inspectPlayer(provider, name) {
  console.log(`Searching for "${name}"...`);
  const result = await provider.findPlayer({ name, dateOfBirth: null, nationality: null, club: null });
  console.log("--- MATCH RESULT ---");
  console.log(JSON.stringify(result, null, 2));
  if (result.status === "matched") {
    console.log("\n--- LAST FIVE RATINGS ---");
    const ratings = await provider.getLastFiveRatings(result.sofascorePlayerId, result._teamId);
    console.log(JSON.stringify(ratings, null, 2));
  }
  console.log(`\nRequests used: ${provider.getRequestCount?.() ?? "n/a"}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dataPath = args.dataFile ? path.resolve(args.dataFile) : DATA_PATH;

  const provider = await getSofaScoreProvider();
  if (!provider.isConfigured()) {
    console.log(
      "No ratings provider configured (SOFASCORE_PROVIDER unset) — nothing to sync. " +
        "See docs/SOFASCORE_PROVIDER.md for the legitimate-access findings and how to add a real provider."
    );
    return;
  }

  if (args.inspectPlayer) {
    await inspectPlayer(provider, args.inspectPlayer);
    return;
  }

  const nowIso = new Date().toISOString();
  const data = JSON.parse(readFileSync(dataPath, "utf-8"));
  const { batch, scopedTotal } = selectBatch(data.players, args);

  console.log("SOFASCORE SYNC STARTED");
  console.log(
    `Batch: ${batch.length} players (of ${scopedTotal} in scope` +
      `${args.includeAll ? "" : " — African debutant candidates only, pass --include-all to widen"}, ` +
      `${data.players.length} total in database)`
  );

  let processed = 0;
  let matched = 0;
  let ambiguous = 0;
  let notFound = 0;
  let ratingsRefreshed = 0;
  let failed = 0;

  for (const player of batch) {
    processed++;
    try {
      if (player.sofascoreMatchStatus === "pending") {
        const result = await provider.findPlayer({
          name: player.name,
          dateOfBirth: player.dateOfBirth,
          nationality: player.nationality,
          club: player.club,
        });
        player.sofascoreMatchStatus = result.status;
        player.sofascoreMatchConfidence = result.confidence;
        player.sofascorePlayerId = result.status === "matched" ? result.sofascorePlayerId : null;
        player.ratingsTeamId = result.status === "matched" ? (result._teamId ?? null) : null;
        player.lastSofaScoreSyncAt = nowIso;

        if (result.status === "matched") matched++;
        else if (result.status === "ambiguous") ambiguous++;
        else notFound++;
      }

      if (player.sofascoreMatchStatus === "matched" && player.sofascorePlayerId) {
        const { ratings, average, highest, lowest } = await provider.getLastFiveRatings(
          player.sofascorePlayerId,
          player.ratingsTeamId
        );
        player.matches = ratings;
        player.ratingAverage = average;
        player.ratingHighest = highest;
        player.ratingLowest = lowest;
        player.lastSofaScoreSyncAt = nowIso;
        ratingsRefreshed++;
      }
    } catch (err) {
      failed++;
      console.error(`  [fail] ${player.name} (${player.scoutasticPlayerId}): ${err}`);
      if (String(err).includes("request budget exhausted")) {
        console.error("  Request budget exhausted for this run — stopping early, resuming next run.");
        break;
      }
    }
    await sleep(args.delayMs);
  }

  if (!args.dryRun) {
    writeFileSync(dataPath, JSON.stringify(data, null, 2) + "\n");
  }

  console.log(`\nPlayers processed: ${processed}`);
  console.log(`Matched: ${matched}`);
  console.log(`Ambiguous: ${ambiguous}`);
  console.log(`Not found: ${notFound}`);
  console.log(`Ratings refreshed: ${ratingsRefreshed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Requests used: ${provider.getRequestCount?.() ?? "n/a"}`);
  console.log(`Sync completed: ${nowIso.slice(0, 16).replace("T", " ")}`);
  if (args.dryRun) console.log("(--dry-run: data file was NOT written)");
}

main();
