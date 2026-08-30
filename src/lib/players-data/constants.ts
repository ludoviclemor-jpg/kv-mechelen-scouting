import type { Position, ScoutingStatus } from "./types";
import easternEuropeanCountriesJson from "@/lib/scoutastic/config/easternEuropeanCountries.json";
import africanNationalitiesJson from "@/lib/scoutastic/config/africanNationalities.json";

/**
 * Eastern European countries used to classify a synced competition as
 * "Eastern European" for the African Debutants feed. Single source of
 * truth shared with the sync script — see
 * src/lib/scoutastic/config/easternEuropeanCountries.json.
 */
export const EASTERN_EUROPEAN_COUNTRIES = easternEuropeanCountriesJson;

/**
 * Nationalities treated as "African" for filtering purposes. Single
 * source of truth shared with the sync script — see
 * src/lib/scoutastic/config/africanNationalities.json.
 */
export const AFRICAN_NATIONALITIES = africanNationalitiesJson;

export const POSITIONS: Position[] = [
  "GK",
  "CB",
  "RB",
  "LB",
  "DM",
  "CM",
  "AM",
  "RW",
  "LW",
  "ST",
  "OTHER",
];

export const POSITION_LABELS: Record<Position, string> = {
  GK: "Goalkeeper",
  CB: "Centre Back",
  RB: "Right Back",
  LB: "Left Back",
  DM: "Defensive Midfielder",
  CM: "Central Midfielder",
  AM: "Attacking Midfielder",
  RW: "Right Winger",
  LW: "Left Winger",
  ST: "Striker",
  OTHER: "Other",
};

export const SCOUTING_STATUSES: ScoutingStatus[] = [
  "not_assessed",
  "monitoring",
  "interested",
  "priority",
  "rejected",
];

export const STATUS_LABELS: Record<ScoutingStatus, string> = {
  not_assessed: "Not assessed",
  monitoring: "Monitoring",
  interested: "Interested",
  priority: "Priority",
  rejected: "Rejected",
};

export const MINIMUM_RATED_MATCHES = 3;

/** "Unknown" for null — a player whose position SCOUTASTIC hasn't returned yet. */
export function positionLabel(position: Position | null): string {
  return position ? POSITION_LABELS[position] : "Unknown";
}
