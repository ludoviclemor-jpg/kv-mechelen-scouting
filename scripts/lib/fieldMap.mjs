/**
 * Maps a raw SCOUTASTIC player object into our normalized Player shape.
 *
 * Every field read here — `transfermarktId`, `firstName`, `lastName`,
 * `dateOfBirth`, `height`, `foot`, `agent`, `nationality`,
 * `secondNationality`, `mainPosition`, `secondaryPosition1/2`,
 * `contractExpires`, `marketValue`, `teams[]`, `imageUrlV2`,
 * `performanceSummary`, `debuts` — is confirmed directly against real API
 * responses (see docs/COMPETITIONS.md for the `debuts` confirmation).
 * Fields SCOUTASTIC doesn't return are left `null`, never invented.
 *
 * Two confirmed things worth calling out because they're easy to get
 * wrong: the player's stable id is `transfermarktId`, not `externalId`
 * (that's only the query param name / a field on nested `teams[]`
 * entries); and of the two photo URLs SCOUTASTIC returns, only
 * `imageUrlV2` is publicly fetchable without the API key — `imageUrl`
 * 401s without auth, so it's never used here (a public GitHub Pages site
 * can't attach the key to an <img> request).
 *
 * `previousClub` and `secondaryPositions` beyond the two SCOUTASTIC
 * returns are still `null` — no confirmed source for prior clubs, and
 * only two secondary positions are ever provided.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = path.join(__dirname, "..", "..", "src", "lib", "scoutastic", "config");

const positionMap = JSON.parse(readFileSync(path.join(CONFIG_DIR, "positionMap.json"), "utf-8"));
const africanNationalities = JSON.parse(readFileSync(path.join(CONFIG_DIR, "africanNationalities.json"), "utf-8"));

const africanSet = new Set(africanNationalities.map((n) => n.toLowerCase().trim()));

const NULL_DATE_SENTINELS = new Set(["0001-01-01", "0001-01-01t00:00:00.000z"]);

function normalizeDate(value) {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (NULL_DATE_SENTINELS.has(trimmed.toLowerCase())) return null;
  const isoDate = trimmed.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? isoDate : null;
}

/**
 * Only accepts a plain number, or a string that's unambiguously a plain
 * number (optionally with thousands separators). Never guesses a
 * multiplier for an abbreviated value like "1.2m" or "€1.2M" — those are
 * rejected (null + warning) rather than silently parsed as 1.2, which
 * would be off by a factor of a million.
 */
function normalizeNumber(value, fieldName, warnings) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    const plain = trimmed.replace(/[,\s]/g, "");
    if (/^-?\d+(\.\d+)?$/.test(plain)) {
      return Number(plain);
    }
    warnings.push(`${fieldName}: could not safely parse ${JSON.stringify(value)} as a plain number — left null rather than guess`);
    return null;
  }
  return null;
}

function normalizeFoot(value, warnings) {
  if (!value || typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (v === "left") return "Left";
  if (v === "right") return "Right";
  if (v === "both" || v === "either") return "Both";
  warnings.push(`unrecognized foot value: ${JSON.stringify(value)}`);
  return null;
}

function normalizePosition(value, warnings) {
  if (!value || typeof value !== "string") return { position: null, raw: null };
  const raw = value;
  const key = value.trim().toLowerCase().replace(/[\s_-]/g, "");
  const mapped = positionMap[key];
  if (!mapped) {
    warnings.push(`unmapped mainPosition code: ${JSON.stringify(value)} — added as "OTHER", update positionMap.json once confirmed`);
    return { position: "OTHER", raw };
  }
  return { position: mapped, raw };
}

function isAfrican(nationality, secondNationality) {
  const check = (n) => typeof n === "string" && africanSet.has(n.toLowerCase().trim());
  return check(nationality) || check(secondNationality);
}

function normalizeTeams(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((t) => t && typeof t === "object" && typeof t.name === "string")
    .map((t) => ({ name: t.name, isMain: Boolean(t.isMain) }));
}

function mainClubName(teams) {
  const main = teams.find((t) => t.isMain);
  return main?.name ?? teams[0]?.name ?? null;
}

function fullName(firstName, lastName, fallbackId) {
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  return name || `SCOUTASTIC #${fallbackId}`;
}

/**
 * `imageUrlV2` is a relative path to a publicly-fetchable image (confirmed
 * via a direct unauthenticated request) — `imageUrl` is not (401s without
 * the API key) and is deliberately never used.
 */
function photoUrlFrom(raw, imageBaseUrl) {
  if (typeof raw.imageUrlV2 !== "string" || !raw.imageUrlV2) return null;
  if (!imageBaseUrl) return null;
  return `${imageBaseUrl}${raw.imageUrlV2}`;
}

/**
 * Real senior-debut detection (see docs/COMPETITIONS.md's "confirmed live"
 * section) — confirmed on both /player and /players?teamId= that `debuts`
 * is "first appearance per competition", not "career debut": a real
 * player can have a dozen+ entries across every club/cup/international
 * tournament they've ever featured in, including youth internationals.
 *
 * Scoped deliberately narrowly to avoid the obvious trap ("every senior
 * player has a debut somewhere, so this would be true for almost
 * everyone"): only counts as a real "debutant" here if —
 *   1. `debuts` has an entry for the *specific competition this player was
 *      just crawled through* (`context.competitionId` — the team/league
 *      context that got us this player in the first place), not any
 *      competition anywhere in their career, and
 *   2. that debut happened within `DEBUT_RECENCY_DAYS` of the sync run —
 *      otherwise a player who debuted three years ago and simply still
 *      plays for the same club would spuriously read as a fresh debutant
 *      forever.
 */
export const DEBUT_RECENCY_DAYS = 270; // roughly one football season

function detectDebut(rawDebuts, context, warnings) {
  if (!Array.isArray(rawDebuts) || !context.competitionId) return { isDebutant: false, debutDate: null };
  const entry = rawDebuts.find((d) => d && d.competitionExternalId === context.competitionId);
  if (!entry) return { isDebutant: false, debutDate: null };
  const debutDate = normalizeDate(entry.date);
  if (!debutDate) {
    warnings.push(`debuts entry for competition ${context.competitionId} had an unparseable date: ${JSON.stringify(entry.date)}`);
    return { isDebutant: false, debutDate: null };
  }
  const now = context.nowIso ? new Date(context.nowIso) : new Date();
  const ageDays = (now.getTime() - new Date(debutDate).getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays < 0 || ageDays > DEBUT_RECENCY_DAYS) return { isDebutant: false, debutDate: null };
  return { isDebutant: true, debutDate };
}

function normalizeSecondaryPositions(raw, warnings) {
  const codes = [raw.secondaryPosition1, raw.secondaryPosition2].filter(
    (v) => typeof v === "string" && v.length > 0
  );
  if (codes.length === 0) return null;
  return codes.map((code) => {
    const { position } = normalizePosition(code, warnings);
    return position;
  });
}

/**
 * `performanceSummary` (confirmed available on both /player and
 * /players?teamId=) is keyed by season year, each holding one entry per
 * competition played that season. Aggregates the most recent season
 * across all *club* competitions — the figures a scout cares about here
 * are "this season's club output", not a lifetime total and not
 * international appearances mixed in.
 *
 * Real bug, found and fixed while building the player-profile stats work
 * (docs/PLAYER_PROFILE.md): a player capped for their country in the
 * same calendar year as their club season (very common — a full senior
 * international season and the international match calendar both fall
 * under the same year key) previously had those international
 * `matchesPlayed`/`minutesPlayed`/`goals`/`assists` silently summed
 * together with their club numbers, inflating "this season's" figures
 * with matches that were never for their club. `internationalCompetitionIds`
 * (the same confirmed level_definition-based set used by
 * scripts/sync-international-callups.mjs — see
 * docs/INTERNATIONAL_CALLUPS.md) excludes those rows here.
 *
 * Returns nulls (not zeros) only when the field itself is entirely
 * absent — a real zero (e.g. an unused squad player) is a confirmed
 * value, not a missing one.
 */
function currentSeasonStats(raw, internationalCompetitionIds) {
  const summary = raw.performanceSummary;
  if (!summary || typeof summary !== "object") {
    return { appearances: null, minutes: null, goals: null, assists: null };
  }
  const seasons = Object.keys(summary).filter((k) => /^\d{4}$/.test(k));
  if (seasons.length === 0) {
    return { appearances: null, minutes: null, goals: null, assists: null };
  }
  const latestSeason = seasons.sort().at(-1);
  const allRows = Array.isArray(summary[latestSeason]) ? summary[latestSeason] : [];
  const rows = allRows.filter((row) => !internationalCompetitionIds?.has(row?.competitionId));

  const sum = (key) => rows.reduce((total, row) => total + (Number(row?.[key]) || 0), 0);
  return {
    appearances: sum("matchesPlayed"),
    minutes: sum("minutesPlayed"),
    goals: sum("goals"),
    assists: sum("assists"),
  };
}

/**
 * Flattens `performanceSummary` (season -> array of per-competition rows)
 * into one flat array, tagging each row `isInternational` using the same
 * confirmed level_definition-based set as `currentSeasonStats()` above,
 * and `level` (the competition's own `age_category` — "Senior", "U21",
 * etc., same convention as scripts/sync-international-callups.mjs) —
 * powers the player-profile Stats/Game Time/International sections
 * (season + competition selectors, club vs. international split, caps
 * grouped by level) without needing a second lookup at read time.
 * Stored as-is on `players.performance_seasons`; nothing here is
 * invented — every field is a real SCOUTASTIC value, `null`/omitted when
 * absent, including `level` for a competition we haven't got in our own
 * `scoutastic_competitions` catalog yet.
 */
function extractPerformanceSeasons(raw, internationalCompetitionIds, competitionAgeCategories) {
  const summary = raw.performanceSummary;
  if (!summary || typeof summary !== "object") return [];
  const rows = [];
  for (const [season, seasonRows] of Object.entries(summary)) {
    if (!/^\d{4}$/.test(season) || !Array.isArray(seasonRows)) continue;
    for (const row of seasonRows) {
      if (!row || typeof row !== "object") continue;
      rows.push({
        season,
        competitionId: typeof row.competitionId === "string" ? row.competitionId : null,
        contest: typeof row.contest === "string" ? row.contest : null, // SCOUTASTIC's own competition display name for this row
        teamId: row.teamId !== undefined && row.teamId !== null ? String(row.teamId) : null,
        isInternational: Boolean(internationalCompetitionIds?.has(row.competitionId)),
        level: competitionAgeCategories?.get(row.competitionId) ?? null,
        matchesPlayed: Number.isFinite(row.matchesPlayed) ? row.matchesPlayed : null,
        minutesPlayed: Number.isFinite(row.minutesPlayed) ? row.minutesPlayed : null,
        substitutes: Number.isFinite(row.substitutes) ? row.substitutes : null,
        goals: Number.isFinite(row.goals) ? row.goals : null,
        assists: Number.isFinite(row.assists) ? row.assists : null,
        ownGoals: Number.isFinite(row.ownGoals) ? row.ownGoals : null,
        yellow: Number.isFinite(row.yellow) ? row.yellow : null,
        red: Number.isFinite(row.red) ? row.red : null,
        yellowRed: Number.isFinite(row.yellowRed) ? row.yellowRed : null,
        cleanSheets: Number.isFinite(row.cleanSheets) ? row.cleanSheets : null,
        opponentGoalsOnThePitch: Number.isFinite(row.opponentGoalsOnThePitch) ? row.opponentGoalsOnThePitch : null,
      });
    }
  }
  return rows;
}

/**
 * `playedPositions` (confirmed real, e.g. `{"leftback": 23, "rightback": 3}`)
 * — real per-position appearance counts, already returned on every squad
 * crawl at no extra API cost, previously discarded. Stored as-is (raw
 * SCOUTASTIC position-code keys, not yet mapped through positionMap.json —
 * the player-profile UI maps them for display the same way `mainPosition`
 * already is) on `players.played_positions`. Powers "positions actually
 * played" (docs/PLAYER_PROFILE.md) — never estimated from the generic
 * registered `mainPosition`.
 */
function extractPlayedPositions(raw) {
  const value = raw.playedPositions;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value).filter(([, count]) => Number.isFinite(count) && count > 0);
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

/**
 * @param {object} raw - raw SCOUTASTIC player object (from /player or /players?teamId=)
 * @param {object} context - { externalId, competitionId, competitionCountry, isEasternEuropeanLeague, nowIso, imageBaseUrl, internationalCompetitionIds, competitionAgeCategories }
 * @returns {{ player: object, warnings: string[] }}
 */
export function mapScoutasticPlayer(raw, context) {
  const warnings = [];

  // The player's own stable id is `transfermarktId` — `externalId` is not
  // a field on the player object (only on nested teams[] entries), so it
  // only helps here as a defensive fallback.
  const playerId = String(raw.transfermarktId ?? raw.externalId ?? context.externalId ?? "");
  if (!playerId) {
    // Without a stable id this can't be safely upserted — every id-less
    // player would collide into the same blank-id record. Treated as a
    // real per-player failure (counted, logged, never silently merged)
    // rather than inserted with a shared empty id.
    throw new Error(
      `no transfermarktId/externalId on raw player object (name: ${[raw.firstName, raw.lastName].filter(Boolean).join(" ") || "unknown"})`
    );
  }

  const firstName = typeof raw.firstName === "string" ? raw.firstName : null;
  const lastName = typeof raw.lastName === "string" ? raw.lastName : null;
  const { position, raw: positionRaw } = normalizePosition(raw.mainPosition, warnings);
  const teams = normalizeTeams(raw.teams);
  const seasonStats = currentSeasonStats(raw, context.internationalCompetitionIds);
  const performanceSeasons = extractPerformanceSeasons(raw, context.internationalCompetitionIds, context.competitionAgeCategories);
  const playedPositions = extractPlayedPositions(raw);
  const debut = detectDebut(raw.debuts, context, warnings);

  const player = {
    scoutasticPlayerId: playerId,
    source: "SCOUTASTIC",

    firstName,
    lastName,
    name: fullName(firstName, lastName, playerId),
    photoUrl: photoUrlFrom(raw, context.imageBaseUrl),

    dateOfBirth: normalizeDate(raw.dateOfBirth),
    nationality: typeof raw.nationality === "string" ? raw.nationality : null,
    secondNationality: typeof raw.secondNationality === "string" ? raw.secondNationality : null,
    isAfrican: isAfrican(raw.nationality, raw.secondNationality),

    position,
    positionRaw,
    secondaryPositions: normalizeSecondaryPositions(raw, warnings),

    club: mainClubName(teams),
    previousClub: null, // no confirmed source for prior clubs in any response so far
    teams,

    league: context.competitionCountry ?? null,
    leagueCountry: context.competitionCountry ?? null,
    competitionId: context.competitionId ?? null,
    isEasternEuropeanLeague: Boolean(context.isEasternEuropeanLeague),

    heightCm: normalizeNumber(raw.height, "height", warnings),
    preferredFoot: normalizeFoot(raw.foot, warnings),
    agent: typeof raw.agent === "string" ? raw.agent : null,
    marketValueEUR: normalizeNumber(raw.marketValue, "marketValue", warnings),
    contractExpiry: normalizeDate(raw.contractExpires),

    appearances: seasonStats.appearances,
    minutes: seasonStats.minutes,
    goals: seasonStats.goals,
    assists: seasonStats.assists,
    performanceSeasons,
    playedPositions,

    lastSyncedAt: context.nowIso,
    active: true,

    status: "not_assessed",
    notes: { strengths: "", weaknesses: "", recommendation: "", general: "" },
    // Real, only when a senior competition + team assignment is confirmed
    // for this crawl — see docs/COMPETITIONS.md ("senior/first-team vs.
    // youth/reserve" is established by scope, since only senior
    // competitions are ever crawled, not by a SCOUTASTIC field).
    isYouthOrReserve: false,

    // SCOUTASTIC-owned as of the debut-detection work (see detectDebut
    // above and docs/COMPETITIONS.md) — genuinely computed from real
    // `debuts` data, not a placeholder. Rating fields below remain
    // SofaScore-provider-owned; the sync script's upsert logic must keep
    // preserving those on existing players (see PRESERVED_ON_UPDATE in
    // sync-scoutastic.mjs) — only isDebutant/debutDate moved out of that
    // preserved group.
    isDebutant: debut.isDebutant,
    debutDate: debut.debutDate,

    sofascorePlayerId: null,
    sofascoreMatchStatus: "pending",
    sofascoreMatchConfidence: null,
    ratingsTeamId: null,
    lastSofaScoreSyncAt: null,
    matches: [],
    ratedMatchesCount: 0,
    ratingAverage: null,
    ratingHighest: null,
    ratingLowest: null,
  };

  return { player, warnings };
}
