"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { FilterSelect, ActiveFilterChips, type ActiveFilterChip } from "@/components/ui/FilterBar";
import { FilterSidebar, FilterSidebarSection } from "@/components/ui/FilterSidebar";
import { AgeRangeSlider } from "@/components/ui/AgeFilter";
import { SearchBar } from "@/components/ui/SearchBar";
import { Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState, ErrorState } from "@/components/ui/LoadingState";
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
import { Users } from "lucide-react";

const PAGE_SIZE = 25;
const ALL_AGES: AgeRange = { min: null, max: null };

const VALUE_BANDS = [
  { value: "all", label: "All values" },
  { value: "u1", label: "Under €1M" },
  { value: "1-3", label: "€1M – €3M" },
  { value: "3-6", label: "€3M – €6M" },
  { value: "6+", label: "€6M+" },
];

const VALUE_BAND_LABELS: Record<string, string> = Object.fromEntries(VALUE_BANDS.map((b) => [b.value, b.label]));

const CONTRACT_BANDS = [
  { value: "all", label: "All contracts" },
  { value: "2026", label: "Expires 2026" },
  { value: "2027", label: "Expires 2027" },
  { value: "2028", label: "Expires 2028" },
  { value: "2029+", label: "2029 or later" },
];

const CONTRACT_BAND_LABELS: Record<string, string> = Object.fromEntries(CONTRACT_BANDS.map((b) => [b.value, b.label]));

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
  // Initial values from a global-search suggestion (?search=, ?nationality=)
  // — see src/components/layout/GlobalSearch.tsx. Read once on mount, not
  // kept in sync afterward — this page's own filters take over from there.
  const params = useSearchParams();
  const [search, setSearch] = useState(() => params.get("search") ?? "");
  const [position, setPosition] = useState("all");
  const [nationality, setNationality] = useState(() => params.get("nationality") ?? "all");
  // Cascading: country -> competition -> club. Changing a parent always
  // clears its children (see the on*Change handlers below) so the UI can
  // never be left showing options that don't actually apply anymore.
  const [country, setCountry] = useState("all");
  const [competitionId, setCompetitionId] = useState("all");
  const [club, setClub] = useState("all");
  const [ageRange, setAgeRange] = useState<AgeRange>(ALL_AGES);
  const [valueBand, setValueBand] = useState("all");
  const [contractBand, setContractBand] = useState("all");
  const [sortKey, setSortKey] = useState<PlayerSortKey>("marketValueEUR");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);

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
        valueBand,
        contractBand,
        sortKey,
        sortDirection,
        page,
        pageSize: PAGE_SIZE,
      }),
    [debouncedSearch, position, nationality, country, competitionId, club, ageRange, valueBand, contractBand, sortKey, sortDirection, page]
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
    setValueBand("all");
    setContractBand("all");
    setPage(1);
  }

  const ageLabel = ageRangeLabel(ageRange);
  const competitionName = competitionOptions.data?.find((c) => c.id === competitionId)?.name ?? competitionId;

  const chips: ActiveFilterChip[] = useMemo(() => {
    const list: ActiveFilterChip[] = [];
    if (position !== "all") list.push({ key: "position", label: "Position", value: POSITION_LABELS[position as keyof typeof POSITION_LABELS], onClear: () => resetPage(setPosition)("all") });
    if (nationality !== "all") list.push({ key: "nationality", label: "Nationality", value: nationality, onClear: () => resetPage(setNationality)("all") });
    if (country !== "all") list.push({ key: "country", label: "Country", value: country, onClear: () => handleCountryChange("all") });
    if (competitionId !== "all") list.push({ key: "competition", label: "Competition", value: competitionName, onClear: () => handleCompetitionChange("all") });
    if (club !== "all") list.push({ key: "club", label: "Club", value: club, onClear: () => resetPage(setClub)("all") });
    if (ageLabel) list.push({ key: "age", label: "Age", value: ageLabel, onClear: () => resetPage(setAgeRange)(ALL_AGES) });
    if (valueBand !== "all") list.push({ key: "value", label: "Value", value: VALUE_BAND_LABELS[valueBand], onClear: () => resetPage(setValueBand)("all") });
    if (contractBand !== "all") list.push({ key: "contract", label: "Contract", value: CONTRACT_BAND_LABELS[contractBand], onClear: () => resetPage(setContractBand)("all") });
    return list;
  }, [position, nationality, country, competitionId, competitionName, club, ageLabel, valueBand, contractBand]);

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
            <FilterSelect stacked label="" value={valueBand} onChange={resetPage(setValueBand)} options={VALUE_BANDS} />
          </FilterSidebarSection>

          <FilterSidebarSection label="Contract Expiry">
            <FilterSelect stacked label="" value={contractBand} onChange={resetPage(setContractBand)} options={CONTRACT_BANDS} />
          </FilterSidebarSection>
        </FilterSidebar>

        <div className="min-w-0 flex-1">
          <ActiveFilterChips chips={chips} onClearAll={clearAll} />

          <div className="m-4 border border-kvm-border bg-white">
            {result.error ? (
              <ErrorState message={result.error.message} />
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
