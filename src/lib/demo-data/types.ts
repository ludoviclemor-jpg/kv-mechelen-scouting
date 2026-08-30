/**
 * Core scouting data model.
 *
 * This shape is the contract the future integrations must fill:
 *   SCOUTASTIC   -> Player profile, competition & club metadata (Phase 2)
 *   SofaScore    -> MatchRating[], live ratings, trend data     (Phase 4)
 *   PostgreSQL   -> persistence for Shortlist, ScoutingNotes,
 *                   ScoutingStatus overrides                    (Phase 3)
 *
 * Every field below is consumed by real UI today using demo records
 * (see `players.ts`). Swapping the demo array for a fetch from the
 * future backend should require no changes to components.
 */

export type Position =
  | "GK"
  | "CB"
  | "RB"
  | "LB"
  | "DM"
  | "CM"
  | "AM"
  | "RW"
  | "LW"
  | "ST";

export type PreferredFoot = "Left" | "Right" | "Both";

export type ScoutingStatus =
  | "not_assessed"
  | "monitoring"
  | "interested"
  | "priority"
  | "rejected";

export interface MatchRating {
  date: string; // ISO date
  competition: string;
  opponent: string;
  result: string; // e.g. "2-1 W"
  minutes: number;
  starter: boolean;
  rating: number | null; // null = no SofaScore rating available for this match
}

export interface ScoutingNotes {
  strengths: string;
  weaknesses: string;
  recommendation: string;
  general: string;
}

export interface Player {
  id: string;
  name: string;
  photoUrl: string | null;
  dateOfBirth: string; // ISO date
  nationality: string;
  isAfrican: boolean;
  position: Position;
  club: string;
  league: string;
  leagueCountry: string;
  isEasternEuropeanLeague: boolean;
  heightCm: number;
  preferredFoot: PreferredFoot;
  marketValueEUR: number;
  contractExpiry: string; // ISO date
  status: ScoutingStatus;
  addedDate: string; // ISO date, when the player entered the database
  matches: MatchRating[]; // most recent first
  notes: ScoutingNotes;
  isDebutant: boolean;
  debutDate: string | null;
  isYouthOrReserve: boolean;
}

export interface Shortlist {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  playerIds: string[];
}

export interface PlayerMatchStats {
  average: number | null;
  latest: number | null;
  highest: number | null;
  lowest: number | null;
  averageMinutes: number | null;
  matchesUsed: number;
}
