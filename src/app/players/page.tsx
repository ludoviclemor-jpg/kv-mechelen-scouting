"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { FilterBar, FilterSelect } from "@/components/ui/FilterBar";
import { SearchBar } from "@/components/ui/SearchBar";
import { Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  PlayerTable,
  type PlayerSortKey,
  type SortDirection,
} from "@/components/players/PlayerTable";
import { getAllPlayers, POSITIONS, POSITION_LABELS } from "@/lib/demo-data";
import { calculateAge } from "@/lib/utils";
import { Users } from "lucide-react";

const ALL_PLAYERS = getAllPlayers();
const PAGE_SIZE = 10;

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

function matchesAgeBand(age: number, band: string) {
  switch (band) {
    case "u21":
      return age < 21;
    case "21-23":
      return age >= 21 && age <= 23;
    case "24-26":
      return age >= 24 && age <= 26;
    case "27-29":
      return age >= 27 && age <= 29;
    case "30+":
      return age >= 30;
    default:
      return true;
  }
}

function matchesValueBand(value: number, band: string) {
  switch (band) {
    case "u1":
      return value < 1_000_000;
    case "1-3":
      return value >= 1_000_000 && value < 3_000_000;
    case "3-6":
      return value >= 3_000_000 && value < 6_000_000;
    case "6+":
      return value >= 6_000_000;
    default:
      return true;
  }
}

function matchesContractBand(expiryIso: string, band: string) {
  const year = new Date(expiryIso).getFullYear();
  switch (band) {
    case "2026":
      return year === 2026;
    case "2027":
      return year === 2027;
    case "2028":
      return year === 2028;
    case "2029+":
      return year >= 2029;
    default:
      return true;
  }
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
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

  const nationalities = useMemo(
    () => uniqueSorted(ALL_PLAYERS.map((p) => p.nationality)),
    []
  );
  const leagues = useMemo(() => uniqueSorted(ALL_PLAYERS.map((p) => p.league)), []);
  const clubs = useMemo(() => uniqueSorted(ALL_PLAYERS.map((p) => p.club)), []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return ALL_PLAYERS.filter((p) => {
      if (query) {
        const haystack = `${p.name} ${p.club} ${p.nationality}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (position !== "all" && p.position !== position) return false;
      if (nationality !== "all" && p.nationality !== nationality) return false;
      if (league !== "all" && p.league !== league) return false;
      if (club !== "all" && p.club !== club) return false;
      if (!matchesAgeBand(calculateAge(p.dateOfBirth), ageBand)) return false;
      if (!matchesValueBand(p.marketValueEUR, valueBand)) return false;
      if (!matchesContractBand(p.contractExpiry, contractBand)) return false;
      return true;
    });
  }, [search, position, nationality, league, club, ageBand, valueBand, contractBand]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "age":
          cmp = calculateAge(a.dateOfBirth) - calculateAge(b.dateOfBirth);
          break;
        case "position":
          cmp = a.position.localeCompare(b.position);
          break;
        case "nationality":
          cmp = a.nationality.localeCompare(b.nationality);
          break;
        case "club":
          cmp = a.club.localeCompare(b.club);
          break;
        case "league":
          cmp = a.league.localeCompare(b.league);
          break;
        case "marketValueEUR":
          cmp = a.marketValueEUR - b.marketValueEUR;
          break;
        case "contractExpiry":
          cmp = a.contractExpiry.localeCompare(b.contractExpiry);
          break;
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortKey, sortDirection]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageItems = sorted.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
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

  return (
    <>
      <PageHeader
        title="Player Database"
        description={`${sorted.length} of ${ALL_PLAYERS.length} players`}
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
            ...nationalities.map((n) => ({ value: n, label: n })),
          ]}
        />
        <FilterSelect
          label="League"
          value={league}
          onChange={resetPage(setLeague)}
          options={[
            { value: "all", label: "All leagues" },
            ...leagues.map((l) => ({ value: l, label: l })),
          ]}
        />
        <FilterSelect
          label="Club"
          value={club}
          onChange={resetPage(setClub)}
          options={[
            { value: "all", label: "All clubs" },
            ...clubs.map((c) => ({ value: c, label: c })),
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
        {pageItems.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No players match these filters"
            description="Try widening your search or clearing a filter."
          />
        ) : (
          <>
            <PlayerTable
              players={pageItems}
              sortKey={sortKey}
              sortDirection={sortDirection}
              onSort={handleSort}
            />
            <Pagination
              page={currentPage}
              pageCount={pageCount}
              onChange={setPage}
              totalItems={sorted.length}
              pageSize={PAGE_SIZE}
            />
          </>
        )}
      </div>
    </>
  );
}
