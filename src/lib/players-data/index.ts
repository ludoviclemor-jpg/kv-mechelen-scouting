import { DEFAULT_SHORTLISTS } from "./shortlists";

export * from "./types";
export * from "./constants";
export { computeMatchStats, meetsMinimumMatches, ratingTrendSeries } from "./stats";
export { DEFAULT_SHORTLISTS } from "./shortlists";
export { useAsync, type AsyncState } from "./useAsync";
export {
  fetchPlayerById,
  fetchPlayersByIds,
  searchPlayers,
  fetchPlayersPage,
  fetchFilterOptions,
  fetchTopPerformers,
  fetchAfricanDebutants,
  fetchRecentlyAdded,
  fetchScoutingOverview,
  fetchSyncMeta,
  type PlayerSortKey,
  type PlayersQueryParams,
  type FilterOptions,
  type ScoutingOverview,
} from "./remote";

export function getShortlists() {
  return DEFAULT_SHORTLISTS;
}

export function getShortlistById(id: string) {
  return DEFAULT_SHORTLISTS.find((s) => s.id === id);
}
