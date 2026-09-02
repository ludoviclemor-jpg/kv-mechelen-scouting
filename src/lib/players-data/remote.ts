import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import { ageRangeToDobRange, type AgeRange } from "@/lib/agePresets";
import { MINIMUM_RATED_MATCHES } from "./constants";
import type {
  InjuryRecord,
  MarketValuePoint,
  MatchRating,
  PerformanceSeasonRow,
  Player,
  PlayerPerformanceDetail,
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
  secondary_positions: Position[] | null;
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

/**
 * The heavier performance/position fields, fetched separately from
 * `fetchPlayerById` — see PlayerPerformanceDetail's own comment for why
 * these are kept off every paginated list view's query. Returns empty
 * (never null-vs-[] ambiguity) if the player has no such data yet — a
 * player not yet (re-)crawled since this field was added, for instance.
 */
export async function fetchPlayerPerformanceDetail(id: string): Promise<PlayerPerformanceDetail> {
  if (!isSupabaseConfigured()) notConfigured();
  const { data, error } = await getSupabaseClient()
    .from("players")
    .select("performance_seasons,played_positions,market_value_history,injury_history,youth_teams")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return {
    performanceSeasons: (data?.performance_seasons as unknown as PerformanceSeasonRow[]) ?? [],
    playedPositions: (data?.played_positions as unknown as Record<string, number> | null) ?? null,
    marketValueHistory: (data?.market_value_history as unknown as MarketValuePoint[]) ?? [],
    injuryHistory: (data?.injury_history as unknown as InjuryRecord[]) ?? [],
    youthTeams: (data?.youth_teams as string | null) ?? null,
  };
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
  competitionId?: string; // exact SCOUTASTIC competition id — used by the Competition detail page and the Country -> Competition -> Club cascade
  africanOnly?: boolean;
  ageRange?: AgeRange; // shared preset/custom-range system — see src/lib/agePresets.ts
  valueBand?: string;
  contractBand?: string;
  sortKey: PlayerSortKey;
  sortDirection: "asc" | "desc";
  page: number; // 1-based
  pageSize: number;
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

  const dobRange = ageRangeToDobRange(params.ageRange ?? { min: null, max: null }, today);
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

export interface CompetitionOption {
  id: string;
  name: string;
}

/**
 * Cascading Country -> Competition step. `country` is a value from
 * `player_leagues` (players.league — the competition's country, set at
 * sync time, see scripts/lib/fieldMap.mjs — a naming leftover, it's not
 * actually a competition name). Real competition names come from the
 * `player_competitions_in_country` Postgres function (db/schema.sql),
 * which joins against scoutastic_competitions and only returns
 * competitions that actually have synced players — never a dead-end
 * selection with zero results.
 */
export async function fetchCompetitionsInCountry(country: string): Promise<CompetitionOption[]> {
  if (!isSupabaseConfigured()) notConfigured();
  const { data, error } = await getSupabaseClient().rpc("player_competitions_in_country", { country });
  if (error) throw error;
  return (data ?? []).map((r: { competition_id: string; name: string | null }) => ({
    id: r.competition_id,
    name: r.name ?? r.competition_id,
  }));
}

/** Cascading Competition -> Club step — see fetchCompetitionsInCountry's reasoning; same function-over-view approach since this needs a parameter. */
export async function fetchClubsInCompetition(competitionId: string): Promise<string[]> {
  if (!isSupabaseConfigured()) notConfigured();
  const { data, error } = await getSupabaseClient().rpc("player_clubs_in_competition", { comp_id: competitionId });
  if (error) throw error;
  return (data ?? []).map((r: { club: string }) => r.club);
}

/**
 * Ratings, once a real provider exists, are only ever scoped to African
 * debutant candidates (see docs/SOFASCORE_PROVIDER.md — no provider is
 * connected today, so this returns nothing for now, not an
 * approximation), so this is inherently a small set worldwide, not a
 * slice of the full 165K+ catalog — safe to fetch in full and let the
 * page filter/sort it in the browser exactly as it always has.
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

/** Debut candidates are inherently rare (this season's debuts, African, worldwide) — safe to fetch in full. */
/**
 * African Debutants is U23-only by definition (see the page's own
 * description) — not merely the default filter, an eligibility rule.
 * Enforced here, server-side, via the same DOB-based U23 cutoff every
 * other U23 filter in the app uses (`agePresets.ts`'s U23 preset =
 * age <= 22), so a non-U23 debutant can never appear regardless of
 * whatever the page's own (further-narrowing) AgeFilter is set to.
 *
 * Worldwide scope (2026-09-02): previously restricted to
 * `is_eastern_european_league` (an initial, narrower product decision);
 * that filter is intentionally no longer applied here — every African
 * U23 debutant across every crawled league/country now qualifies.
 */
const U23_RANGE: AgeRange = { min: null, max: 22 };

export async function fetchAfricanDebutants(limit = 500): Promise<Player[]> {
  if (!isSupabaseConfigured()) notConfigured();
  const { gt: dobAfter } = ageRangeToDobRange(U23_RANGE);
  let query = getSupabaseClient()
    .from("players")
    .select(PLAYER_COLUMNS)
    .eq("active", true)
    .eq("is_debutant", true)
    .eq("is_african", true)
    .eq("is_youth_or_reserve", false);
  if (dobAfter) query = query.gt("date_of_birth", dobAfter);
  const { data, error } = await query.order("debut_date", { ascending: false, nullsFirst: false }).limit(limit);
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

/**
 * Priority-status players for the dashboard's "Shortlist / Priority
 * Players" widget (item 21). Status is read from `player_scouting_state`
 * (the persisted store — see fetchScoutingOverview below for the same
 * pattern) rather than the local app-store override layer, since this
 * runs outside any component that could apply that override; most
 * recently marked priority first.
 */
export async function fetchPriorityPlayers(limit = 6): Promise<Player[]> {
  if (!isSupabaseConfigured()) notConfigured();
  const db = getSupabaseClient();
  const { data: stateRows, error: stateError } = await db
    .from("player_scouting_state")
    .select("scoutastic_player_id")
    .eq("status", "priority")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (stateError) throw stateError;
  if (!stateRows || stateRows.length === 0) return [];

  const ids = stateRows.map((r) => `sc-${r.scoutastic_player_id}`);
  const players = await fetchPlayersByIds(ids);
  // Preserve the priority-recency order — fetchPlayersByIds doesn't guarantee row order for an `.in()` query.
  const byId = new Map(players.map((p) => [p.id, p]));
  return ids.map((id) => byId.get(id)).filter((p): p is Player => p !== undefined);
}

export const LOAN_WATCH_DEFAULT_MAX_MINUTES = 450; // roughly five full matches — a rough, adjustable heuristic, not a rule; see docs/LOAN_WATCH.md

/**
 * Real, genuine league-tier `level_definition` values, confirmed live
 * against scoutastic_competitions — deliberately excludes "Domestic
 * Cup"/"Further Cup"/etc. (a cup context tells us nothing about a
 * player's actual league level — confirmed live: ~1/3 of an unfiltered
 * Loan Watch pool came from cup-context rows) and "Youth league" (a real
 * gap found the same way: `players.is_youth_or_reserve` is always
 * `false` regardless of reality — see docs/SCOUTASTIC_SYNC.md's "known
 * gap" — so youth-league players were leaking through despite that
 * filter). See docs/LOAN_WATCH.md.
 */
const LEAGUE_TIER_DEFINITIONS = ["First Tier", "Second Tier", "Third Tier", "Fourth Tier", "Fifth Tier", "Sixth Tier"];

/**
 * Competition ids for genuine league tiers at or above `maxLevel`
 * (1 = top division). No FK exists between `players.competition_id` and
 * `scoutastic_competitions` (a soft reference — see db/schema.sql's
 * header), so this can't be a single joined query; fetching the id list
 * first (confirmed live: 139-354 ids depending on maxLevel, well within
 * a safe `.in()` size) and filtering players by it is the same
 * two-step pattern already used for cascading Country/Competition/Club
 * filters elsewhere in this file.
 */
async function fetchProfessionalCompetitionIds(maxLevel: number): Promise<string[]> {
  const { data, error } = await getSupabaseClient()
    .from("scoutastic_competitions")
    .select("competition_id")
    .in("level_definition", LEAGUE_TIER_DEFINITIONS)
    .lte("level", maxLevel)
    .eq("is_active", true);
  if (error) throw error;
  return data.map((r) => r.competition_id as string);
}

/**
 * Loan Watch's "League Group" filter — real country names confirmed
 * live against `players.league` (see docs/LOAN_WATCH.md), not guessed.
 * "Benelux" is Belgium + Netherlands only (Luxembourg's clubs are
 * genuinely amateur-tier in SCOUTASTIC's data, not part of what a scout
 * means by this grouping); "Scandinavia" is the strict sense (Norway,
 * Sweden, Denmark) — Finland/Iceland are Nordic but not Scandinavian,
 * so deliberately left out rather than assumed included.
 */
export const LOAN_WATCH_LEAGUE_GROUPS: Record<string, string[]> = {
  top5: ["England", "Spain", "Germany", "Italy", "France"],
  benelux: ["Belgium", "Netherlands"],
  scandinavia: ["Norway", "Sweden", "Denmark"],
};
const ALL_GROUPED_COUNTRIES = Object.values(LOAN_WATCH_LEAGUE_GROUPS).flat();

/**
 * "Limited Game Time" — the real, data-backed half of "possible loan
 * candidates" (see docs/LOAN_WATCH.md for why this exists and what it
 * deliberately does NOT claim to detect).
 *
 * Real bug found and fixed while building this: an early version filtered
 * the *entire* 177k-row table on `minutes <= threshold` with an exact
 * count for pagination — confirmed live to either time out or take 8+
 * seconds, because "under 450 minutes" genuinely matches ~140k players
 * (most of SCOUTASTIC's crawled scope is semi-pro/amateur-tier clubs with
 * minimal recorded minutes, not a small "flagged" set). Fetching a
 * *bounded* set instead (`limit`, ordered by minutes ascending, server
 * side) and letting the page filter/narrow client-side is the same
 * pattern already used for Top Performers/African Debutants
 * (`fetchTopPerformers`, `fetchAfricanDebutants` above) — no numbered
 * pagination or exact count needed. `appearances > 0` is required so this
 * surfaces players who *have* featured but rarely, not players with no
 * recorded matches at all (more likely a data gap than a real signal).
 */
export interface LoanWatchQueryParams {
  maxMinutes?: number;
  position?: string;
  nationality?: string;
  league?: string; // country — same convention as fetchPlayersPage
  competitionId?: string;
  club?: string;
  ageRange?: AgeRange;
  valueBand?: string;
  /** 1 = top division only, 2 = top two tiers, etc. `null`/omitted = no tier restriction. See fetchProfessionalCompetitionIds. */
  maxTierLevel?: number | null;
  /** "top5" | "benelux" | "scandinavia" | "others" | "all"/omitted. See LOAN_WATCH_LEAGUE_GROUPS. Independent of `league` — both can be set at once, same as any other two filters. */
  leagueGroup?: string;
  limit?: number;
}

/**
 * All filters applied server-side, same convention as fetchPlayersPage —
 * important here specifically because the result is a *capped* set
 * (ordered by minutes ascending, `limit`): filtering client-side after
 * the cap would silently miss real matches outside whatever happened to
 * be the 300 lowest-minutes players overall, e.g. a Country filter could
 * come back empty even when real matches exist further down the
 * minutes-ordered list.
 */
export async function fetchLoanWatchCandidates(options: LoanWatchQueryParams = {}): Promise<Player[]> {
  if (!isSupabaseConfigured()) notConfigured();
  const maxMinutes = options.maxMinutes ?? LOAN_WATCH_DEFAULT_MAX_MINUTES;
  let query = getSupabaseClient()
    .from("players")
    .select(PLAYER_COLUMNS)
    .eq("active", true)
    .eq("is_youth_or_reserve", false)
    .gt("appearances", 0)
    .lte("minutes", maxMinutes);

  if (options.position && options.position !== "all") query = query.eq("position", options.position);
  if (options.nationality && options.nationality !== "all") query = query.eq("nationality", options.nationality);
  if (options.league && options.league !== "all") query = query.eq("league", options.league);
  if (options.leagueGroup && options.leagueGroup !== "all") {
    if (options.leagueGroup === "others") {
      query = query.not("league", "in", `(${ALL_GROUPED_COUNTRIES.join(",")})`);
    } else {
      const countries = LOAN_WATCH_LEAGUE_GROUPS[options.leagueGroup];
      if (countries) query = query.in("league", countries);
    }
  }
  if (options.competitionId && options.competitionId !== "all") query = query.eq("competition_id", options.competitionId);
  if (options.club && options.club !== "all") query = query.eq("club", options.club);
  if (options.ageRange) {
    const { gt, lte } = ageRangeToDobRange(options.ageRange);
    if (gt) query = query.gt("date_of_birth", gt);
    if (lte) query = query.lte("date_of_birth", lte);
  }
  const { gte: valueGte, lt: valueLt } = valueBandToRange(options.valueBand);
  if (valueGte !== undefined) query = query.gte("market_value_eur", valueGte);
  if (valueLt !== undefined) query = query.lt("market_value_eur", valueLt);

  if (options.maxTierLevel != null) {
    const professionalCompetitionIds = await fetchProfessionalCompetitionIds(options.maxTierLevel);
    // An empty list would make `.in()` match nothing at all (correct
    // behavior — no professional competitions found for this tier — but
    // Supabase's query builder needs at least one id to build a valid
    // `.in()` clause), so short-circuit to an empty result instead.
    if (professionalCompetitionIds.length === 0) return [];
    query = query.in("competition_id", professionalCompetitionIds);
  }

  const { data, error } = await query.order("minutes", { ascending: true }).limit(options.limit ?? 300);
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

  // `total`/`fresh` scan the *entire* players table (177k+ rows, growing) —
  // `active` alone matches essentially every row (no deactivation logic
  // exists yet, see docs/SCOUTASTIC_SYNC.md's "known gap"), and after a
  // large crawl most of the table can genuinely have a recent
  // `created_at` too, so neither filter is actually selective. An exact
  // COUNT(*) here confirmed live to take 5-9+ seconds and intermittently
  // error outright even after VACUUM ANALYZE — this is what surfaced as
  // "Dashboard error says can't load data" for real. `count: "planned"`
  // uses Postgres's own fast statistics-based row estimate instead of a
  // real scan — perfectly fine for a rough dashboard KPI tile, and
  // consistently fast regardless of table size.
  const [total, fresh, debutants, monitored, shortlists] = await Promise.all([
    db.from("players").select("id", { count: "planned", head: true }).eq("active", true),
    db
      .from("players")
      .select("id", { count: "planned", head: true })
      .eq("active", true)
      .gte("created_at", fourteenDaysAgo.toISOString()),
    db
      .from("players")
      .select("id", { count: "exact", head: true })
      .eq("active", true)
      .eq("is_debutant", true)
      .eq("is_african", true)
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
