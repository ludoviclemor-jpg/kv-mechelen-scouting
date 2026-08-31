/**
 * Competition catalog, sourced entirely from SCOUTASTIC (GET /competitions
 * — see docs/COMPETITIONS.md for the confirmed real response shape).
 * SofaScore/API-Football never touch this data — competitions, teams, and
 * the players linked to them are SCOUTASTIC's domain end to end.
 */

export interface Competition {
  id: string; // SCOUTASTIC's own stable code (its `transfermarktId`), used directly — no synthetic id
  name: string | null;
  area: string | null; // country/region name — SCOUTASTIC gives no separate country id
  association: string | null; // confederation code, e.g. "UEFA", "CAF", "AFC"
  isEuropean: boolean; // association === "UEFA", computed at sync time
  ageCategory: string | null; // "Senior" vs youth categories, straight from SCOUTASTIC
  gender: string | null;
  isActive: boolean;
  level: number | null; // SCOUTASTIC's own tier/type ranking — not remapped into an invented taxonomy
  levelDefinition: string | null; // human-readable label for `level`, e.g. "Second Tier", "League Cup"
  logoUrl: string | null; // often null — not every competition has one
  availableSeasons: string[];
  currentSeason: number | null;
  seasonStartDate: string | null;
  seasonEndDate: string | null;
  teamCount: number;
  createdAt: string;
  updatedAt: string;
  lastScoutasticSyncAt: string | null;
}
