import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import { MINIMUM_RATED_MATCHES } from "./constants";
import type {
  MatchRating,
  Player,
  PlayerTeam,
  Position,
  PreferredFoot,
  SofaScoreMatchStatus,
  SyncMeta,
  SyncStatus,
} from "./types";

/**
 * Runtime, Postgres-backed player data — replaces the old build-time
 * `data/players.json` import once the SCOUTASTIC catalog outgrew "small
 * enough to commit as a static file and pre-render one page per player"
 * (see db/schema.sql's header and docs/SCOUTASTIC_SYNC.md). Every function
 * here queries Supabase directly; nothing pulls the whole `players` table
 * into memory — see each function's own bound (a `.limit()`, an
 * inherently small filter, or real server-side pagination).
 *
 * Player and sync data is read-only past the sync script (service_role,
 * bypasses RLS) — RLS grants `authenticated` SELECT only (db/rls_policies.sql).
 */

// Raw shape of a `players` row exactly as Postgres returns it (snake_case).
interface PlayerRow {
  id: string;
  scoutastic_player_id: string;
  source: "SCOUTASTIC";
  first_name: string | null;
  last_name: string | null;
  name: string;
  photo_url: string | null;
  date_of_birth: string | null;
  nationality: string | null;
  second_nationality: string | null;
  is_african: boolean;
  position: Position | null;
  position_raw: string | null;
  secondary_positions: string[] | null;
  club: string | null;
  previous_club: string | null;
  teams: PlayerTeam[];
  league: string | null;
  league_country: string | null;
  competition_id: string | null;
  is_eastern_european_league: boolean;
  height_cm: number | null;
  preferred_foot: PreferredFoot | null;
  agent: string | null;
  market_value_eur: number | null;
  contract_expiry: string | null;
  appearances: number | null;
  minutes: number | null;
  goals: number | null;
  assists: number | null;
  created_at: string;
  updated_at: string;
  last_synced_at: string;
  active: boolean;
  is_youth_or_reserve: boolean;
  sofascore_player_id: string | null;
  sofascore_match_status: SofaScoreMatchStatus;
  sofascore_match_confidence: number | null;
  ratings_team_id: string | null;
  last_sofascore_sync_at: string | null;
  matches: MatchRating[];
  rated_matches_count: number;
  is_debutant: boolean;
  debut_date: string | null;
  rating_average: number | null;
  rating_highest: number | null;
  rating_lowest: number | null;
}

const PLAYER_COLUMNS =
  "id,scoutastic_player_id,source,first_name,last_name,name,photo_url,date_of_birth," +
  "nationality,second_nationality,is_african,position,position_raw,secondary_positions," +
  "club,previous_club,teams,league,league_country,competition_id,is_eastern_european_league," +
  "height_cm,preferred_foot,agent,market_value_eur,contract_expiry,appearances,minutes,goals,assists," +
  "created_at,updated_at,last_synced_at,active,is_youth_or_reserve,sofascore_player_id," +
  "sofascore_match_status,sofascore_match_confidence,ratings_team_id,last_sofascore_sync_at," +
  "matches,rated_matches_count,is_debutant,debut_date,rating_average,rating_highest,rating_lowest";

function playerFromRow(row: PlayerRow): Player {
  return {
    id: row.id,
    scoutasticPlayerId: row.scoutastic_player_id,
    source: row.source,

    firstName: row.first_name,
    lastName: row.last_name,
    name: row.name,
    photoUrl: row.photo_url,

    dateOfBirth: row.date_of_birth,
    nationality: row.nationality,
    secondNationality: row.second_nationality,
    isAfrican: row.is_african,

    position: row.position,
    positionRaw: row.position_raw,
    secondaryPositions: row.secondary_positions,

    club: row.club,
    previousClub: row.previous_club,
    teams: row.teams ?? [],

    league: row.league,
    leagueCountry: row.league_country,
    competitionId: row.competition_id,
    isEasternEuropeanLeague: row.is_eastern_european_league,

    heightCm: row.height_cm,
    preferredFoot: row.preferred_foot,
    agent: row.agent,
    marketValueEUR: row.market_value_eur,
    contractExpiry: row.contract_expiry,

    appearances: row.appearances,
    minutes: row.minutes,
    goals: row.goals,
    assists: row.assists,

    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSyncedAt: row.last_synced_at,
    active: row.active,

    // Scouting workflow state lives in Postgres `player_scouting_state`
    // (src/lib/persistence/), never on the player row itself — these are
    // just the pre-any-assessment defaults; useEffectiveStatus/
    // useEffectiveNotes always layer the real persisted value on top.
    status: "not_assessed",
    addedDate: row.created_at.slice(0, 10),
    notes: { strengths: "", weaknesses: "", recommendation: "", general: "" },
    isYouthOrReserve: row.is_youth_or_reserve,

    sofascorePlayerId: row.sofascore_player_id,
    sofascoreMatchStatus: row.sofascore_match_status,
    sofascoreMatchConfidence: row.sofascore_match_confidence,
    ratingsTeamId: row.ratings_team_id,
    lastSofaScoreSyncAt: row.last_sofascore_sync_at,
    matches: row.matches ?? [],
    isDebutant: row.is_debutant,
    debutDate: row.debut_date,
    ratingAverage: row.rating_average,
    ratingHighest: row.rating_highest,
    ratingLowest: row.rating_lowest,
  };
}

/** Every function below returns this on an unconfigured Supabase project — never fabricated data. */
function notConfigured(): never {
  throw new Error(
    "Supabase is not configured — the player database lives in Postgres now, there is no static fallback. See docs/POSTGRES_PERSISTENCE.md."
  );
}

export async function fetchPlayerById(id: string): Promise<Player | null> {
  if (!isSupabaseConfigured()) notConfigured();
  const { data, error } = await getSupabaseClient()
    .from("players")
    .select(PLAYER_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? playerFromRow(data as unknown as PlayerRow) : null;
}

/** Bounded by `ids.length` — used for shortlist members and scouting-report rows, never the whole table. */
export async function fetchPlayersByIds(ids: string[]): Promise<Player[]> {
  if (ids.length === 0) return [];
  if (!isSupabaseConfigured()) notConfigured();
  const { data, error } = await getSupabaseClient()
    .from("players")
    .select(PLAYER_COLUMNS)
    .in("id", ids);
  if (error) throw error;
  return (data as unknown as PlayerRow[]).map(playerFromRow);
}

/** Live search-as-you-type, e.g. "add a player to this shortlist" — always capped by `limit`. */
export async function searchPlayers(
  query: string,
  { excludeIds = [], limit = 6 }: { excludeIds?: string[]; limit?: number } = {}
): Promise<Player[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  if (!isSupabaseConfigured()) notConfigured();
  const escaped = trimmed.replace(/[%,()]/g, "");
  let q = getSupabaseClient()
    .from("players")
    .select(PLAYER_COLUMNS)
    .eq("active", true)
    .or(`name.ilike.%${escaped}%,club.ilike.%${escaped}%`);
  if (excludeIds.length > 0) q = q.not("id", "in", `(${excludeIds.join(",")})`);
  const { data, error } = await q.order("name").limit(limit);
  if (error) throw error;
  return (data as unknown as PlayerRow[]).map(playerFromRow);
}

export type PlayerSortKey =
  | "name"
  | "age"
  | "position"
  | "nationality"
  | "club"
  | "league"
  | "marketValueEUR"
  | "contractExpiry";

const SORT_COLUMN: Record<PlayerSortKey, string> = {
  name: "name",
  age: "date_of_birth",
  position: "position",
  nationality: "nationality",
  club: "club",
  league: "league",
  marketValueEUR: "market_value_eur",
  contractExpiry: "contract_expiry",
};

export interface PlayersQueryParams {
  search?: string;
  position?: string; // "all" or a Position
  nationality?: string;
  league?: string;
  club?: string;
  competitionId?: string; // exact SCOUTASTIC competition id — used by the Competition detail page
  africanOnly?: boolean;
  ageBand?: string;
  valueBand?: string;
  contractBand?: string;
  sortKey: PlayerSortKey;
  sortDirection: "asc" | "desc";
  page: number; // 1-based
  pageSize: number;
}

/** `today` is injected (not `new Date()`) so age-band math is deterministic and testable. */
function ageBandToDobRange(band: string | undefined, today: Date): { gt?: string; lte?: string } {
  if (!band || band === "all") return {};
  const minus = (years: number) => {
    const d = new Date(today);
    d.setFullYear(d.getFullYear() - years);
    return d.toISOString().slice(0, 10);
  };
  // age >= N  <=>  dob <= today-N-years ; age <= N  <=>  dob > today-(N+1)-years
  switch (band) {
    case "u21":
      return { gt: minus(21) };
    case "21-23":
      return { lte: minus(21), gt: minus(24) };
    case "24-26":
      return { lte: minus(24), gt: minus(27) };
    case "27-29":
      return { lte: minus(27), gt: minus(30) };
    case "30+":
      return { lte: minus(30) };
    default:
      return {};
  }
}

function valueBandToRange(band: string | undefined): { gte?: number; lt?: number } {
  switch (band) {
    case "u1":
      return { lt: 1_000_000 };
    case "1-3":
      return { gte: 1_000_000, lt: 3_000_000 };
    case "3-6":
      return { gte: 3_000_000, lt: 6_000_000 };
    case "6+":
      return { gte: 6_000_000 };
    default:
      return {};
  }
}

function contractBandToRange(band: string | undefined): { gte?: string; lt?: string } {
  switch (band) {
    case "2026":
      return { gte: "2026-01-01", lt: "2027-01-01" };
    case "2027":
      return { gte: "2027-01-01", lt: "2028-01-01" };
    case "2028":
      return { gte: "2028-01-01", lt: "2029-01-01" };
    case "2029+":
      return { gte: "2029-01-01" };
    default:
      return {};
  }
}

/** Real server-side search + filter + sort + pagination — the Players list page's data source. */
export async function fetchPlayersPage(
  params: PlayersQueryParams,
  today = new Date()
): Promise<{ players: Player[]; total: number }> {
  if (!isSupabaseConfigured()) notConfigured();

  let q = getSupabaseClient()
    .from("players")
    .select(PLAYER_COLUMNS, { count: "exact" })
    .eq("active", true);

  const search = params.search?.trim();
  if (search) {
    const escaped = search.replace(/[%,()]/g, "");
    q = q.or(`name.ilike.%${escaped}%,club.ilike.%${escaped}%,nationality.ilike.%${escaped}%`);
  }
  if (params.position && params.position !== "all") q = q.eq("position", params.position);
  if (params.nationality && params.nationality !== "all") q = q.eq("nationality", params.nationality);
  if (params.league && params.league !== "all") q = q.eq("league", params.league);
  if (params.club && params.club !== "all") q = q.eq("club", params.club);
  if (params.competitionId) q = q.eq("competition_id", params.competitionId);
  if (params.africanOnly) q = q.eq("is_african", true);

  const dobRange = ageBandToDobRange(params.ageBand, today);
  if (dobRange.gt) q = q.gt("date_of_birth", dobRange.gt);
  if (dobRange.lte) q = q.lte("date_of_birth", dobRange.lte);

  const valueRange = valueBandToRange(params.valueBand);
  if (valueRange.gte !== undefined) q = q.gte("market_value_eur", valueRange.gte);
  if (valueRange.lt !== undefined) q = q.lt("market_value_eur", valueRange.lt);

  const contractRange = contractBandToRange(params.contractBand);
  if (contractRange.gte) q = q.gte("contract_expiry", contractRange.gte);
  if (contractRange.lt) q = q.lt("contract_expiry", contractRange.lt);

  const column = SORT_COLUMN[params.sortKey];
  const ascending = params.sortKey === "age" ? params.sortDirection === "desc" : params.sortDirection === "asc";
  q = q.order(column, { ascending, nullsFirst: false });

  const from = (params.page - 1) * params.pageSize;
  const to = from + params.pageSize - 1;
  q = q.range(from, to);

  const { data, error, count } = await q;
  if (error) throw error;
  return { players: (data as unknown as PlayerRow[]).map(playerFromRow), total: count ?? 0 };
}

export interface FilterOptions {
  nationalities: string[];
  leagues: string[];
  clubs: string[];
}

/** Backs the Players page filter dropdowns — reads the bounded `player_*` views (db/schema.sql). */
export async function fetchFilterOptions(): Promise<FilterOptions> {
  if (!isSupabaseConfigured()) notConfigured();
  const db = getSupabaseClient();
  const [nationalities, leagues, clubs] = await Promise.all([
    db.from("player_nationalities").select("value"),
    db.from("player_leagues").select("value"),
    db.from("player_clubs").select("value"),
  ]);
  if (nationalities.error) throw nationalities.error;
  if (leagues.error) throw leagues.error;
  if (clubs.error) throw clubs.error;
  return {
    nationalities: (nationalities.data ?? []).map((r) => r.value as string),
    leagues: (leagues.data ?? []).map((r) => r.value as string),
    clubs: (clubs.data ?? []).map((r) => r.value as string),
  };
}

/**
 * Ratings are only ever populated for the API-Football-scoped subset
 * (African debutant candidates — see docs/SOFASCORE_PROVIDER.md), so this
 * is inherently a small set worldwide, not a slice of the full 400K+
 * catalog — safe to fetch in full and let the page filter/sort it in the
 * browser exactly as it always has.
 */
export async function fetchTopPerformers(limit = 200): Promise<Player[]> {
  if (!isSupabaseConfigured()) notConfigured();
  const { data, error } = await getSupabaseClient()
    .from("players")
    .select(PLAYER_COLUMNS)
    .eq("active", true)
    .gte("rated_matches_count", MINIMUM_RATED_MATCHES)
    .order("rating_average", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return (data as unknown as PlayerRow[]).map(playerFromRow);
}

/** Debut candidates are inherently rare (this season's debuts, African, Eastern European leagues only) — safe to fetch in full. */
export async function fetchAfricanDebutants(limit = 500): Promise<Player[]> {
  if (!isSupabaseConfigured()) notConfigured();
  const { data, error } = await getSupabaseClient()
    .from("players")
    .select(PLAYER_COLUMNS)
    .eq("active", true)
    .eq("is_debutant", true)
    .eq("is_african", true)
    .eq("is_eastern_european_league", true)
    .eq("is_youth_or_reserve", false)
    .order("debut_date", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return (data as unknown as PlayerRow[]).map(playerFromRow);
}

export async function fetchRecentlyAdded(limit = 8): Promise<Player[]> {
  if (!isSupabaseConfigured()) notConfigured();
  const { data, error } = await getSupabaseClient()
    .from("players")
    .select(PLAYER_COLUMNS)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as unknown as PlayerRow[]).map(playerFromRow);
}

export interface ScoutingOverview {
  totalPlayers: number;
  newPlayers: number;
  africanDebutants: number;
  playersMonitored: number;
  shortlists: number;
}

/** Every number here is a `count: "exact", head: true` query — no rows are ever fetched just to count them. */
export async function fetchScoutingOverview(referenceDateISO: string): Promise<ScoutingOverview> {
  if (!isSupabaseConfigured()) notConfigured();
  const db = getSupabaseClient();
  const fourteenDaysAgo = new Date(referenceDateISO);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const [total, fresh, debutants, monitored, shortlists] = await Promise.all([
    db.from("players").select("id", { count: "exact", head: true }).eq("active", true),
    db
      .from("players")
      .select("id", { count: "exact", head: true })
      .eq("active", true)
      .gte("created_at", fourteenDaysAgo.toISOString()),
    db
      .from("players")
      .select("id", { count: "exact", head: true })
      .eq("active", true)
      .eq("is_debutant", true)
      .eq("is_african", true)
      .eq("is_eastern_european_league", true)
      .eq("is_youth_or_reserve", false),
    db
      .from("player_scouting_state")
      .select("scoutastic_player_id", { count: "exact", head: true })
      .in("status", ["monitoring", "interested", "priority"]),
    db.from("shortlists").select("id", { count: "exact", head: true }),
  ]);
  for (const res of [total, fresh, debutants, monitored, shortlists]) {
    if (res.error) throw res.error;
  }

  return {
    totalPlayers: total.count ?? 0,
    newPlayers: fresh.count ?? 0,
    africanDebutants: debutants.count ?? 0,
    playersMonitored: monitored.count ?? 0,
    shortlists: shortlists.count ?? 0,
  };
}

interface SyncMetaRow {
  source: "SCOUTASTIC";
  last_synced_at: string | null;
  last_sync_status: SyncStatus;
  last_sync_summary: SyncMeta["lastSyncSummary"];
  players_count: number;
  active_players_count: number;
}

const EMPTY_SYNC_META: SyncMeta = {
  source: "SCOUTASTIC",
  lastSyncedAt: null,
  lastSyncStatus: "never_run",
  lastSyncSummary: null,
  playersCount: 0,
  activePlayersCount: 0,
};

/** Never throws — an unconfigured Supabase project or a missing row both just mean "no sync has run yet". */
export async function fetchSyncMeta(): Promise<SyncMeta> {
  if (!isSupabaseConfigured()) return EMPTY_SYNC_META;
  const { data, error } = await getSupabaseClient()
    .from("sync_meta")
    .select("*")
    .eq("source", "SCOUTASTIC")
    .maybeSingle();
  if (error) throw error;
  if (!data) return EMPTY_SYNC_META;
  const row = data as unknown as SyncMetaRow;
  return {
    source: row.source,
    lastSyncedAt: row.last_synced_at,
    lastSyncStatus: row.last_sync_status,
    lastSyncSummary: row.last_sync_summary,
    playersCount: row.players_count,
    activePlayersCount: row.active_players_count,
  };
}
