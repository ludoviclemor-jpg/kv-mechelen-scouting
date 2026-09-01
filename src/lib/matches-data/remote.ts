import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { Match, MatchEvent, MatchLineupPlayer, MatchSummary } from "./types";

/**
 * Runtime, Postgres-backed match data — same pattern as players-data/
 * competitions-data (real server-side filtering where it matters, small
 * bounded sets fetched in full and filtered client-side otherwise).
 * Written by scripts/sync-matches.mjs (service_role, bypasses RLS); the
 * frontend only ever reads (`authenticated`-only SELECT, db/rls_policies.sql).
 */

interface MatchRow {
  id: string;
  competition_id: string | null;
  season: string | null;
  matchday: number | null;
  date: string | null;
  status: string | null;
  score: string | null;
  score_home: number | null;
  score_away: number | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_team_name: string | null;
  away_team_name: string | null;
  home_team_tactic: string | null;
  away_team_tactic: string | null;
  venue_name: string | null;
  venue_city: string | null;
  venue_area: string | null;
  referee_name: string | null;
  home_team_players: unknown;
  away_team_players: unknown;
  events: unknown;
  created_at: string;
  updated_at: string;
  last_scoutastic_sync_at: string | null;
}

const MATCH_COLUMNS =
  "id,competition_id,season,matchday,date,status,score,score_home,score_away,home_team_id,away_team_id," +
  "home_team_name,away_team_name,home_team_tactic,away_team_tactic,venue_name,venue_city,venue_area,referee_name," +
  "home_team_players,away_team_players,events,created_at,updated_at,last_scoutastic_sync_at";

const MATCH_SUMMARY_COLUMNS =
  "id,competition_id,date,status,score,home_team_name,away_team_name,scoutastic_competitions(name,area)";

/** `home_team_players`/`away_team_players` are jsonb — genuinely untyped raw external JSON, defensively read field-by-field below. */
type RawLineupEntry = Record<string, unknown>;
type RawEventEntry = Record<string, unknown>;

function toLineupPlayers(raw: unknown): MatchLineupPlayer[] {
  if (!Array.isArray(raw)) return [];
  return (raw as RawLineupEntry[]).map((p) => ({
    id: String(p.id ?? ""),
    firstName: (p.firstName as string) ?? null,
    lastName: (p.lastName as string) ?? null,
    mainPosition: (p.mainPosition as string) ?? null,
    lineUpIdx: typeof p.lineUpIdx === "number" ? p.lineUpIdx : null,
    inLineup: Boolean(p.inLineup),
    minutesPlayed: typeof p.minutesPlayed === "number" ? p.minutesPlayed : 0,
    goals: typeof p.goals === "number" ? p.goals : 0,
    assists: typeof p.assists === "number" ? p.assists : 0,
    shirtNumber: typeof p.shirtNumber === "number" ? p.shirtNumber : null,
    captain: Boolean(p.captain),
  }));
}

function toEvents(raw: unknown): MatchEvent[] {
  if (!Array.isArray(raw)) return [];
  return (raw as RawEventEntry[]).map((e) => ({
    eventId: typeof e.eventId === "number" ? e.eventId : 0,
    type: typeof e.type === "string" ? e.type : "unknown",
    reason: (e.reason as string) || null,
    gameMinute: typeof e.gameMinute === "number" ? e.gameMinute : 0,
    extraMinutes: typeof e.extraMinutes === "number" ? e.extraMinutes : 0,
    playerId: e.playerId != null ? String(e.playerId) : null,
    firstName: (e.firstName as string) ?? null,
    lastName: (e.lastName as string) ?? null,
    shirtNumber: typeof e.shirtNumber === "number" ? e.shirtNumber : null,
    position: (e.position as string) ?? null,
    teamId: e.teamId != null ? String(e.teamId) : null,
  }));
}

function matchFromRow(row: MatchRow): Match {
  return {
    id: row.id,
    competitionId: row.competition_id,
    season: row.season,
    matchday: row.matchday,
    date: row.date,
    status: row.status,
    score: row.score,
    scoreHome: row.score_home,
    scoreAway: row.score_away,
    homeTeamId: row.home_team_id,
    awayTeamId: row.away_team_id,
    homeTeamName: row.home_team_name,
    awayTeamName: row.away_team_name,
    homeTeamTactic: row.home_team_tactic,
    awayTeamTactic: row.away_team_tactic,
    venueName: row.venue_name,
    venueCity: row.venue_city,
    venueArea: row.venue_area,
    refereeName: row.referee_name,
    homeTeamPlayers: toLineupPlayers(row.home_team_players),
    awayTeamPlayers: toLineupPlayers(row.away_team_players),
    events: toEvents(row.events),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastScoutasticSyncAt: row.last_scoutastic_sync_at,
  };
}

function notConfigured(): never {
  throw new Error(
    "Supabase is not configured — match data lives in Postgres, there is no static fallback. See docs/POSTGRES_PERSISTENCE.md."
  );
}

/** [start, end) as ISO datetimes for the UTC calendar day of `dateISO` ("YYYY-MM-DD"). */
function utcDayRange(dateISO: string): { start: string; end: string } {
  const start = new Date(`${dateISO}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * All matches on one calendar day (UTC), across every synced competition —
 * bounded (a real day's worldwide fixture list is at most a few hundred
 * rows, confirmed order-of-magnitude from a single competition's ~306
 * matches/season ÷ ~40 matchdays), so fetched in full and grouped/filtered
 * client-side by the Explore page, same pattern as Debutants/Top Performers.
 */
export async function fetchMatchesByDate(dateISO: string): Promise<MatchSummary[]> {
  if (!isSupabaseConfigured()) notConfigured();
  const { start, end } = utcDayRange(dateISO);
  const { data, error } = await getSupabaseClient()
    .from("matches")
    .select(MATCH_SUMMARY_COLUMNS)
    .gte("date", start)
    .lt("date", end)
    .order("date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => {
    // Embedded via the real FK on matches.competition_id — the untyped
    // client can't express cardinality, so this defensively handles
    // either shape rather than assuming which one comes back.
    const embedded = row.scoutastic_competitions as unknown;
    const comp = (Array.isArray(embedded) ? embedded[0] : embedded) as { name: string | null; area: string | null } | null;
    return {
      id: row.id as string,
      competitionId: row.competition_id as string | null,
      competitionName: comp?.name ?? null,
      competitionArea: comp?.area ?? null,
      date: row.date as string | null,
      status: row.status as string | null,
      score: row.score as string | null,
      homeTeamName: row.home_team_name as string | null,
      awayTeamName: row.away_team_name as string | null,
    };
  });
}

export async function fetchMatchById(id: string): Promise<Match | null> {
  if (!isSupabaseConfigured()) notConfigured();
  const { data, error } = await getSupabaseClient().from("matches").select(MATCH_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? matchFromRow(data as unknown as MatchRow) : null;
}

/**
 * Today's matches, ranked so the ones actually worth a scout's attention
 * come first: KV Mechelen's own fixtures, then matches featuring a
 * shortlisted/priority-status player, then everything else by kickoff
 * time — computed server-side by todays_relevant_match_ids() (db/schema.sql)
 * rather than bulk-fetching every match's lineup to rank client-side (a
 * busy day can have 200+ matches worldwide). The RPC returns just the
 * ranked ids; this re-fetches the full MatchSummary rows (same columns/
 * competition-name join as fetchMatchesByDate) and restores that exact
 * order, since `.in()` doesn't preserve it.
 */
export async function fetchTodaysMatches(limit = 6): Promise<MatchSummary[]> {
  if (!isSupabaseConfigured()) notConfigured();
  const todayISO = new Date().toISOString().slice(0, 10);
  const { data: rankedIds, error: rpcError } = await getSupabaseClient().rpc("todays_relevant_match_ids", {
    match_date: todayISO,
    result_limit: limit,
  });
  if (rpcError) throw rpcError;
  const ids: string[] = (rankedIds ?? []).map((r: { match_id: string }) => r.match_id);
  if (ids.length === 0) return [];

  const { data, error } = await getSupabaseClient().from("matches").select(MATCH_SUMMARY_COLUMNS).in("id", ids);
  if (error) throw error;
  const byId = new Map<string, MatchSummary>();
  for (const row of data ?? []) {
    const embedded = row.scoutastic_competitions as unknown;
    const comp = (Array.isArray(embedded) ? embedded[0] : embedded) as { name: string | null; area: string | null } | null;
    byId.set(row.id as string, {
      id: row.id as string,
      competitionId: row.competition_id as string | null,
      competitionName: comp?.name ?? null,
      competitionArea: comp?.area ?? null,
      date: row.date as string | null,
      status: row.status as string | null,
      score: row.score as string | null,
      homeTeamName: row.home_team_name as string | null,
      awayTeamName: row.away_team_name as string | null,
    });
  }
  return ids.map((id: string) => byId.get(id)).filter((m): m is MatchSummary => m !== undefined);
}
