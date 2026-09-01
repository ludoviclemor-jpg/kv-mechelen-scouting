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

/**
 * One (season, competition) row from SCOUTASTIC's own `performanceSummary`
 * — real, unreduced, never invented. `isInternational` uses the same
 * confirmed level_definition-based rule as
 * scripts/sync-international-callups.mjs (docs/INTERNATIONAL_CALLUPS.md).
 * A field is `null` only when SCOUTASTIC's row itself didn't include it —
 * a real zero (an unused squad player) is a confirmed value, not missing.
 */
export interface PerformanceSeasonRow {
  season: string; // year, e.g. "2025"
  competitionId: string | null;
  contest: string | null; // SCOUTASTIC's own competition display name for this row
  teamId: string | null;
  isInternational: boolean;
  level: string | null; // the competition's own age_category ("Senior", "U21", ...) — null if the competition isn't in our own catalog yet
  matchesPlayed: number | null;
  minutesPlayed: number | null;
  substitutes: number | null; // sub-appearance count
  goals: number | null;
  assists: number | null;
  ownGoals: number | null;
  yellow: number | null;
  red: number | null;
  yellowRed: number | null;
  cleanSheets: number | null; // only meaningful for GK/defenders
  opponentGoalsOnThePitch: number | null;
}

/** A real, dated market-value point (`marketValueHistory`) — see docs/PLAYER_PROFILE.md. */
export interface MarketValuePoint {
  value: number; // EUR
  date: string; // ISO date
}

/**
 * A real injury spell (`injuryHistory`, needs injuryData=true on the
 * crawl). `to` is `null` for an ongoing/unresolved injury — SCOUTASTIC
 * genuinely omits it in that case, not a mapping gap.
 */
export interface InjuryRecord {
  description: string;
  from: string; // ISO date
  to: string | null; // ISO date, or null if still ongoing as of the last sync
  season: string | null;
}

/**
 * The heavier, profile-only fields (`players.performance_seasons`,
 * `players.played_positions`, `players.market_value_history`,
 * `players.injury_history`, `players.youth_teams`) — deliberately kept
 * off the base `Player` type and out of `PLAYER_COLUMNS`
 * (src/lib/players-data/remote.ts) so every paginated list view (Players,
 * Debutants, Top Performers, ...) keeps fetching the same lightweight row
 * it always has. Fetched separately, only by the player-profile page —
 * see fetchPlayerPerformanceDetail().
 */
export interface PlayerPerformanceDetail {
  performanceSeasons: PerformanceSeasonRow[];
  playedPositions: Record<string, number> | null;
  marketValueHistory: MarketValuePoint[];
  injuryHistory: InjuryRecord[];
  youthTeams: string | null; // raw free-text (e.g. "AS Bondy (2004-2011), ...") — youth career only, no confirmed senior club-history source, see docs/PLAYER_PROFILE.md
}

/**
 * "pending"   — never attempted (the default for every player right now)
 * "matched"   — a confident SofaScore profile match was found
 * "ambiguous" — multiple plausible candidates, none confidently chosen —
 *               never auto-assigned, needs a human or a stronger provider
 * "not_found" — a provider was queried and genuinely found no match
 */
export type SofaScoreMatchStatus = "pending" | "matched" | "ambiguous" | "not_found";

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
  secondaryPositions: Position[] | null; // mapped from SCOUTASTIC's secondaryPosition1/secondaryPosition2 (confirmed real, see scripts/lib/fieldMap.mjs's normalizeSecondaryPositions) — null if the player has none

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

  appearances: number | null; // this season's *club* output only — see PerformanceSeasonRow for the full, unreduced history including international rows
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
  notes: ScoutingNotes;
  isYouthOrReserve: boolean; // false by construction: only senior competitions are crawled

  // --- Real, SCOUTASTIC-owned: computed from SCOUTASTIC's own `debuts`
  // data, cross-referenced against known senior European competitions
  // (see scripts/lib/fieldMap.mjs's detectDebut(), docs/SCOUTASTIC_SYNC.md). ---
  isDebutant: boolean;
  debutDate: string | null;

  // --- Ratings enrichment — historically named after SofaScore. No real
  // provider is connected as of 2026-08-31 (see docs/SOFASCORE_PROVIDER.md
  // for what's been investigated and ruled out) — every field below is
  // genuinely empty/pending for every player, not populated by an
  // approximation. SCOUTASTIC data above is never gated on any of this. ---
  sofascorePlayerId: string | null; // the configured provider's player id (not literally a SofaScore id)
  sofascoreMatchStatus: SofaScoreMatchStatus;
  sofascoreMatchConfidence: number | null; // 0-1, only meaningful once matched
  ratingsTeamId: string | null; // provider's current-team id for this player — avoids re-searching just to refresh ratings, for providers whose match-history lookup is team-centric
  lastSofaScoreSyncAt: string | null; // ISO datetime
  matches: MatchRating[]; // last 5 completed matches with ratings — always [] until matched
  ratingAverage: number | null; // stored aggregate of `matches` — computed once at sync time, not on every read
  ratingHighest: number | null;
  ratingLowest: number | null;
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
