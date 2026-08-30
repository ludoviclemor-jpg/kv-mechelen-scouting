/**
 * Maps a raw SCOUTASTIC player object into our normalized Player shape.
 *
 * Every field read here — `transfermarktId`, `firstName`, `lastName`,
 * `dateOfBirth`, `height`, `foot`, `agent`, `nationality`,
 * `secondNationality`, `mainPosition`, `secondaryPosition1/2`,
 * `contractExpires`, `marketValue`, `teams[]`, `imageUrlV2`,
 * `performanceSummary` — is confirmed directly against real API responses.
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
 * across all competitions — the figures a scout cares about are "this
 * season's output", not a lifetime total. Returns nulls (not zeros) only
 * when the field itself is entirely absent — a real zero (e.g. an unused
 * squad player) is a confirmed value, not a missing one.
 */
function currentSeasonStats(raw) {
  const summary = raw.performanceSummary;
  if (!summary || typeof summary !== "object") {
    return { appearances: null, minutes: null, goals: null, assists: null };
  }
  const seasons = Object.keys(summary).filter((k) => /^\d{4}$/.test(k));
  if (seasons.length === 0) {
    return { appearances: null, minutes: null, goals: null, assists: null };
  }
  const latestSeason = seasons.sort().at(-1);
  const rows = Array.isArray(summary[latestSeason]) ? summary[latestSeason] : [];

  const sum = (key) => rows.reduce((total, row) => total + (Number(row?.[key]) || 0), 0);
  return {
    appearances: sum("matchesPlayed"),
    minutes: sum("minutesPlayed"),
    goals: sum("goals"),
    assists: sum("assists"),
  };
}

/**
 * @param {object} raw - raw SCOUTASTIC player object (from /player or /players?teamId=)
 * @param {object} context - { externalId, competitionId, competitionCountry, isEasternEuropeanLeague, nowIso, imageBaseUrl }
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
  const seasonStats = currentSeasonStats(raw);

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

    lastSyncedAt: context.nowIso,
    active: true,

    status: "not_assessed",
    notes: { strengths: "", weaknesses: "", recommendation: "", general: "" },
    isYouthOrReserve: false,

    // SofaScore enrichment defaults — this is the SCOUTASTIC mapper, it
    // never sets these to anything but "no data yet". The sync script's
    // upsert logic preserves real values here on existing players; see
    // the PRESERVED_ON_UPDATE fields in sync-scoutastic.mjs.
    sofascorePlayerId: null,
    sofascoreMatchStatus: "pending",
    sofascoreMatchConfidence: null,
    ratingsTeamId: null,
    lastSofaScoreSyncAt: null,
    matches: [],
    isDebutant: false,
    debutDate: null,
    ratingAverage: null,
    ratingHighest: null,
    ratingLowest: null,
  };

  return { player, warnings };
}
