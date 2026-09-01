import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { PlayerMatchRating, PlayerRecentPerformance, TopRatedPlayer, TopRatedPlayersParams } from "./types";
import { average, lastNAverage } from "./aggregate";

/**
 * Runtime, Postgres-backed Sportmonks ratings data (TEST integration —
 * Danish Superliga + Scottish Premiership only, docs/SPORTMONKS_INTEGRATION.md).
 * Every function here reads `player_match_ratings`/the
 * `sportmonks_top_rated_players` function directly — this module never
 * calls the Sportmonks API itself. That only ever happens server-side, in
 * scripts/sync-sportmonks-ratings.mjs (service_role key, never shipped to
 * the browser). This keeps the same architecture as every other data
 * source in this app: Supabase under RLS is the "backend," the frontend
 * never talks to a third-party API directly.
 */

const PROVIDER = "sportmonks";
const LAST_N = 5;

interface RatingRow {
  fixture_id: string;
  competition_id: string | null;
  competition_name: string | null;
  season_id: string | null;
  match_date: string;
  opponent: string | null;
  home_away: "home" | "away" | null;
  minutes_played: number | null;
  starter: boolean | null;
  rating: number;
}

function ratingFromRow(row: RatingRow): PlayerMatchRating {
  return {
    fixtureId: row.fixture_id,
    competitionId: row.competition_id,
    competitionName: row.competition_name,
    seasonId: row.season_id,
    matchDate: row.match_date,
    opponent: row.opponent,
    homeAway: row.home_away,
    minutesPlayed: row.minutes_played,
    starter: row.starter,
    rating: row.rating,
  };
}

function notConfigured(): never {
  throw new Error(
    "Supabase is not configured — Sportmonks ratings live in Postgres, there is no static fallback. See docs/POSTGRES_PERSISTENCE.md."
  );
}

/**
 * The player-profile "Recent Performance" section's data. Returns an
 * empty `ratings` array (never throws, never a placeholder rating) for a
 * player with no Sportmonks data yet — most players, since this is
 * scoped to two leagues only. Callers show "No performance ratings
 * available yet." in that case, never fake data.
 */
export async function fetchPlayerRecentPerformance(playerId: string): Promise<PlayerRecentPerformance> {
  if (!isSupabaseConfigured()) notConfigured();
  const db = getSupabaseClient();

  const { data: recentRows, error: recentErr } = await db
    .from("player_match_ratings")
    .select("fixture_id,competition_id,competition_name,season_id,match_date,opponent,home_away,minutes_played,starter,rating")
    .eq("player_id", playerId)
    .eq("provider", PROVIDER)
    .order("match_date", { ascending: false })
    .order("fixture_id", { ascending: false })
    .limit(LAST_N);
  if (recentErr) throw recentErr;

  const allRecentRows = ((recentRows as unknown as RatingRow[]) ?? []).map(ratingFromRow);
  const { recent: ratings, average: last5Average } = lastNAverage(allRecentRows, LAST_N);

  // Season average "if available" — only meaningful when the most recent
  // rating carries a real season_id; a player with ratings from more than
  // one distinct season (mid-window edge case) is scoped to the *current*
  // (most recent) season only, not blended across seasons.
  let seasonAverage: number | null = null;
  const currentSeasonId = ratings[0]?.seasonId ?? null;
  if (currentSeasonId) {
    const { data: seasonRows, error: seasonErr } = await db
      .from("player_match_ratings")
      .select("rating")
      .eq("player_id", playerId)
      .eq("provider", PROVIDER)
      .eq("season_id", currentSeasonId);
    if (seasonErr) throw seasonErr;
    seasonAverage = average(((seasonRows as unknown as { rating: number }[]) ?? []).map((r) => r.rating));
  }

  return { ratings, last5Average, seasonAverage };
}

interface TopRatedRow {
  player_id: string;
  player_name: string;
  club: string | null;
  competition_id: string | null;
  competition_name: string | null;
  avg_rating: number;
  rated_matches: number;
}

/** Backs the homepage "Top Rated Players" widget — a thin wrapper around the `sportmonks_top_rated_players` Postgres function (db/schema.sql), which does the last-5-per-player ranking/aggregation server-side. */
export async function fetchTopRatedPlayers(params: TopRatedPlayersParams = {}): Promise<TopRatedPlayer[]> {
  if (!isSupabaseConfigured()) notConfigured();
  const { data, error } = await getSupabaseClient().rpc("sportmonks_top_rated_players", {
    min_avg_rating: params.minAvgRating ?? 0,
    min_appearances: params.minAppearances ?? 3,
    filter_competition_ids: params.competitionIds && params.competitionIds.length > 0 ? params.competitionIds : null,
    result_limit: params.limit ?? 10,
  });
  if (error) throw error;
  return ((data as unknown as TopRatedRow[]) ?? []).map((row) => ({
    playerId: row.player_id,
    playerName: row.player_name,
    club: row.club,
    competitionId: row.competition_id,
    competitionName: row.competition_name,
    avgRating: row.avg_rating,
    ratedMatches: row.rated_matches,
  }));
}
