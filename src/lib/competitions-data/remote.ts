import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { Competition } from "./types";

/**
 * Runtime, Postgres-backed competition data — same pattern as
 * src/lib/players-data/remote.ts (real server-side search/filter/
 * pagination, nothing pulls the whole table into the browser). Written by
 * scripts/sync-competitions.mjs (service_role, bypasses RLS); the frontend
 * only ever reads (`authenticated`-only SELECT, db/rls_policies.sql).
 */

interface CompetitionRow {
  competition_id: string;
  name: string | null;
  area: string | null;
  association: string | null;
  is_european: boolean;
  age_category: string | null;
  gender: string | null;
  is_active: boolean;
  level: number | null;
  level_definition: string | null;
  logo_url: string | null;
  available_seasons: string[];
  current_season: number | null;
  season_start_date: string | null;
  season_end_date: string | null;
  team_count: number;
  created_at: string;
  updated_at: string;
  last_scoutastic_sync_at: string | null;
}

const COMPETITION_COLUMNS =
  "competition_id,name,area,association,is_european,age_category,gender,is_active,level,level_definition," +
  "logo_url,available_seasons,current_season,season_start_date,season_end_date,team_count," +
  "created_at,updated_at,last_scoutastic_sync_at";

function competitionFromRow(row: CompetitionRow): Competition {
  return {
    id: row.competition_id,
    name: row.name,
    area: row.area,
    association: row.association,
    isEuropean: row.is_european,
    ageCategory: row.age_category,
    gender: row.gender,
    isActive: row.is_active,
    level: row.level,
    levelDefinition: row.level_definition,
    logoUrl: row.logo_url,
    availableSeasons: row.available_seasons ?? [],
    currentSeason: row.current_season,
    seasonStartDate: row.season_start_date,
    seasonEndDate: row.season_end_date,
    teamCount: row.team_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastScoutasticSyncAt: row.last_scoutastic_sync_at,
  };
}

function notConfigured(): never {
  throw new Error(
    "Supabase is not configured — competition data lives in Postgres, there is no static fallback. See docs/POSTGRES_PERSISTENCE.md."
  );
}

export interface CompetitionsQueryParams {
  search?: string;
  area?: string; // "all" or a country/region name
  levelDefinition?: string; // "all" or a SCOUTASTIC levelDefinition label
  activeOnly?: boolean;
  europeanOnly?: boolean; // default true — this feature's whole point, but kept overridable
  seniorMenOnly?: boolean; // default true — confirmed live (docs/COMPETITIONS.md): the raw UEFA set is 1,350 competitions, most of them youth (U17 etc.) or women's; 499 are actually Senior + male
}

/** Grouped by country for the /competitions page — bounded (a few hundred rows at the default Senior/male/European scope), fetched in full rather than paginated. */
export async function fetchCompetitions(params: CompetitionsQueryParams = {}): Promise<Competition[]> {
  if (!isSupabaseConfigured()) notConfigured();
  let q = getSupabaseClient().from("scoutastic_competitions").select(COMPETITION_COLUMNS);

  if (params.europeanOnly !== false) q = q.eq("is_european", true);
  if (params.seniorMenOnly !== false) q = q.eq("age_category", "Senior").eq("gender", "male");
  if (params.activeOnly) q = q.eq("is_active", true);
  if (params.area && params.area !== "all") q = q.eq("area", params.area);
  if (params.levelDefinition && params.levelDefinition !== "all") q = q.eq("level_definition", params.levelDefinition);

  const search = params.search?.trim();
  if (search) {
    const escaped = search.replace(/[%,()]/g, "");
    q = q.or(`name.ilike.%${escaped}%,area.ilike.%${escaped}%`);
  }

  const { data, error } = await q.order("area").order("level", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data as unknown as CompetitionRow[]).map(competitionFromRow);
}

export async function fetchCompetitionById(id: string): Promise<Competition | null> {
  if (!isSupabaseConfigured()) notConfigured();
  const { data, error } = await getSupabaseClient()
    .from("scoutastic_competitions")
    .select(COMPETITION_COLUMNS)
    .eq("competition_id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? competitionFromRow(data as unknown as CompetitionRow) : null;
}

/** Backs the Competitions page's country filter dropdown — reads the bounded `competition_countries` view (db/schema.sql). */
export async function fetchCompetitionCountries(): Promise<string[]> {
  if (!isSupabaseConfigured()) notConfigured();
  const { data, error } = await getSupabaseClient().from("competition_countries").select("value");
  if (error) throw error;
  return (data ?? []).map((r) => r.value as string);
}

export async function fetchRecentlyUpdatedCompetitions(limit = 5): Promise<Competition[]> {
  if (!isSupabaseConfigured()) notConfigured();
  const { data, error } = await getSupabaseClient()
    .from("scoutastic_competitions")
    .select(COMPETITION_COLUMNS)
    .eq("is_european", true)
    .eq("age_category", "Senior")
    .eq("gender", "male")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as unknown as CompetitionRow[]).map(competitionFromRow);
}

export interface CompetitionsSummary {
  totalEuropean: number;
  countriesCovered: number;
  activeEuropean: number;
  playersInEuropeanCompetitions: number;
}

/**
 * All `count: "exact", head: true` — no rows fetched just to count them,
 * same discipline as players-data/remote.ts. The "players in European
 * competitions" count needs the actual list of European competition ids
 * first — `players.competition_id` is a soft reference (no FK, by design,
 * see db/schema.sql), so PostgREST can't embed-filter through it directly;
 * this does it as two bounded queries instead of an inaccurate blanket count.
 */
export async function fetchCompetitionsSummary(): Promise<CompetitionsSummary> {
  if (!isSupabaseConfigured()) notConfigured();
  const db = getSupabaseClient();

  const [total, active, countries, europeanIdsRes] = await Promise.all([
    db
      .from("scoutastic_competitions")
      .select("competition_id", { count: "exact", head: true })
      .eq("is_european", true)
      .eq("age_category", "Senior")
      .eq("gender", "male"),
    db
      .from("scoutastic_competitions")
      .select("competition_id", { count: "exact", head: true })
      .eq("is_european", true)
      .eq("age_category", "Senior")
      .eq("gender", "male")
      .eq("is_active", true),
    db.from("competition_countries").select("value", { count: "exact", head: true }),
    db
      .from("scoutastic_competitions")
      .select("competition_id")
      .eq("is_european", true)
      .eq("age_category", "Senior")
      .eq("gender", "male"),
  ]);
  for (const res of [total, active, countries, europeanIdsRes]) {
    if (res.error) throw res.error;
  }

  const europeanIds = (europeanIdsRes.data ?? []).map((r) => r.competition_id as string);
  let playersInEuropeanCompetitions = 0;
  if (europeanIds.length > 0) {
    const playersRes = await db
      .from("players")
      .select("id", { count: "exact", head: true })
      .eq("active", true)
      .in("competition_id", europeanIds);
    if (playersRes.error) throw playersRes.error;
    playersInEuropeanCompetitions = playersRes.count ?? 0;
  }

  return {
    totalEuropean: total.count ?? 0,
    activeEuropean: active.count ?? 0,
    countriesCovered: countries.count ?? 0,
    playersInEuropeanCompetitions,
  };
}
