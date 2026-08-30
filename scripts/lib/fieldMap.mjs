/**
 * Maps a raw SCOUTASTIC player object into our normalized Player shape.
 *
 * Every path read here (`firstName`, `lastName`, `dateOfBirth`, `height`,
 * `foot`, `agent`, `nationality`, `secondNationality`, `mainPosition`,
 * `contractExpires`, `marketValue`, `teams[]`) is confirmed against a real
 * API response from a prior verification pass. Fields SCOUTASTIC doesn't
 * return are left `null` — never invented. Fields whose availability is
 * still unverified (appearances/minutes/goals/assists, photoUrl,
 * previousClub, secondaryPositions) are always `null` until confirmed with
 * a real response (see docs/SCOUTASTIC_SYNC.md).
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
 * @param {object} raw - raw SCOUTASTIC player object (from /player or /players?teamId=)
 * @param {object} context - { externalId, competitionId, competitionCountry, isEasternEuropeanLeague, nowIso }
 * @returns {{ player: object, warnings: string[] }}
 */
export function mapScoutasticPlayer(raw, context) {
  const warnings = [];

  const externalId = String(raw.externalId ?? raw.id ?? context.externalId ?? "");
  if (!externalId) warnings.push("no externalId/id found on raw player object");

  const firstName = typeof raw.firstName === "string" ? raw.firstName : null;
  const lastName = typeof raw.lastName === "string" ? raw.lastName : null;
  const { position, raw: positionRaw } = normalizePosition(raw.mainPosition, warnings);
  const teams = normalizeTeams(raw.teams);

  const player = {
    scoutasticPlayerId: externalId,
    source: "SCOUTASTIC",

    firstName,
    lastName,
    name: fullName(firstName, lastName, externalId),
    photoUrl: null, // not present in any confirmed response — pending verification

    dateOfBirth: normalizeDate(raw.dateOfBirth),
    nationality: typeof raw.nationality === "string" ? raw.nationality : null,
    secondNationality: typeof raw.secondNationality === "string" ? raw.secondNationality : null,
    isAfrican: isAfrican(raw.nationality, raw.secondNationality),

    position,
    positionRaw,
    secondaryPositions: null, // not present in any confirmed response — pending verification

    club: mainClubName(teams),
    previousClub: null, // not present in any confirmed response — pending verification
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

    appearances: null, // pending performanceData field verification
    minutes: null,
    goals: null,
    assists: null,

    lastSyncedAt: context.nowIso,
    active: true,

    status: "not_assessed",
    matches: [],
    notes: { strengths: "", weaknesses: "", recommendation: "", general: "" },
    isDebutant: false,
    debutDate: null,
    isYouthOrReserve: false,
  };

  return { player, warnings };
}
