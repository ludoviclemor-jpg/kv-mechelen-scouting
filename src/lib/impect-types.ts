/**
 * Real per-player KPI shape, shared between ImpectLeaguePlayerKpisWidget,
 * ImpectPlayerPizzaDrawer, and src/lib/impect-data/remote.ts's live
 * Supabase read — one row per player in whichever Impect competition is
 * currently selected (scripts/sync-impect-player-kpis.mjs is what
 * populates the underlying `impect_player_kpis` table this is built
 * from).
 */
export interface ImpectLeaguePlayer {
  playerId: number;
  name: string;
  position: string;
  squadId: number;
  squadName: string;
  birthdate: string | null;
  minutes: number;
  matchShare: number;
  goals: number | null;
  assists: number | null;
  shotsPer90: number | null;
  shotXgPer90: number | null;
  packingXgPer90: number | null;
  bypassedOpponentsPer90: number | null;
  bypassedDefendersPer90: number | null;
  groundDuelWinPercent: number | null;
  aerialDuelWinPercent: number | null;
  ballWinPer90: number | null;
  ballLossPer90: number | null;
  transfermarktId: string | null;
}
