import { SYNCED_PLAYERS, SYNC_META } from "./players";
import { DEFAULT_SHORTLISTS } from "./shortlists";
import { computeMatchStats, meetsMinimumMatches } from "./stats";
import type { Player } from "./types";

export * from "./types";
export * from "./constants";
export { computeMatchStats, meetsMinimumMatches, ratingTrendSeries } from "./stats";
export { DEFAULT_SHORTLISTS } from "./shortlists";
export { SYNC_META } from "./players";

/**
 * Selectors — the boundary between "how the synced data happens to be
 * shaped" and "what the UI asks for". Only `active` players are returned
 * (a player stops being active once a sync no longer finds them — see
 * scripts/sync-scoutastic.mjs — but their record is kept, never deleted).
 */

function activePlayers(): Player[] {
  return SYNCED_PLAYERS.filter((p) => p.active);
}

export function getAllPlayers(): Player[] {
  return activePlayers();
}

export function getPlayerById(id: string): Player | undefined {
  return SYNCED_PLAYERS.find((p) => p.id === id);
}

export function getTopPerformers(limit = 5): Player[] {
  return activePlayers()
    .filter((p) => meetsMinimumMatches(p.matches))
    .sort((a, b) => {
      const aAvg = computeMatchStats(a.matches).average ?? 0;
      const bAvg = computeMatchStats(b.matches).average ?? 0;
      return bAvg - aAvg;
    })
    .slice(0, limit);
}

export function getAfricanDebutants(): Player[] {
  return activePlayers()
    .filter((p) => p.isDebutant && p.isAfrican && p.isEasternEuropeanLeague && !p.isYouthOrReserve)
    .sort((a, b) => (b.debutDate ?? "").localeCompare(a.debutDate ?? ""));
}

export function getRecentlyAdded(limit = 8): Player[] {
  return [...activePlayers()].sort((a, b) => b.addedDate.localeCompare(a.addedDate)).slice(0, limit);
}

export function getShortlists() {
  return DEFAULT_SHORTLISTS;
}

export function getShortlistById(id: string) {
  return DEFAULT_SHORTLISTS.find((s) => s.id === id);
}

export interface ScoutingOverview {
  totalPlayers: number;
  newPlayers: number;
  africanDebutants: number;
  playersMonitored: number;
  shortlists: number;
}

/** "New" = added to the database in the last 14 days. */
export function getScoutingOverview(referenceDateISO: string): ScoutingOverview {
  const reference = new Date(referenceDateISO).getTime();
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
  const players = activePlayers();

  return {
    totalPlayers: players.length,
    newPlayers: players.filter((p) => reference - new Date(p.addedDate).getTime() <= fourteenDaysMs).length,
    africanDebutants: getAfricanDebutants().length,
    playersMonitored: players.filter(
      (p) => p.status === "monitoring" || p.status === "interested" || p.status === "priority"
    ).length,
    shortlists: DEFAULT_SHORTLISTS.length,
  };
}

/** Whether any SCOUTASTIC sync has ever completed. Used to show an empty/setup state instead of an empty table. */
export function hasSyncedData(): boolean {
  return SYNC_META.lastSyncedAt !== null && SYNCED_PLAYERS.length > 0;
}
