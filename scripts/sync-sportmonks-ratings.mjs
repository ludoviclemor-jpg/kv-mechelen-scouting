#!/usr/bin/env node
/**
 * Sportmonks ratings sync — TEST scope, Danish Superliga + Scottish
 * Premiership only (scripts/lib/sportmonksLeagues.mjs). Fetches recent
 * finished fixtures, matches Sportmonks players to existing Scoutastic
 * players (never creates a new player row), and stores per-match ratings.
 * See docs/SPORTMONKS_INTEGRATION.md.
 *
 * Architecture: Sportmonks API -> this script (service_role key) ->
 * Postgres -> frontend reads Postgres only, never Sportmonks directly.
 *
 * Matching order (see scripts/lib/sofascoreMatching.mjs's resolveMatch,
 * reused as-is — its scoring logic is provider-agnostic):
 *   1. An existing player_external_ids row for this Sportmonks player id
 *      (provider='sportmonks') — reused directly, no re-scoring.
 *   2/3. Name similarity (normalized: accents/case/hyphens/spacing),
 *      scored against the Scoutastic candidate pool for that player's own
 *      *club* (via sportmonksLeagues.mjs's clubAliases — real players
 *      Kieran Tierney/Patrick Pentz confirmed live to carry a
 *      competition_id from whatever European qualifier they were
 *      discovered through, not SC1/DK1, so competition_id can't be used
 *      to scope the pool; club is the reliable signal, see
 *      sportmonksLeagues.mjs's comment for the full finding).
 *   4. If step 2/3 is ambiguous (not confident, not "not found"), fetch
 *      this one Sportmonks player's date_of_birth and re-score with it —
 *      the strongest single signal, per resolveMatch's own weighting.
 * A player that's still ambiguous or not found after all of this is
 * skipped and logged — never guessed, never silently dropped without a
 * trace.
 *
 * Usage:
 *   SPORTMONKS_API_TOKEN=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/sync-sportmonks-ratings.mjs [--dry-run] [--days 35] [--delay-ms 300] [--retries 3]
 */

import { createClient } from "@supabase/supabase-js";
import { fetchFinishedFixtures, fetchFixtureWithLineups, fetchPlayer } from "./lib/sportmonksClient.mjs";
import { SPORTMONKS_LEAGUES } from "./lib/sportmonksLeagues.mjs";
import { extractRatingRows } from "./lib/sportmonksFieldMap.mjs";
import { resolveMatch } from "./lib/sofascoreMatching.mjs";

const PROVIDER = "sportmonks";

function parseArgs(argv) {
  const args = { dryRun: false, days: 35, delayMs: 300, retries: 3 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--days") args.days = Number(argv[++i]);
    else if (a === "--delay-ms") args.delayMs = Number(argv[++i]);
    else if (a === "--retries") args.retries = Number(argv[++i]);
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function onRetry({ url, status, attempt, retries, waitMs, remaining }) {
  if (status === "rate-limit-low") {
    console.error(`  [Sportmonks rate limit reached] remaining=${remaining}, pausing ${waitMs}ms before continuing`);
  } else {
    console.error(`  [retry] ${url} status=${status}, waiting ${waitMs}ms (attempt ${attempt}/${retries})`);
  }
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoISO(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Same 1,000-row PostgREST-cap-safe pagination pattern as scripts/sync-scoutastic.mjs's fetchAllRows. */
async function fetchAllRows(db, table, columns, build = (q) => q, maxRows = Infinity) {
  const pageSize = 1000;
  let from = 0;
  const all = [];
  while (from < maxRows) {
    const to = Math.min(from + pageSize, maxRows) - 1;
    const { data, error } = await build(db.from(table).select(columns)).range(from, to);
    if (error) throw error;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const token = process.env.SPORTMONKS_API_TOKEN;
  if (!token) {
    console.error("No API token. Set SPORTMONKS_API_TOKEN and re-run.");
    process.exitCode = 1;
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set. Nothing can be read or written without them.");
    process.exitCode = 1;
    return;
  }
  const db = createClient(supabaseUrl, serviceRoleKey);

  console.log("SPORTMONKS RATINGS SYNC STARTED");
  console.log(`Window: last ${args.days} days. ${args.dryRun ? "(--dry-run: nothing written)" : ""}`);

  const stats = {
    fixturesInWindow: 0,
    fixturesSkippedAlreadyStored: 0,
    fixturesFetched: 0,
    fixturesFailed: 0,
    ratingsUpserted: 0,
    playersMatchedExisting: 0,
    playersMatchedNew: 0,
    playersUnmatched: 0,
  };
  const unmatchedLog = [];

  for (const league of SPORTMONKS_LEAGUES) {
    console.log(`\n=== ${league.name} (Sportmonks league ${league.sportmonksLeagueId}) ===`);

    // Candidate pools are built lazily, per Scoutastic club name, as
    // fixtures reference teams — see sportmonksLeagues.mjs's comment for
    // why this replaced an earlier competition_id-scoped pool (real
    // players were being missed).
    const clubCandidatesCache = new Map(); // scoutasticClubName -> candidate[]
    const warnedEmptyClubs = new Set();

    async function candidatesForTeam(sportmonksTeamName) {
      const scoutasticClub = league.clubAliases[sportmonksTeamName] ?? sportmonksTeamName;
      if (clubCandidatesCache.has(scoutasticClub)) return clubCandidatesCache.get(scoutasticClub);
      const rows = await fetchAllRows(db, "players", "id,name,club,date_of_birth,nationality", (q) => q.eq("club", scoutasticClub).eq("active", true));
      const mapped = rows.map((c) => ({ id: c.id, name: c.name, dateOfBirth: c.date_of_birth, nationality: c.nationality, club: c.club }));
      clubCandidatesCache.set(scoutasticClub, mapped);
      if (mapped.length === 0 && !warnedEmptyClubs.has(scoutasticClub)) {
        console.error(`  [Sportmonks player could not be matched] no Scoutastic players found for club "${scoutasticClub}" (Sportmonks team "${sportmonksTeamName}") — check clubAliases in scripts/lib/sportmonksLeagues.mjs`);
        warnedEmptyClubs.add(scoutasticClub);
      }
      return mapped;
    }

    // All existing sportmonks mappings, fetched once — this table is
    // small (bounded by real matches ever synced), no per-club filtering needed.
    const existingMappings = await fetchAllRows(db, "player_external_ids", "*", (q) => q.eq("provider", PROVIDER));
    const mappingByExternalId = new Map(existingMappings.map((m) => [m.external_player_id, m]));
    console.log(`  ${existingMappings.length} existing sportmonks mappings reused`);

    const fixturesResult = await fetchFinishedFixtures(league.sportmonksLeagueId, daysAgoISO(args.days), todayISO(), token, {
      retries: args.retries,
      onRetry,
    });
    if (!fixturesResult.ok) {
      console.error(`  [Sportmonks fixture request failed] ${fixturesResult.error}`);
      continue;
    }
    stats.fixturesInWindow += fixturesResult.data.length;
    console.log(`  ${fixturesResult.data.length} finished fixtures in the last ${args.days} days`);

    const fixtureIds = fixturesResult.data.map((f) => String(f.id));
    const alreadyStored =
      fixtureIds.length > 0 ? await fetchAllRows(db, "player_match_ratings", "fixture_id", (q) => q.eq("provider", PROVIDER).in("fixture_id", fixtureIds)) : [];
    const storedFixtureIds = new Set(alreadyStored.map((r) => r.fixture_id));

    const playerDobCache = new Map();

    for (const fx of fixturesResult.data) {
      const fixtureId = String(fx.id);
      if (storedFixtureIds.has(fixtureId)) {
        stats.fixturesSkippedAlreadyStored++;
        continue;
      }
      if (args.dryRun) {
        console.log(`  [dry-run] would fetch fixture ${fixtureId} (${fx.name})`);
        continue;
      }

      await sleep(args.delayMs);
      const detail = await fetchFixtureWithLineups(fx.id, token, { retries: args.retries, onRetry });
      if (!detail.ok) {
        console.error(`  [Sportmonks fixture request failed] fixture ${fixtureId}: ${detail.error}`);
        stats.fixturesFailed++;
        continue;
      }
      stats.fixturesFetched++;

      const rows = extractRatingRows(detail.data, league.name);
      const ratingRowsToUpsert = [];
      const newMappingRows = [];

      for (const row of rows) {
        let playerId = null;
        const existing = mappingByExternalId.get(row.externalPlayerId);

        if (existing) {
          playerId = existing.player_id;
          stats.playersMatchedExisting++;
        } else {
          // The candidate pool is already scoped to this player's own
          // club (candidatesForTeam), so `club` adds nothing further as a
          // scoring signal here — name (+DOB as a tie-breaker) is the
          // real discriminator within an already-correct pool.
          const teamCandidates = await candidatesForTeam(row.teamName);
          const query = { name: row.playerName, dateOfBirth: null, nationality: null, club: null };
          let result = resolveMatch(query, teamCandidates);
          let usedDob = false;

          if (result.status === "ambiguous") {
            let dob = playerDobCache.get(row.externalPlayerId);
            if (dob === undefined) {
              await sleep(args.delayMs);
              const playerDetail = await fetchPlayer(row.externalPlayerId, token, { retries: args.retries, onRetry });
              dob = playerDetail.ok ? playerDetail.data?.date_of_birth ?? null : null;
              playerDobCache.set(row.externalPlayerId, dob);
            }
            if (dob) {
              result = resolveMatch({ ...query, dateOfBirth: dob }, teamCandidates);
              usedDob = true;
            }
          }

          if (result.status === "matched") {
            playerId = result.best.id;
            const exactRawName = row.playerName && result.best.name && row.playerName.trim().toLowerCase() === result.best.name.trim().toLowerCase();
            const matchMethod = usedDob ? "dob_name" : exactRawName ? "name_club" : "normalized_name_club";
            newMappingRows.push({
              player_id: playerId,
              provider: PROVIDER,
              external_player_id: row.externalPlayerId,
              external_team_id: row.externalTeamId,
              match_method: matchMethod,
              confidence: result.confidence,
            });
            mappingByExternalId.set(row.externalPlayerId, { player_id: playerId });
            stats.playersMatchedNew++;
          } else {
            console.error(`  [Sportmonks player could not be matched] ${row.playerName ?? row.externalPlayerId} (${row.teamName ?? "unknown team"}) — ${result.reason ?? result.status}`);
            unmatchedLog.push({ league: league.name, externalPlayerId: row.externalPlayerId, name: row.playerName, team: row.teamName, reason: result.reason ?? result.status });
            stats.playersUnmatched++;
            continue;
          }
        }

        ratingRowsToUpsert.push({
          player_id: playerId,
          provider: PROVIDER,
          external_player_id: row.externalPlayerId,
          fixture_id: row.fixtureId,
          competition_id: row.competitionId,
          competition_name: row.competitionName,
          season_id: row.seasonId,
          match_date: row.matchDate,
          opponent: row.opponent,
          home_away: row.homeAway,
          minutes_played: row.minutesPlayed,
          starter: row.starter,
          rating: row.rating,
        });
      }

      if (newMappingRows.length > 0) {
        const { error: mapErr } = await db.from("player_external_ids").upsert(newMappingRows, { onConflict: "player_id,provider" });
        if (mapErr) console.error(`  Failed to upsert player_external_ids for fixture ${fixtureId}: ${mapErr.message}`);
      }
      if (ratingRowsToUpsert.length > 0) {
        const { error: ratingErr } = await db.from("player_match_ratings").upsert(ratingRowsToUpsert, { onConflict: "fixture_id,external_player_id,provider" });
        if (ratingErr) {
          console.error(`  Failed to upsert player_match_ratings for fixture ${fixtureId}: ${ratingErr.message}`);
        } else {
          stats.ratingsUpserted += ratingRowsToUpsert.length;
        }
      }
    }
  }

  console.log("\n=== SUMMARY ===");
  console.log(`Fixtures in window: ${stats.fixturesInWindow}`);
  console.log(`Fixtures already stored (skipped, not re-fetched): ${stats.fixturesSkippedAlreadyStored}`);
  console.log(`Fixtures fetched this run: ${stats.fixturesFetched}`);
  console.log(`Fixtures failed: ${stats.fixturesFailed}`);
  console.log(`Ratings upserted: ${stats.ratingsUpserted}`);
  console.log(`Players matched via existing mapping: ${stats.playersMatchedExisting}`);
  console.log(`Players matched fresh this run: ${stats.playersMatchedNew}`);
  console.log(`Players unmatched (skipped, logged): ${stats.playersUnmatched}`);
  if (unmatchedLog.length > 0) {
    console.log("\nUnmatched players (for review):");
    for (const u of unmatchedLog) {
      console.log(`  [${u.league}] ${u.name ?? u.externalPlayerId} (${u.team ?? "unknown team"}) — ${u.reason}`);
    }
  }
  console.log(`\nSync completed: ${new Date().toISOString()}`);
}

main();
