/**
 * Core scouting data model.
 *
 * Player records are sourced from the SCOUTASTIC API (Phase 2, see
 * `scripts/sync-scoutastic.mjs` and `src/lib/scoutastic/`) and stored in
 * `data/players.json`, which `players.ts` reads at build time.
 *
 * SCOUTASTIC does not provide every field below for every player — fields
 * it doesn't return are `null`, never invented. Components must handle
 * `null` (render "Unknown"/"—", never a fabricated value).
 *
 * Still pending later phases:
 *   SofaScore    -> MatchRating[], live ratings, trend data, debut detection (Phase 4)
 *   PostgreSQL   -> persistence for Shortlist, ScoutingNotes,
 *                   ScoutingStatus overrides                                (Phase 3)
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
  | "ST"
  | "OTHER"; // SCOUTASTIC returned a position code we don't have a mapping for yet

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

export interface PlayerTeam {
  name: string;
  isMain: boolean;
}

export type PlayerSource = "SCOUTASTIC";

export interface Player {
  id: string; // stable internal id, derived from scoutasticPlayerId
  scoutasticPlayerId: string; // external/source id, preserved exactly as returned
  source: PlayerSource;

  firstName: string | null;
  lastName: string | null;
  name: string; // full name — firstName + lastName, or a fallback if both are missing
  photoUrl: string | null; // not present in any confirmed SCOUTASTIC response yet

  dateOfBirth: string | null; // ISO date
  nationality: string | null;
  secondNationality: string | null;
  isAfrican: boolean; // derived from nationality/secondNationality

  position: Position | null; // mapped from SCOUTASTIC's mainPosition
  positionRaw: string | null; // the untouched raw code, kept for auditing unmapped values
  secondaryPositions: string[] | null; // not present in any confirmed SCOUTASTIC response yet

  club: string | null; // main team (teams[] entry with isMain === true)
  previousClub: string | null; // not present in any confirmed SCOUTASTIC response yet
  teams: PlayerTeam[];

  league: string | null; // the competition we discovered this player through
  leagueCountry: string | null;
  competitionId: string | null; // SCOUTASTIC/TransferMarkt competition code
  isEasternEuropeanLeague: boolean;

  heightCm: number | null;
  preferredFoot: PreferredFoot | null;
  agent: string | null;
  marketValueEUR: number | null;
  contractExpiry: string | null; // ISO date

  appearances: number | null; // pending performance-data field verification (Phase 2 follow-up)
  minutes: number | null;
  goals: number | null;
  assists: number | null;

  createdAt: string; // ISO datetime, first time this player was synced
  updatedAt: string; // ISO datetime, last time this player's data changed
  lastSyncedAt: string; // ISO datetime, last time a sync run saw this player
  active: boolean; // false once a sync stops returning this player (never deleted outright)

  // --- local scouting workflow state (not from SCOUTASTIC) ---
  status: ScoutingStatus;
  addedDate: string; // ISO date, alias of createdAt for existing UI
  matches: MatchRating[]; // SofaScore ratings — always [] until Phase 4
  notes: ScoutingNotes;
  isDebutant: boolean; // debut detection needs SofaScore — always false until Phase 4
  debutDate: string | null;
  isYouthOrReserve: boolean; // false by construction: only senior competitions are crawled
}

export interface Shortlist {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  playerIds: string[];
}

export type SyncStatus = "never_run" | "success" | "partial" | "failed";

export interface SyncSummary {
  competitionsAttempted: number;
  competitionsSucceeded: number;
  competitionsFailed: string[];
  playersRetrieved: number;
  playersCreated: number;
  playersUpdated: number;
  playersUnchanged: number;
  playersFailed: number;
  playersDeactivated: number;
  durationSeconds: number;
}

export interface SyncMeta {
  source: PlayerSource;
  lastSyncedAt: string | null;
  lastSyncStatus: SyncStatus;
  lastSyncSummary: SyncSummary | null;
  playersCount: number;
  activePlayersCount: number;
}

export interface PlayerMatchStats {
  average: number | null;
  latest: number | null;
  highest: number | null;
  lowest: number | null;
  averageMinutes: number | null;
  matchesUsed: number;
}
