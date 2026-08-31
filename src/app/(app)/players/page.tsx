"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { FilterBar, FilterSelect } from "@/components/ui/FilterBar";
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
  POSITIONS,
  POSITION_LABELS,
  useAsync,
} from "@/lib/players-data";
import { Users } from "lucide-react";

const PAGE_SIZE = 25;

const AGE_BANDS = [
  { value: "all", label: "All ages" },
  { value: "u21", label: "Under 21" },
  { value: "21-23", label: "21 – 23" },
  { value: "24-26", label: "24 – 26" },
  { value: "27-29", label: "27 – 29" },
  { value: "30+", label: "30+" },
];

const VALUE_BANDS = [
  { value: "all", label: "All values" },
  { value: "u1", label: "Under €1M" },
  { value: "1-3", label: "€1M – €3M" },
  { value: "3-6", label: "€3M – €6M" },
  { value: "6+", label: "€6M+" },
];

const CONTRACT_BANDS = [
  { value: "all", label: "All contracts" },
  { value: "2026", label: "Expires 2026" },
  { value: "2027", label: "Expires 2027" },
  { value: "2028", label: "Expires 2028" },
  { value: "2029+", label: "2029 or later" },
];

/** 300ms — enough to not fire a query per keystroke, not so much it feels laggy. */
function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export default function PlayersPage() {
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState("all");
  const [nationality, setNationality] = useState("all");
  const [league, setLeague] = useState("all");
  const [club, setClub] = useState("all");
  const [ageBand, setAgeBand] = useState("all");
  const [valueBand, setValueBand] = useState("all");
  const [contractBand, setContractBand] = useState("all");
  const [sortKey, setSortKey] = useState<PlayerSortKey>("marketValueEUR");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebounced(search);

  const filterOptions = useAsync(() => fetchFilterOptions(), []);

  const result = useAsync(
    () =>
      fetchPlayersPage({
        search: debouncedSearch,
        position,
        nationality,
        league,
        club,
        ageBand,
        valueBand,
        contractBand,
        sortKey,
        sortDirection,
        page,
        pageSize: PAGE_SIZE,
      }),
    [debouncedSearch, position, nationality, league, club, ageBand, valueBand, contractBand, sortKey, sortDirection, page]
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

  const total = result.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Player Database"
        description={result.data ? `${total.toLocaleString()} players` : undefined}
      />

      <div className="flex items-center justify-between gap-4 border-b border-kvm-border bg-white px-8 py-3">
        <SearchBar
          value={search}
          onChange={resetPage(setSearch)}
          placeholder="Search player, club or nationality..."
        />
      </div>

      <FilterBar>
        <FilterSelect
          label="Position"
          value={position}
          onChange={resetPage(setPosition)}
          options={[
            { value: "all", label: "All positions" },
            ...POSITIONS.map((p) => ({ value: p, label: POSITION_LABELS[p] })),
          ]}
        />
        <FilterSelect
          label="Age"
          value={ageBand}
          onChange={resetPage(setAgeBand)}
          options={AGE_BANDS}
        />
        <FilterSelect
          label="Nationality"
          value={nationality}
          onChange={resetPage(setNationality)}
          options={[
            { value: "all", label: "All nationalities" },
            ...(filterOptions.data?.nationalities ?? []).map((n) => ({ value: n, label: n })),
          ]}
        />
        <FilterSelect
          label="League"
          value={league}
          onChange={resetPage(setLeague)}
          options={[
            { value: "all", label: "All leagues" },
            ...(filterOptions.data?.leagues ?? []).map((l) => ({ value: l, label: l })),
          ]}
        />
        <FilterSelect
          label="Club"
          value={club}
          onChange={resetPage(setClub)}
          options={[
            { value: "all", label: "All clubs" },
            ...(filterOptions.data?.clubs ?? []).map((c) => ({ value: c, label: c })),
          ]}
        />
        <FilterSelect
          label="Market Value"
          value={valueBand}
          onChange={resetPage(setValueBand)}
          options={VALUE_BANDS}
        />
        <FilterSelect
          label="Contract"
          value={contractBand}
          onChange={resetPage(setContractBand)}
          options={CONTRACT_BANDS}
        />
      </FilterBar>

      <div className="mx-8 my-6 border border-kvm-border bg-white">
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
    </>
  );
}
