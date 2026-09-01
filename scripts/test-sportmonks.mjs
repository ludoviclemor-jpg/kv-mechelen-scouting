#!/usr/bin/env node
/**
 * Sportmonks diagnostic script — verifies the token works, finds both
 * TEST-scope leagues, fetches one recent completed fixture from each, and
 * prints real player ratings. Every endpoint/shape here matches
 * scripts/lib/sportmonksClient.mjs, confirmed live 2026-09-01 (see
 * docs/SPORTMONKS_INTEGRATION.md). Read-only — never writes to Postgres.
 *
 * Usage:
 *   SPORTMONKS_API_TOKEN=... node scripts/test-sportmonks.mjs
 */

import { verifyToken, fetchCurrentSeason, fetchFinishedFixtures, fetchFixtureWithLineups } from "./lib/sportmonksClient.mjs";
import { SPORTMONKS_LEAGUES } from "./lib/sportmonksLeagues.mjs";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoISO(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const token = process.env.SPORTMONKS_API_TOKEN;
  if (!token) {
    console.error("No API token. Set SPORTMONKS_API_TOKEN and re-run.");
    process.exitCode = 1;
    return;
  }

  console.log("=== Step 1: verify token ===");
  const verify = await verifyToken(token);
  if (!verify.ok) {
    console.error(`Token verification failed: ${verify.error} (status ${verify.status})`);
    process.exitCode = 1;
    return;
  }
  console.log(`Token OK. Active plans: ${verify.plans.map((p) => `${p.plan} (${p.sport})`).join(", ")}`);
  console.log(`Rate limit remaining: ${verify.rateLimit?.remaining}/${verify.rateLimit ? "hour" : "?"}`);

  for (const league of SPORTMONKS_LEAGUES) {
    console.log(`\n=== ${league.name} (Sportmonks league id ${league.sportmonksLeagueId}) ===`);

    const season = await fetchCurrentSeason(league.sportmonksLeagueId, token);
    if (!season.ok) {
      console.error(`  Could not fetch current season: ${season.error}`);
      continue;
    }
    console.log(`  Current season: ${season.data?.name ?? "none flagged current"} (id ${season.data?.id ?? "n/a"})`);

    const fixtures = await fetchFinishedFixtures(league.sportmonksLeagueId, daysAgoISO(21), todayISO(), token);
    if (!fixtures.ok) {
      console.error(`  Could not fetch fixtures: ${fixtures.error}`);
      continue;
    }
    if (fixtures.data.length === 0) {
      console.log("  No finished fixtures in the last 21 days.");
      continue;
    }
    const latest = [...fixtures.data].sort((a, b) => b.starting_at.localeCompare(a.starting_at))[0];
    console.log(`  ${fixtures.data.length} finished fixtures found. Latest: "${latest.name}" (${latest.starting_at}, fixture id ${latest.id})`);

    const detail = await fetchFixtureWithLineups(latest.id, token);
    if (!detail.ok) {
      console.error(`  Could not fetch lineup detail: ${detail.error}`);
      continue;
    }
    const fx = detail.data;
    const home = fx.participants?.find((p) => p.meta?.location === "home");
    const away = fx.participants?.find((p) => p.meta?.location === "away");
    const withRating = (fx.lineups ?? []).filter((l) => l.details?.some((d) => d.type_id === 118));
    console.log(`  ${fx.lineups?.length ?? 0} lineup entries, ${withRating.length} with a real rating.`);

    console.log("  Sample players:");
    for (const l of withRating.slice(0, 5)) {
      const rating = l.details.find((d) => d.type_id === 118)?.data.value;
      const minutes = l.details.find((d) => d.type_id === 119)?.data.value ?? null;
      const starter = l.type_id === 11 ? "Starter" : l.type_id === 12 ? "Substitute" : `type_id=${l.type_id}`;
      const teamName = l.team_id === home?.id ? home.name : away?.name;
      const opponent = l.team_id === home?.id ? away?.name : home?.name;
      console.log(
        `    player_id=${l.player_id}  name=${l.player_name}  team=${teamName}  vs=${opponent}  ${starter}  minutes=${minutes}  rating=${rating}`
      );
    }
  }
}

main();
