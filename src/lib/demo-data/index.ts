import { DEMO_PLAYERS } from "./players";
import { DEMO_SHORTLISTS } from "./shortlists";
import { computeMatchStats, meetsMinimumMatches } from "./stats";
import type { Player } from "./types";

export * from "./types";
export * from "./constants";
export { computeMatchStats, meetsMinimumMatches, ratingTrendSeries } from "./stats";
export { DEMO_SHORTLISTS } from "./shortlists";

/**
 * Selectors — the boundary between "how demo data happens to be shaped"
 * and "what the UI asks for". Replacing `DEMO_PLAYERS` with a database- or
 * SCOUTASTIC-backed fetch means only this file changes.
 */

export function getAllPlayers(): Player[] {
  return DEMO_PLAYERS;
}

export function getPlayerById(id: string): Player | undefined {
  return DEMO_PLAYERS.find((p) => p.id === id);
}

export function getTopPerformers(limit = 5): Player[] {
  return [...DEMO_PLAYERS]
    .filter((p) => meetsMinimumMatches(p.matches))
    .sort((a, b) => {
      const aAvg = computeMatchStats(a.matches).average ?? 0;
      const bAvg = computeMatchStats(b.matches).average ?? 0;
      return bAvg - aAvg;
    })
    .slice(0, limit);
}

export function getAfricanDebutants(): Player[] {
  return DEMO_PLAYERS.filter(
    (p) =>
      p.isDebutant &&
      p.isAfrican &&
      p.isEasternEuropeanLeague &&
      !p.isYouthOrReserve
  ).sort((a, b) => (b.debutDate ?? "").localeCompare(a.debutDate ?? ""));
}

export function getRecentlyAdded(limit = 8): Player[] {
  return [...DEMO_PLAYERS]
    .sort((a, b) => b.addedDate.localeCompare(a.addedDate))
    .slice(0, limit);
}

export function getShortlists() {
  return DEMO_SHORTLISTS;
}

export function getShortlistById(id: string) {
  return DEMO_SHORTLISTS.find((s) => s.id === id);
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

  return {
    totalPlayers: DEMO_PLAYERS.length,
    newPlayers: DEMO_PLAYERS.filter(
      (p) => reference - new Date(p.addedDate).getTime() <= fourteenDaysMs
    ).length,
    africanDebutants: getAfricanDebutants().length,
    playersMonitored: DEMO_PLAYERS.filter(
      (p) => p.status === "monitoring" || p.status === "interested" || p.status === "priority"
    ).length,
    shortlists: DEMO_SHORTLISTS.length,
  };
}
