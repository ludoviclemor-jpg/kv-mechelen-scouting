import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { ImpectLeaguePlayer } from "@/lib/impect-types";

/**
 * Live Impect reads — replaces the earlier static-JSON snapshot
 * (src/data/impect-league-player-kpis.json, now removed) once the
 * Supabase-backed sync (scripts/sync-impect-*.mjs) landed. Never fetches
 * more than one competition's worth of player data at a time — see
 * scripts/sync-impect-player-kpis.mjs's own header for why "all 759
 * competitions" has to stay a server-side, incrementally-synced dataset
 * rather than something bundled into the frontend.
 */

function notConfigured(): never {
  throw new Error("Supabase is not configured — Impect data lives in Postgres, no static fallback.");
}

export interface ImpectCompetitionOption {
  iterationId: number;
  competitionName: string;
  season: string;
  competitionType: string;
  ageGroup: string;
  isSynced: boolean; // has scripts/sync-impect-player-kpis.mjs ever processed this one?
}

/** The full real 759-competition catalog, for a searchable picker — small (id/name/season only), safe to fetch in full. */
export async function fetchImpectCompetitions(): Promise<ImpectCompetitionOption[]> {
  if (!isSupabaseConfigured()) notConfigured();
  const { data, error } = await getSupabaseClient()
    .from("impect_competitions")
    .select("iteration_id,competition_name,season,competition_type,age_group,last_synced_at")
    .order("competition_name")
    .order("season", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    iterationId: r.iteration_id,
    competitionName: r.competition_name,
    season: r.season,
    competitionType: r.competition_type,
    ageGroup: r.age_group,
    isSynced: r.last_synced_at !== null,
  }));
}

interface PlayerKpiRow {
  iteration_id: number;
  squad_id: number;
  player_id: number;
  position: string | null;
  minutes: number | null;
  match_share: number | null;
  kpis: Record<string, number>;
  impect_players: { commonname: string; birthdate: string | null } | null;
  impect_squads: { name: string } | null;
}

function per90(raw: number | undefined, matchShare: number | null): number | null {
  if (raw === undefined || !matchShare) return null;
  return Math.round((raw / matchShare) * 100) / 100;
}

function winPercent(won: number | undefined, lost: number | undefined): number | null {
  if (won === undefined && lost === undefined) return null;
  const w = won ?? 0;
  const l = lost ?? 0;
  const total = w + l;
  if (total === 0) return null;
  return Math.round((w / total) * 1000) / 10;
}

/** One competition's full, real player-KPI table — bounded to that competition's own squad sizes (never more than a few hundred rows). */
export async function fetchImpectPlayerKpisForCompetition(iterationId: number): Promise<ImpectLeaguePlayer[]> {
  if (!isSupabaseConfigured()) notConfigured();
  const { data, error } = await getSupabaseClient()
    .from("impect_player_kpis")
    .select("iteration_id,squad_id,player_id,position,minutes,match_share,kpis,impect_players(commonname,birthdate),impect_squads(name)")
    .eq("iteration_id", iterationId);
  if (error) throw error;

  return ((data ?? []) as unknown as PlayerKpiRow[]).map((row) => {
    const k = row.kpis ?? {};
    return {
      playerId: row.player_id,
      name: row.impect_players?.commonname ?? `Player ${row.player_id}`,
      position: row.position ?? "UNKNOWN",
      squadId: row.squad_id,
      squadName: row.impect_squads?.name ?? "Unknown",
      birthdate: row.impect_players?.birthdate ?? null,
      minutes: row.minutes ?? 0,
      matchShare: row.match_share ?? 0,
      goals: k.GOALS ?? null,
      assists: k.ASSISTS ?? null,
      shotsPer90: per90(k.SHOT_AT_GOAL_NUMBER, row.match_share),
      shotXgPer90: per90(k.SHOT_XG, row.match_share),
      packingXgPer90: per90(k.PACKING_XG, row.match_share),
      bypassedOpponentsPer90: per90(k.BYPASSED_OPPONENTS, row.match_share),
      bypassedDefendersPer90: per90(k.BYPASSED_DEFENDERS, row.match_share),
      groundDuelWinPercent: winPercent(k.WON_GROUND_DUELS, k.LOST_GROUND_DUELS),
      aerialDuelWinPercent: winPercent(k.WON_AERIAL_DUELS, k.LOST_AERIAL_DUELS),
      ballWinPer90: per90(k.BALL_WIN_REMOVED_OPPONENTS, row.match_share),
      ballLossPer90: per90(k.BALL_LOSS_REMOVED_TEAMMATES, row.match_share),
      transfermarktId: null,
    };
  });
}
