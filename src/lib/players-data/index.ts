import { DEFAULT_SHORTLISTS } from "./shortlists";

export * from "./types";
export * from "./constants";
export { computeMatchStats, meetsMinimumMatches, ratingTrendSeries } from "./stats";
export {
  aggregateStats,
  clubRows,
  internationalRows,
  availableSeasons,
  competitionsInSeason,
  capsByLevel,
  type AggregatedStats,
  type CompetitionOption as PerformanceCompetitionOption,
  type CapsByLevel,
} from "./performance";
export { DEFAULT_SHORTLISTS } from "./shortlists";
export { useAsync, type AsyncState } from "./useAsync";
export {
  fetchPlayerById,
  fetchPlayerPerformanceDetail,
  fetchPlayersByIds,
  searchPlayers,
  fetchPlayersPage,
  fetchFilterOptions,
  fetchCompetitionsInCountry,
  fetchClubsInCompetition,
  fetchTopPerformers,
  fetchAfricanDebutants,
  fetchRecentlyAdded,
  fetchPriorityPlayers,
  fetchLoanWatchCandidates,
  LOAN_WATCH_DEFAULT_MAX_MINUTES,
  LOAN_WATCH_LEAGUE_GROUPS,
  DEBUTANT_REGION_GROUPS,
  fetchScoutingOverview,
  fetchSyncMeta,
  fetchDebutMatchMinutes,
  type PlayerSortKey,
  type PlayersQueryParams,
  type FilterOptions,
  type CompetitionOption,
  type ScoutingOverview,
} from "./remote";

export function getShortlists() {
  return DEFAULT_SHORTLISTS;
}

export function getShortlistById(id: string) {
  return DEFAULT_SHORTLISTS.find((s) => s.id === id);
}
