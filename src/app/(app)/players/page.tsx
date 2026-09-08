"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { FilterSelect, ActiveFilterChips, type ActiveFilterChip } from "@/components/ui/FilterBar";
import { FilterSidebar, FilterSidebarSection } from "@/components/ui/FilterSidebar";
import { AgeRangeSlider } from "@/components/ui/AgeFilter";
import { MarketValueFilter } from "@/components/ui/MarketValueFilter";
import { SearchBar } from "@/components/ui/SearchBar";
import { Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState, ErrorState } from "@/components/ui/LoadingState";
import { SavedSearchesPanel } from "@/components/players/SavedSearchesPanel";
import {
  PlayerTable,
  type PlayerSortKey,
  type SortDirection,
} from "@/components/players/PlayerTable";
import {
  fetchPlayersPage,
  fetchFilterOptions,
  fetchCompetitionsInCountry,
  fetchClubsInCompetition,
  POSITIONS,
  POSITION_LABELS,
  useAsync,
} from "@/lib/players-data";
import { ageRangeLabel, type AgeRange } from "@/lib/agePresets";
import { valueRangeLabel, type ValueRange } from "@/lib/valuePresets";
import { CONTRACT_PRESETS, CONTRACT_PRESET_LABELS } from "@/lib/contractPresets";
import { filtersToSearchParams, searchParamsToFilters } from "@/lib/playersFilterUrl";
import type { PlayersSearchFilters } from "@/lib/saved-searches";
import { Users } from "lucide-react";

const PAGE_SIZE = 25;
const ALL_AGES: AgeRange = { min: null, max: null };
const ALL_VALUES: ValueRange = { min: null, max: null };

/** 300ms — enough to not fire a query per keystroke, not so much it feels laggy. */
function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function PlayersPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  // Read once on mount (both a GlobalSearch suggestion's ?search=/
  // ?nationality= and this page's own richer query string use the same
  // keys) — this page's own state takes over from there and writes back
  // to the URL itself (see the sync effect below), so filters, sort and
  // page all survive opening a player and returning, and back/forward
  // moves through real filter states instead of losing them.
  const searchParams = useSearchParams();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally read only once, on mount
  const initial = useMemo(() => searchParamsToFilters(searchParams), []);

  const [search, setSearch] = useState(initial.search ?? "");
  const [position, setPosition] = useState(initial.position ?? "all");
  const [nationality, setNationality] = useState(initial.nationality ?? "all");
  // Cascading: country -> competition -> club. Changing a parent always
  // clears its children (see the on*Change handlers below) so the UI can
  // never be left showing options that don't actually apply anymore.
  const [country, setCountry] = useState(initial.country ?? "all");
  const [competitionId, setCompetitionId] = useState(initial.competitionId ?? "all");
  const [club, setClub] = useState(initial.club ?? "all");
  const [ageRange, setAgeRange] = useState<AgeRange>({ min: initial.ageMin ?? null, max: initial.ageMax ?? null });
  const [valueRange, setValueRange] = useState<ValueRange>({ min: initial.valueMinEUR ?? null, max: initial.valueMaxEUR ?? null });
  const [contractPreset, setContractPreset] = useState(initial.contractPreset ?? "all");
  const [sortKey, setSortKey] = useState<PlayerSortKey>(initial.sortKey ?? "marketValueEUR");
  const [sortDirection, setSortDirection] = useState<SortDirection>(initial.sortDirection ?? "desc");
  const [page, setPage] = useState(initial.page ?? 1);

  const debouncedSearch = useDebounced(search);

  const filterOptions = useAsync(() => fetchFilterOptions(), []);
  const competitionOptions = useAsync(
    () => (country !== "all" ? fetchCompetitionsInCountry(country) : Promise.resolve([])),
    [country]
  );
  const clubOptions = useAsync(
    () => (competitionId !== "all" ? fetchClubsInCompetition(competitionId) : Promise.resolve([])),
    [competitionId]
  );

  // Keep the URL in sync with every filter/sort/page change — this is
  // what makes browser back/forward move through real states and lets a
  // returning visit (or a saved search) restore the exact same view.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return; // don't rewrite the URL on mount from the state we just read out of it
    }
    const qs = filtersToSearchParams({
      search: debouncedSearch,
      position,
      nationality,
      country,
      competitionId,
      club,
      ageMin: ageRange.min,
      ageMax: ageRange.max,
      valueMinEUR: valueRange.min,
      valueMaxEUR: valueRange.max,
      contractPreset,
      sortKey,
      sortDirection,
      page,
    }).toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, position, nationality, country, competitionId, club, ageRange, valueRange, contractPreset, sortKey, sortDirection, page]);

  const result = useAsync(
    () =>
      fetchPlayersPage({
        search: debouncedSearch,
        position,
        nationality,
        league: country,
        competitionId: competitionId !== "all" ? competitionId : undefined,
        club,
        ageRange,
        valueRange,
        contractPreset,
        sortKey,
        sortDirection,
        page,
        pageSize: PAGE_SIZE,
      }),
    [debouncedSearch, position, nationality, country, competitionId, club, ageRange, valueRange, contractPreset, sortKey, sortDirection, page]
  );

  function handleSort(key: PlayerSortKey) {
    if (key === sortKey) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
    setPage(1);
  }

  function resetPage<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
    };
  }

  function handleCountryChange(value: string) {
    setCountry(value);
    setCompetitionId("all"); // clear incompatible children
    setClub("all");
    setPage(1);
  }

  function handleCompetitionChange(value: string) {
    setCompetitionId(value);
    setClub("all");
    setPage(1);
  }

  function clearAll() {
    setSearch("");
    setPosition("all");
    setNationality("all");
    setCountry("all");
    setCompetitionId("all");
    setClub("all");
    setAgeRange(ALL_AGES);
    setValueRange(ALL_VALUES);
    setContractPreset("all");
    setPage(1);
  }

  /** Applies a saved search's stored filters wholesale, replacing everything currently set. */
  function applySavedSearch(filters: PlayersSearchFilters) {
    setSearch(filters.search ?? "");
    setPosition(filters.position ?? "all");
    setNationality(filters.nationality ?? "all");
    setCountry(filters.country ?? "all");
    setCompetitionId(filters.competitionId ?? "all");
    setClub(filters.club ?? "all");
    setAgeRange({ min: filters.ageMin ?? null, max: filters.ageMax ?? null });
    setValueRange({ min: filters.valueMinEUR ?? null, max: filters.valueMaxEUR ?? null });
    setContractPreset(filters.contractPreset ?? "all");
    setPage(1);
  }

  const currentFiltersForSaving: PlayersSearchFilters = {
    search: search || undefined,
    position,
    nationality,
    country,
    competitionId,
    club,
    ageMin: ageRange.min,
    ageMax: ageRange.max,
    valueMinEUR: valueRange.min,
    valueMaxEUR: valueRange.max,
    contractPreset,
  };

  const ageLabel = ageRangeLabel(ageRange);
  const valueLabel = valueRangeLabel(valueRange);
  const competitionName = competitionOptions.data?.find((c) => c.id === competitionId)?.name ?? competitionId;

  const chips: ActiveFilterChip[] = useMemo(() => {
    const list: ActiveFilterChip[] = [];
    if (position !== "all") list.push({ key: "position", label: "Position", value: POSITION_LABELS[position as keyof typeof POSITION_LABELS], onClear: () => resetPage(setPosition)("all") });
    if (nationality !== "all") list.push({ key: "nationality", label: "Nationality", value: nationality, onClear: () => resetPage(setNationality)("all") });
    if (country !== "all") list.push({ key: "country", label: "Country", value: country, onClear: () => handleCountryChange("all") });
    if (competitionId !== "all") list.push({ key: "competition", label: "Competition", value: competitionName, onClear: () => handleCompetitionChange("all") });
    if (club !== "all") list.push({ key: "club", label: "Club", value: club, onClear: () => resetPage(setClub)("all") });
    if (ageLabel) list.push({ key: "age", label: "Age", value: ageLabel, onClear: () => resetPage(setAgeRange)(ALL_AGES) });
    if (valueLabel) list.push({ key: "value", label: "Market value", value: valueLabel, onClear: () => resetPage(setValueRange)(ALL_VALUES) });
    if (contractPreset !== "all") list.push({ key: "contract", label: "Contract", value: CONTRACT_PRESET_LABELS[contractPreset], onClear: () => resetPage(setContractPreset)("all") });
    return list;
  }, [position, nationality, country, competitionId, competitionName, club, ageLabel, valueLabel, contractPreset]);

  const total = result.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Player Database"
        description={result.data ? `${total.toLocaleString()} players` : undefined}
      />

      <div className="flex min-h-0 flex-1">
        <FilterSidebar activeCount={chips.length} onClearAll={clearAll}>
          <FilterSidebarSection label="Saved searches">
            <SavedSearchesPanel currentFilters={currentFiltersForSaving} onApply={applySavedSearch} />
          </FilterSidebarSection>

          <FilterSidebarSection label="Search">
            <SearchBar value={search} onChange={resetPage(setSearch)} placeholder="Player, club, nationality..." />
          </FilterSidebarSection>

          <FilterSidebarSection label="Position">
            <FilterSelect
              stacked
              label=""
              value={position}
              onChange={resetPage(setPosition)}
              options={[
                { value: "all", label: "All positions" },
                ...POSITIONS.map((p) => ({ value: p, label: POSITION_LABELS[p] })),
              ]}
            />
          </FilterSidebarSection>

          <FilterSidebarSection label="Age">
            <AgeRangeSlider range={ageRange} onChange={resetPage(setAgeRange)} />
          </FilterSidebarSection>

          <FilterSidebarSection label="Nationality">
            <FilterSelect
              stacked
              label=""
              value={nationality}
              onChange={resetPage(setNationality)}
              options={[
                { value: "all", label: "All nationalities" },
                ...(filterOptions.data?.nationalities ?? []).map((n) => ({ value: n, label: n })),
              ]}
            />
          </FilterSidebarSection>

          <FilterSidebarSection label="Country">
            <FilterSelect
              stacked
              label=""
              value={country}
              onChange={handleCountryChange}
              options={[
                { value: "all", label: "All countries" },
                ...(filterOptions.data?.leagues ?? []).map((l) => ({ value: l, label: l })),
              ]}
            />
          </FilterSidebarSection>

          <FilterSidebarSection label="Competition">
            <FilterSelect
              stacked
              label=""
              value={competitionId}
              onChange={handleCompetitionChange}
              disabled={country === "all"}
              options={[
                { value: "all", label: country === "all" ? "Pick a country first" : "All competitions" },
                ...(competitionOptions.data ?? []).map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          </FilterSidebarSection>

          <FilterSidebarSection label="Club">
            <FilterSelect
              stacked
              label=""
              value={club}
              onChange={resetPage(setClub)}
              disabled={competitionId === "all"}
              options={[
                { value: "all", label: competitionId === "all" ? "Pick a competition first" : "All clubs" },
                ...(clubOptions.data ?? []).map((c) => ({ value: c, label: c })),
              ]}
            />
          </FilterSidebarSection>

          <FilterSidebarSection label="Market Value">
            <MarketValueFilter range={valueRange} onChange={resetPage(setValueRange)} />
          </FilterSidebarSection>

          <FilterSidebarSection label="Contract Expiry">
            <FilterSelect stacked label="" value={contractPreset} onChange={resetPage(setContractPreset)} options={CONTRACT_PRESETS} />
          </FilterSidebarSection>
        </FilterSidebar>

        <div className="min-w-0 flex-1">
          <ActiveFilterChips chips={chips} onClearAll={clearAll} />

          <div className="m-4 rounded-lg border border-kvm-border bg-white shadow-sm">
            {result.error ? (
              <ErrorState message={result.error.message} onRetry={result.reload} />
            ) : result.loading && !result.data ? (
              <LoadingState label="Loading players…" />
            ) : (result.data?.players.length ?? 0) === 0 ? (
              <EmptyState
                icon={Users}
                title="No players match these filters"
                description="Try widening your search or clearing a filter."
              />
            ) : (
              <>
                <PlayerTable
                  players={result.data!.players}
                  sortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                />
                <Pagination
                  page={page}
                  pageCount={pageCount}
                  onChange={setPage}
                  totalItems={total}
                  pageSize={PAGE_SIZE}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default function PlayersPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading players…" />}>
      <PlayersPageContent />
    </Suspense>
  );
}
