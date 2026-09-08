import type { PlayersSearchFilters } from "@/lib/saved-searches";
import type { PlayerSortKey } from "@/components/players/PlayerTable";

export interface PlayersPageFilters extends PlayersSearchFilters {
  sortKey?: PlayerSortKey;
  sortDirection?: "asc" | "desc";
  page?: number;
}

const DEFAULT_SORT_KEY: PlayerSortKey = "marketValueEUR";
const DEFAULT_SORT_DIRECTION = "desc";

/**
 * Players page filter state <-> URL query string, both directions —
 * powers "filters survive opening a player and coming back" and
 * predictable browser back/forward (redesign item 6). Only non-default
 * values are written to the URL, so a plain `/players` stays clean.
 * Also reused as the exact shape stored in a saved search's `filters`
 * jsonb column (see src/lib/saved-searches/types.ts) — one shape, no
 * separate parsing layer.
 */
export function filtersToSearchParams(f: PlayersPageFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.search) p.set("search", f.search);
  if (f.position && f.position !== "all") p.set("position", f.position);
  if (f.nationality && f.nationality !== "all") p.set("nationality", f.nationality);
  if (f.country && f.country !== "all") p.set("country", f.country);
  if (f.competitionId && f.competitionId !== "all") p.set("competitionId", f.competitionId);
  if (f.club && f.club !== "all") p.set("club", f.club);
  if (f.ageMin != null) p.set("ageMin", String(f.ageMin));
  if (f.ageMax != null) p.set("ageMax", String(f.ageMax));
  if (f.valueMinEUR != null) p.set("valueMin", String(f.valueMinEUR));
  if (f.valueMaxEUR != null) p.set("valueMax", String(f.valueMaxEUR));
  if (f.contractPreset && f.contractPreset !== "all") p.set("contract", f.contractPreset);
  if (f.sortKey && f.sortKey !== DEFAULT_SORT_KEY) p.set("sort", f.sortKey);
  if (f.sortDirection && f.sortDirection !== DEFAULT_SORT_DIRECTION) p.set("dir", f.sortDirection);
  if (f.page && f.page !== 1) p.set("page", String(f.page));
  return p;
}

export function searchParamsToFilters(params: URLSearchParams): PlayersPageFilters {
  const num = (key: string): number | null => {
    const v = params.get(key);
    return v !== null && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : null;
  };
  const page = num("page");
  return {
    search: params.get("search") ?? undefined,
    position: params.get("position") ?? undefined,
    nationality: params.get("nationality") ?? undefined,
    country: params.get("country") ?? undefined,
    competitionId: params.get("competitionId") ?? undefined,
    club: params.get("club") ?? undefined,
    ageMin: num("ageMin"),
    ageMax: num("ageMax"),
    valueMinEUR: num("valueMin"),
    valueMaxEUR: num("valueMax"),
    contractPreset: params.get("contract") ?? undefined,
    sortKey: (params.get("sort") as PlayerSortKey | null) ?? undefined,
    sortDirection: (params.get("dir") as "asc" | "desc" | null) ?? undefined,
    page: page ?? undefined,
  };
}
