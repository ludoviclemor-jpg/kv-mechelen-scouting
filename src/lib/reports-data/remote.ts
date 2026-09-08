import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { MatchReport, MatchReportFilters, MatchReportInput } from "./types";

/**
 * Match report history, backed by `match_reports` (db/schema.sql, RLS in
 * db/rls_policies.sql — private per scout, enforced by Postgres, not just
 * hidden in the UI). No local-only fallback, unlike shortlists/notes: a
 * report a scout believes is saved must actually be durable, so an
 * in-memory "resets on reload" stand-in would be actively misleading here
 * rather than a harmless degradation — see docs/POSTGRES_PERSISTENCE.md.
 */
function notConfigured(): never {
  throw new Error(
    "Database not configured — match reports need Postgres persistence (see Settings). Nothing has been saved."
  );
}

const REPORT_COLUMNS =
  "id,scoutastic_player_id,match_id,opponent,match_date,scouting_type,minutes_watched," +
  "position_played,strengths,weaknesses,overall_rating,follow_up_action,created_at,updated_at";

interface MatchReportRow {
  id: string;
  scoutastic_player_id: string;
  match_id: string | null;
  opponent: string;
  match_date: string | null;
  scouting_type: "live" | "video";
  minutes_watched: number | null;
  position_played: string | null;
  strengths: string;
  weaknesses: string;
  overall_rating: number | null;
  follow_up_action: MatchReport["followUpAction"];
  created_at: string;
  updated_at: string;
}

function fromRow(row: MatchReportRow): MatchReport {
  return {
    id: row.id,
    playerId: row.scoutastic_player_id,
    matchId: row.match_id,
    opponent: row.opponent,
    matchDate: row.match_date,
    scoutingType: row.scouting_type,
    minutesWatched: row.minutes_watched,
    positionPlayed: row.position_played,
    strengths: row.strengths,
    weaknesses: row.weaknesses,
    overallRating: row.overall_rating,
    followUpAction: row.follow_up_action,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toInsertRow(playerId: string, input: MatchReportInput) {
  return {
    scoutastic_player_id: playerId,
    match_id: input.matchId ?? null,
    opponent: input.opponent,
    match_date: input.matchDate,
    scouting_type: input.scoutingType,
    minutes_watched: input.minutesWatched,
    position_played: input.positionPlayed,
    strengths: input.strengths,
    weaknesses: input.weaknesses,
    overall_rating: input.overallRating,
    follow_up_action: input.followUpAction,
  };
}

/** Every report for one player, most recent match first — powers the player profile's report history section. */
export async function fetchMatchReportsForPlayer(playerId: string): Promise<MatchReport[]> {
  if (!isSupabaseConfigured()) notConfigured();
  const { data, error } = await getSupabaseClient()
    .from("match_reports")
    .select(REPORT_COLUMNS)
    .eq("scoutastic_player_id", playerId)
    .order("match_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as MatchReportRow[]).map(fromRow);
}

/**
 * Every report the signed-in scout has ever written (RLS already scopes
 * this to `owner_id = auth.uid()` — no client-side filtering needed for
 * privacy), optionally narrowed — powers the Reports page's full history
 * view with real filters instead of a single current-status summary.
 */
export async function fetchAllMatchReports(filters: MatchReportFilters = {}): Promise<MatchReport[]> {
  if (!isSupabaseConfigured()) notConfigured();
  let query = getSupabaseClient().from("match_reports").select(REPORT_COLUMNS);
  if (filters.playerId) query = query.eq("scoutastic_player_id", filters.playerId);
  if (filters.minRating !== undefined) query = query.gte("overall_rating", filters.minRating);
  if (filters.followUpAction) query = query.eq("follow_up_action", filters.followUpAction);
  if (filters.fromDate) query = query.gte("match_date", filters.fromDate);
  if (filters.toDate) query = query.lte("match_date", filters.toDate);
  const { data, error } = await query
    .order("match_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as MatchReportRow[]).map(fromRow);
}

export async function createMatchReport(playerId: string, input: MatchReportInput): Promise<MatchReport> {
  if (!isSupabaseConfigured()) notConfigured();
  const { data, error } = await getSupabaseClient()
    .from("match_reports")
    .insert(toInsertRow(playerId, input))
    .select(REPORT_COLUMNS)
    .single();
  if (error) throw error;
  return fromRow(data as unknown as MatchReportRow);
}

export async function updateMatchReport(id: string, input: MatchReportInput): Promise<MatchReport> {
  if (!isSupabaseConfigured()) notConfigured();
  const { data, error } = await getSupabaseClient()
    .from("match_reports")
    .update({
      match_id: input.matchId ?? null,
      opponent: input.opponent,
      match_date: input.matchDate,
      scouting_type: input.scoutingType,
      minutes_watched: input.minutesWatched,
      position_played: input.positionPlayed,
      strengths: input.strengths,
      weaknesses: input.weaknesses,
      overall_rating: input.overallRating,
      follow_up_action: input.followUpAction,
    })
    .eq("id", id)
    .select(REPORT_COLUMNS)
    .single();
  if (error) throw error;
  return fromRow(data as unknown as MatchReportRow);
}

export async function deleteMatchReport(id: string): Promise<void> {
  if (!isSupabaseConfigured()) notConfigured();
  const { error } = await getSupabaseClient().from("match_reports").delete().eq("id", id);
  if (error) throw error;
}
