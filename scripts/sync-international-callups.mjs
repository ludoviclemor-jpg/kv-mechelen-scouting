#!/usr/bin/env node
/**
 * First international call-up detection — see docs/INTERNATIONAL_CALLUPS.md
 * for the full investigation behind this design.
 *
 * A "call-up" here means genuinely selected for a national-team matchday
 * squad — confirmed real via `/matches`: each match's `homeTeamPlayers`/
 * `awayTeamPlayers` is a full matchday squad (typically 23 for a senior
 * fixture), including unused substitutes with `inLineup: false` and
 * `minutesPlayed: 0`. That is a genuinely different, and strictly earlier,
 * signal than "first appearance" (`debuts[]` on the player object, which
 * only fires once minutes are actually played) — this script tracks the
 * squad-selection signal specifically, not appearances.
 *
 * International competitions are identified by
 * `scoutastic_competitions.level_definition` — confirmed real, exactly
 * four values cover it: "National Team", "National team's qualifiers",
 * "Youth National Team Qualifiers", "National youth team". This already
 * distinguishes genuine national-team football (any confederation, any
 * age level) from club football, including club-side "International
 * Cup"/"International Youth Cup" competitions (FIFA Club World Cup
 * Qualifier, UEFA Youth League, etc.) which use *different*
 * level_definition values and are deliberately excluded — those are club
 * academy/continental competitions, not national-team call-ups.
 *
 * Scope, confirmed live (2026-08-31): 92 active international
 * competitions, ~1,600 matches for the current season alone across all of
 * them combined — small enough (comparable to sync-competitions.mjs, far
 * smaller than the club match/player crawls) to sync in one non-batched
 * pass, covering each competition's most recent `--seasons` (default 2)
 * for a safety margin against a call-up that happened just before the
 * "current" season boundary.
 *
 * Only cross-referenced against players already in our `players` table —
 * this deliberately never stores call-up data for players we don't
 * already track (the global national-team-football universe is far
 * larger than anything worth persisting here).
 *
 * `player_international_callups` is one row per (player, level) —
 * re-running this script only ever moves `first_call_up_date` *earlier*,
 * never later, so a later run with a narrower season window can't
 * regress an already-detected earlier call-up.
 *
 * Usage:
 *   SCOUTASTIC_API_KEY=... node scripts/sync-international-callups.mjs --dry-run
 *   SCOUTASTIC_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/sync-international-callups.mjs
 *
 * Credentials are read exclusively from environment variables — never
 * written to any file this script produces, never logged, never printed.
 */

import { baseUrl, fetchCompetitionMatches } from "./lib/scoutasticClient.mjs";
import { INTERNATIONAL_LEVEL_DEFINITIONS } from "./lib/internationalCompetitions.mjs";

function parseArgs(argv) {
  const args = { delayMs: 200, retries: 3, dryRun: false, seasons: 2 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--delay-ms") args.delayMs = Number(argv[++i]);
    else if (a === "--retries") args.retries = Number(argv[++i]);
    else if (a === "--seasons") args.seasons = Number(argv[++i]);
    else if (a === "--api-key") args.apiKey = argv[++i];
    else if (a === "--club-subdomain") args.clubSubdomain = argv[++i];
    else if (a === "--only-competition") args.onlyCompetition = argv[++i]; // testing: one competition only
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function onRetry({ url, status, attempt, retries, waitMs }) {
  console.error(`  [retry] ${url} status=${status}, waiting ${waitMs}ms (attempt ${attempt}/${retries})`);
}

/** Paginated read helper — PostgREST caps a `.select()` at 1,000 rows/request even with an explicit larger `.limit()` (see docs/SCOUTASTIC_SYNC.md). */
async function fetchAllRows(db, table, columns, build = (q) => q) {
  const rows = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await build(db.from(table).select(columns)).range(from, from + PAGE - 1);
    if (error) return { ok: false, error };
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return { ok: true, data: rows };
}

/** Up to `count` most recent distinct seasons for a competition — `current_season` first, then the tail of `available_seasons` (sorted ascending, so its last entries are the most recent). */
function seasonsToSync(comp, count) {
  const seasons = [];
  const seen = new Set();
  function add(s) {
    const str = s === null || s === undefined ? null : String(s);
    if (str && !seen.has(str)) {
      seen.add(str);
      seasons.push(str);
    }
  }
  add(comp.current_season);
  const available = Array.isArray(comp.available_seasons) ? [...comp.available_seasons].sort() : [];
  for (let i = available.length - 1; i >= 0 && seasons.length < count; i--) add(available[i]);
  return seasons;
}

/**
 * The competition's own `age_category` is NOT reliable for level —
 * confirmed live (2026-08-31): "FS" (International Friendlies) is a
 * single shared bucket across every age level in SCOUTASTIC's data (a
 * real U15 fixture, "Finland U15", showed up tagged `age_category:
 * "Senior"` at the competition level), so relying on it alone
 * mis-labeled real U15/U16/U17 call-ups as "Senior". The national
 * team's own name is the reliable signal instead — SCOUTASTIC
 * consistently suffixes youth sides ("Hungary U17"), and a name with no
 * such suffix is the senior side. Falls back to the competition's
 * age_category only when the team name itself has no U-suffix but the
 * competition is unambiguously youth-scoped anyway (a competition like
 * "U19Q" should never really hit this path, but it's a safety net, not
 * the primary signal).
 */
function levelFromTeamName(teamName) {
  const match = typeof teamName === "string" ? teamName.match(/\bU-?(\d{1,2})\b/i) : null;
  return match ? `U${match[1]}` : null;
}

function deriveLevel(teamName, competitionAgeCategory) {
  const fromName = levelFromTeamName(teamName);
  if (fromName) return fromName;
  return competitionAgeCategory && competitionAgeCategory !== "Senior" ? competitionAgeCategory : "Senior";
}

/** "Belgium" from both "Belgium" and "Belgium U21" — same regex as the live SQL backfill in db/schema.sql, kept in sync there. Powers the Country filter on /call-ups. */
function countryFromTeamName(teamName) {
  return typeof teamName === "string" ? teamName.replace(/\s+U-?\d{1,2}$/i, "").trim() : teamName;
}

/** Every lineup player on either side who matches a player we already track — never a global crawl of every capped player worldwide. */
function extractCandidates(rawMatch, competition, knownPlayerIds) {
  const candidates = [];
  const date = typeof rawMatch.date === "string" ? rawMatch.date : null;
  if (!date) return candidates;

  const sides = [
    { players: rawMatch.homeTeamPlayers, teamName: rawMatch.homeTeamName, teamId: rawMatch.homeTeamId },
    { players: rawMatch.awayTeamPlayers, teamName: rawMatch.awayTeamName, teamId: rawMatch.awayTeamId },
  ];

  for (const side of sides) {
    if (!Array.isArray(side.players) || typeof side.teamName !== "string") continue;
    for (const p of side.players) {
      const scoutasticId = p?.id !== undefined && p?.id !== null ? String(p.id) : null;
      if (!scoutasticId) continue;
      const playerId = knownPlayerIds.get(scoutasticId);
      if (!playerId) continue; // not a player we track — never persisted

      candidates.push({
        playerId,
        level: deriveLevel(side.teamName, competition.age_category),
        teamName: side.teamName,
        country: countryFromTeamName(side.teamName),
        teamId: side.teamId !== undefined && side.teamId !== null ? String(side.teamId) : null,
        competitionId: competition.competition_id,
        date, // full ISO datetime — compares lexically correctly against another ISO datetime
        appeared: Boolean(p.inLineup) || Number(p.minutesPlayed) > 0,
      });
    }
  }
  return candidates;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const apiKey = args.apiKey || process.env.SCOUTASTIC_API_KEY;
  if (!apiKey) {
    console.error("No API key. Set the SCOUTASTIC_API_KEY environment variable and re-run.");
    process.exitCode = 1;
    return;
  }

  const clubSubdomain = args.clubSubdomain || process.env.SCOUTASTIC_CLUB_SUBDOMAIN || "kvmechelen";
  const apiBase = process.env.SCOUTASTIC_API_BASE_URL || baseUrl(clubSubdomain);

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — needed to read the competition list and our own players table.");
    process.exitCode = 1;
    return;
  }

  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  console.log("INTERNATIONAL CALL-UP SYNC STARTED");
  const startedAt = Date.now();

  // --- 1. Load in-scope international competitions ---
  let competitions;
  if (args.onlyCompetition) {
    const res = await fetchAllRows(db, "scoutastic_competitions", "competition_id,age_category,current_season,available_seasons", (q) =>
      q.eq("competition_id", args.onlyCompetition)
    );
    if (!res.ok || res.data.length === 0) {
      console.error(`Competition ${args.onlyCompetition} not found in scoutastic_competitions.`);
      process.exitCode = 1;
      return;
    }
    competitions = res.data;
  } else {
    const res = await fetchAllRows(
      db,
      "scoutastic_competitions",
      "competition_id,age_category,current_season,available_seasons",
      (q) => q.in("level_definition", INTERNATIONAL_LEVEL_DEFINITIONS).eq("is_active", true)
    );
    if (!res.ok) {
      console.error(`Failed to load international competitions: ${res.error.message}`);
      process.exitCode = 1;
      return;
    }
    competitions = res.data;
  }
  console.log(`International competitions to sync: ${competitions.length}`);

  // --- 2. Load every player we already track (only these are ever persisted) ---
  const playersRes = await fetchAllRows(db, "players", "id,scoutastic_player_id", (q) => q.eq("active", true));
  if (!playersRes.ok) {
    console.error(`Failed to load players: ${playersRes.error.message}`);
    process.exitCode = 1;
    return;
  }
  const knownPlayerIds = new Map(playersRes.data.map((p) => [p.scoutastic_player_id, p.id]));
  console.log(`Known players to cross-reference: ${knownPlayerIds.size}`);

  // --- 3. Crawl every (competition, season) and collect candidate call-ups ---
  let requestsOk = 0;
  let requestsFailed = 0;
  let matchesScanned = 0;
  const failures = [];
  const allCandidates = [];

  for (const comp of competitions) {
    const seasons = seasonsToSync(comp, args.seasons);
    if (seasons.length === 0) continue; // no known season at all — nothing to fetch

    for (const season of seasons) {
      const res = await fetchCompetitionMatches(apiBase, apiKey, comp.competition_id, season, { retries: args.retries, onRetry });
      await sleep(args.delayMs);

      if (!res.ok) {
        requestsFailed++;
        failures.push({ competitionId: comp.competition_id, season, error: res.error });
        console.error(`  [fail] ${comp.competition_id} season ${season}: ${res.error}`);
        continue;
      }

      requestsOk++;
      matchesScanned += res.data.length;
      for (const rawMatch of res.data) {
        allCandidates.push(...extractCandidates(rawMatch, comp, knownPlayerIds));
      }
      if (res.data.length > 0) {
        console.log(`[${comp.competition_id} / ${season}] ${res.data.length} matches scanned`);
      }
    }
  }

  console.log(`\nRequests: ${requestsOk} ok, ${requestsFailed} failed`);
  console.log(`Matches scanned: ${matchesScanned}`);
  console.log(`Candidate call-up rows (player x level x match, before reduction): ${allCandidates.length}`);

  // --- 4. Reduce to the earliest date per (player, level) ---
  const bestByKey = new Map();
  for (const c of allCandidates) {
    const key = `${c.playerId}::${c.level}`;
    const existing = bestByKey.get(key);
    if (!existing || c.date < existing.date) bestByKey.set(key, c);
  }
  console.log(`Distinct (player, level) call-ups found this run: ${bestByKey.size}`);

  // --- 5. Never regress an already-stored earlier date ---
  const touchedPlayerIds = [...new Set([...bestByKey.values()].map((c) => c.playerId))];
  const existingMap = new Map(); // `${player_id}::${level}` -> existing first_call_up_date (YYYY-MM-DD)
  const CHUNK = 500;
  for (let i = 0; i < touchedPlayerIds.length; i += CHUNK) {
    const chunk = touchedPlayerIds.slice(i, i + CHUNK);
    const res = await fetchAllRows(db, "player_international_callups", "player_id,level,first_call_up_date", (q) => q.in("player_id", chunk));
    if (!res.ok) {
      console.error(`Failed to load existing call-ups: ${res.error.message}`);
      process.exitCode = 1;
      return;
    }
    for (const row of res.data) existingMap.set(`${row.player_id}::${row.level}`, row.first_call_up_date);
  }

  const upsertRows = [];
  for (const [key, c] of bestByKey) {
    const newDate = c.date.slice(0, 10);
    const existingDate = existingMap.get(key);
    if (existingDate && existingDate <= newDate) continue; // keep the earlier (or equal) date already on file
    upsertRows.push({
      player_id: c.playerId,
      level: c.level,
      team_name: c.teamName,
      country: c.country,
      team_id: c.teamId,
      competition_id: c.competitionId,
      first_call_up_date: newDate,
      first_call_up_appeared: c.appeared,
    });
  }
  console.log(`Rows to upsert (new or earlier than what's on file): ${upsertRows.length}`);

  // --- 6. Write ---
  let upserted = 0;
  if (!args.dryRun && upsertRows.length > 0) {
    for (let i = 0; i < upsertRows.length; i += CHUNK) {
      const batch = upsertRows.slice(i, i + CHUNK);
      const { error } = await db.from("player_international_callups").upsert(batch, { onConflict: "player_id,level" });
      if (error) {
        console.error(`  [fail] upsert batch ${i}-${i + batch.length}: ${error.message}`);
      } else {
        upserted += batch.length;
      }
    }
  } else if (args.dryRun) {
    upserted = upsertRows.length;
  }

  const durationSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\nCall-ups upserted${args.dryRun ? " (dry-run, not written)" : ""}: ${upserted}`);
  console.log(`Duration: ${durationSec}s`);
  console.log(`Sync completed: ${new Date().toISOString().slice(0, 16).replace("T", " ")}`);
  if (args.dryRun) console.log("(--dry-run: nothing written to Postgres)");

  if (requestsOk === 0 && requestsFailed > 0) process.exitCode = 1;
}

main();
