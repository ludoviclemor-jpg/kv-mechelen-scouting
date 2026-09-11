/**
 * Shape of src/data/impect-league-player-kpis.json's `players` rows —
 * shared between ImpectLeaguePlayerKpisWidget and
 * ImpectPlayerPizzaDrawer so both stay in sync with the sync script's
 * real output (scripts/sync-impect-league-player-kpis.mjs).
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
