import type { Position, ScoutingStatus } from "./types";

/**
 * Eastern European leagues currently in scope for the African Debutants
 * feed. SCOUTASTIC will replace/extend this list with live competition
 * coverage in Phase 2 — the UI must not assume this list is exhaustive.
 */
export const EASTERN_EUROPEAN_COUNTRIES = [
  "Poland",
  "Czech Republic",
  "Slovakia",
  "Hungary",
  "Romania",
  "Bulgaria",
  "Croatia",
  "Serbia",
  "Slovenia",
  "Bosnia & Herzegovina",
  "Montenegro",
  "North Macedonia",
  "Albania",
  "Kosovo",
  "Moldova",
  "Ukraine",
  "Georgia",
  "Armenia",
  "Azerbaijan",
  "Latvia",
  "Lithuania",
  "Estonia",
] as const;

/**
 * Nationalities treated as "African" for filtering purposes. This is the
 * seam SCOUTASTIC's player nationality field plugs into — kept as a flat
 * list (not a country-code lookup) so it stays easy to audit and extend.
 */
export const AFRICAN_NATIONALITIES = [
  "Nigeria",
  "Ghana",
  "Senegal",
  "Ivory Coast",
  "Cameroon",
  "Mali",
  "Morocco",
  "Algeria",
  "Tunisia",
  "Egypt",
  "DR Congo",
  "Guinea",
  "Zambia",
  "South Africa",
  "Kenya",
  "Burkina Faso",
  "Gabon",
  "Uganda",
  "Benin",
  "Angola",
] as const;

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
