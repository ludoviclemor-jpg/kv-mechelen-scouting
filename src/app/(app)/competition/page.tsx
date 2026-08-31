"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Trophy, Users, Calendar, MapPin } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { FilterBar, FilterSelect } from "@/components/ui/FilterBar";
import { SearchBar } from "@/components/ui/SearchBar";
import { Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState, ErrorState } from "@/components/ui/LoadingState";
import { PlayerTable, type PlayerSortKey, type SortDirection } from "@/components/players/PlayerTable";
import { fetchCompetitionById, type Competition } from "@/lib/competitions-data";
import { fetchPlayersPage, POSITIONS, POSITION_LABELS, useAsync } from "@/lib/players-data";

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

function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function CompetitionMeta({ competition }: { competition: Competition }) {
  return (
    <div className="grid grid-cols-2 gap-3 border-b border-kvm-border bg-white p-5 sm:grid-cols-4">
      <div>
        <dt className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          <MapPin size={11} aria-hidden="true" /> Country
        </dt>
        <dd className="mt-0.5 text-sm font-medium text-kvm-ink">{competition.area ?? "Unknown"}</dd>
      </div>
      <div>
        <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Type / Tier</dt>
        <dd className="mt-0.5 text-sm font-medium text-kvm-ink">{competition.levelDefinition ?? "Unknown"}</dd>
      </div>
      <div>
        <dt className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          <Users size={11} aria-hidden="true" /> Teams
        </dt>
        <dd className="mt-0.5 text-sm font-medium text-kvm-ink">{competition.teamCount || "—"}</dd>
      </div>
      <div>
        <dt className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          <Calendar size={11} aria-hidden="true" /> Current season
        </dt>
        <dd className="mt-0.5 text-sm font-medium text-kvm-ink">{competition.currentSeason ?? "—"}</dd>
      </div>
      {competition.availableSeasons.length > 0 ? (
        <div className="col-span-2 sm:col-span-4">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Available seasons</dt>
          <dd className="mt-0.5 text-sm text-gray-600">{competition.availableSeasons.join(", ")}</dd>
        </div>
      ) : null}
    </div>
  );
}

function CompetitionContent() {
  const id = useSearchParams().get("id");

  const [search, setSearch] = useState("");
  const [position, setPosition] = useState("all");
  const [ageBand, setAgeBand] = useState("all");
  const [valueBand, setValueBand] = useState("all");
  const [africanOnly, setAfricanOnly] = useState(false);
  const [sortKey, setSortKey] = useState<PlayerSortKey>("marketValueEUR");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebounced(search);

  const competitionResult = useAsync(() => (id ? fetchCompetitionById(id) : Promise.resolve(null)), [id]);

  const playersResult = useAsync(
    () =>
      id
        ? fetchPlayersPage({
            competitionId: id,
            search: debouncedSearch,
            position,
            ageBand,
            valueBand,
            africanOnly,
            sortKey,
            sortDirection,
            page,
            pageSize: PAGE_SIZE,
          })
        : Promise.resolve({ players: [], total: 0 }),
    [id, debouncedSearch, position, ageBand, valueBand, africanOnly, sortKey, sortDirection, page]
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

  if (!id) {
    return (
      <>
        <PageHeader title="Competition" />
        <div className="p-8">
          <div className="border border-kvm-border bg-white">
            <EmptyState icon={Trophy} title="No competition selected" description="Open a competition from the Competitions page." />
          </div>
        </div>
      </>
    );
  }

  if (competitionResult.loading) {
    return (
      <>
        <PageHeader title="Competition" />
        <div className="p-8">
          <div className="border border-kvm-border bg-white">
            <LoadingState label="Loading competition…" />
          </div>
        </div>
      </>
    );
  }

  if (competitionResult.error) {
    return (
      <>
        <PageHeader title="Competition" />
        <div className="p-8">
          <div className="border border-kvm-border bg-white">
            <ErrorState message={competitionResult.error.message} />
          </div>
        </div>
      </>
    );
  }

  const competition = competitionResult.data;
  if (!competition) {
    return (
      <>
        <PageHeader title="Competition" />
        <div className="p-8">
          <div className="border border-kvm-border bg-white">
            <EmptyState icon={Trophy} title="Competition not found" description="It may no longer be part of the SCOUTASTIC catalog." />
          </div>
        </div>
      </>
    );
  }

  const total = playersResult.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title={competition.name ?? "Unnamed competition"}
        description={`${competition.area ?? "Unknown country"} · ${competition.levelDefinition ?? ""}`}
      />

      <CompetitionMeta competition={competition} />

      <div className="flex items-center justify-between gap-4 border-b border-kvm-border bg-white px-8 py-3">
        <SearchBar value={search} onChange={resetPage(setSearch)} placeholder="Search player or club..." />
      </div>

      <FilterBar>
        <FilterSelect
          label="Position"
          value={position}
          onChange={resetPage(setPosition)}
          options={[{ value: "all", label: "All positions" }, ...POSITIONS.map((p) => ({ value: p, label: POSITION_LABELS[p] }))]}
        />
        <FilterSelect label="Age" value={ageBand} onChange={resetPage(setAgeBand)} options={AGE_BANDS} />
        <FilterSelect label="Market Value" value={valueBand} onChange={resetPage(setValueBand)} options={VALUE_BANDS} />
        <FilterSelect
          label="Nationality"
          value={africanOnly ? "african" : "all"}
          onChange={resetPage((v) => setAfricanOnly(v === "african"))}
          options={[
            { value: "all", label: "All nationalities" },
            { value: "african", label: "African only" },
          ]}
        />
      </FilterBar>

      <div className="mx-8 my-6 border border-kvm-border bg-white">
        {playersResult.error ? (
          <ErrorState message={playersResult.error.message} />
        ) : playersResult.loading && !playersResult.data ? (
          <LoadingState label="Loading players…" />
        ) : total === 0 ? (
          <EmptyState
            icon={Users}
            title="No players found for this competition"
            description="Either no squad has been crawled yet, or no player matches these filters."
          />
        ) : (
          <>
            <PlayerTable players={playersResult.data!.players} sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
            <Pagination page={page} pageCount={pageCount} onChange={setPage} totalItems={total} pageSize={PAGE_SIZE} />
          </>
        )}
      </div>
    </>
  );
}

export default function CompetitionPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading competition…" />}>
      <CompetitionContent />
    </Suspense>
  );
}
