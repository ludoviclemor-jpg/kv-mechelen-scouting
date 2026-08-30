#!/usr/bin/env node
/**
 * SofaScore enrichment sync.
 *
 * No-op today: `getSofaScoreProvider()` only has a "null" implementation
 * (see scripts/lib/sofascoreProvider.mjs) because SofaScore has no
 * legitimate public API — this script exists so the rest of the
 * pipeline (batching, rate-limit protection, resumable progress, storage)
 * is ready the moment a real provider is added; nothing here needs to
 * change, only SOFASCORE_PROVIDER + the new provider implementation.
 *
 * Design, once a real provider exists:
 *   - Never re-search a player whose sofascoreMatchStatus is already
 *     "matched"/"ambiguous"/"not_found" — those are terminal until a
 *     human or a stronger provider revisits them. Only "pending" players
 *     get findPlayer() calls.
 *   - Matched players get their ratings refreshed periodically (default:
 *     older than --refresh-after-days), not on every run.
 *   - Processes at most --batch-size players per run (default 300) so a
 *     full backlog of thousands of players is worked through across many
 *     scheduled runs rather than one huge slow/fragile job — see
 *     docs/SOFASCORE_PROVIDER.md for the request-volume math.
 *   - --delay-ms between provider calls + the provider's own retry/backoff
 *     (mirroring scripts/lib/scoutasticClient.mjs's proven pattern) is
 *     the rate-limit protection; a real provider implementation is
 *     expected to honor `retries`/`onRetry` the same way.
 *
 * Usage:
 *   node scripts/sync-sofascore.mjs                 # process a batch
 *   node scripts/sync-sofascore.mjs --batch-size 50 --dry-run
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getSofaScoreProvider } from "./lib/sofascoreProvider.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATA_PATH = path.join(ROOT, "data", "players.json");

function parseArgs(argv) {
  const args = { batchSize: 300, delayMs: 400, refreshAfterDays: 3, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--batch-size") args.batchSize = Number(argv[++i]);
    else if (a === "--delay-ms") args.delayMs = Number(argv[++i]);
    else if (a === "--refresh-after-days") args.refreshAfterDays = Number(argv[++i]);
    else if (a === "--dry-run") args.dryRun = true;
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

function selectBatch(players, args) {
  const pending = players.filter((p) => p.sofascoreMatchStatus === "pending");
  const staleMatches = players.filter(
    (p) => p.sofascoreMatchStatus === "matched" && daysSince(p.lastSofaScoreSyncAt) >= args.refreshAfterDays
  );
  // Never-tried players first (grows coverage), then oldest-refreshed matches.
  staleMatches.sort((a, b) => daysSince(b.lastSofaScoreSyncAt) - daysSince(a.lastSofaScoreSyncAt));
  return [...pending, ...staleMatches].slice(0, args.batchSize);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dataPath = args.dataFile ? path.resolve(args.dataFile) : DATA_PATH;

  const provider = getSofaScoreProvider();
  if (!provider.isConfigured()) {
    console.log(
      "No SofaScore provider configured (SOFASCORE_PROVIDER unset) — nothing to sync. " +
        "See docs/SOFASCORE_PROVIDER.md for the legitimate-access findings and how to add a real provider."
    );
    return;
  }

  const nowIso = new Date().toISOString();
  const data = JSON.parse(readFileSync(dataPath, "utf-8"));
  const batch = selectBatch(data.players, args);

  console.log("SOFASCORE SYNC STARTED");
  console.log(`Batch: ${batch.length} players (of ${data.players.length} total)`);

  let matched = 0;
  let ambiguous = 0;
  let notFound = 0;
  let ratingsRefreshed = 0;
  let failed = 0;

  for (const player of batch) {
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
        player.lastSofaScoreSyncAt = nowIso;

        if (result.status === "matched") matched++;
        else if (result.status === "ambiguous") ambiguous++;
        else notFound++;
      }

      if (player.sofascoreMatchStatus === "matched" && player.sofascorePlayerId) {
        const { ratings, average, highest, lowest } = await provider.getLastFiveRatings(player.sofascorePlayerId);
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
    }
    await sleep(args.delayMs);
  }

  if (!args.dryRun) {
    writeFileSync(dataPath, JSON.stringify(data, null, 2) + "\n");
  }

  console.log(`\nPlayers processed: ${batch.length}`);
  console.log(`Matched: ${matched}`);
  console.log(`Ambiguous: ${ambiguous}`);
  console.log(`Not found: ${notFound}`);
  console.log(`Ratings refreshed: ${ratingsRefreshed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Sync completed: ${nowIso.slice(0, 16).replace("T", " ")}`);
  if (args.dryRun) console.log("(--dry-run: data file was NOT written)");
}

main();
