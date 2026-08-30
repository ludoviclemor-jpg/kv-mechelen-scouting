"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { FilterBar, FilterSelect } from "@/components/ui/FilterBar";
import { PlayerCard } from "@/components/players/PlayerCard";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  getAllPlayers,
  computeMatchStats,
  meetsMinimumMatches,
  MINIMUM_RATED_MATCHES,
  POSITIONS,
  POSITION_LABELS,
} from "@/lib/demo-data";
import { calculateAge } from "@/lib/utils";
import { TrendingUp } from "lucide-react";

const ALL_PLAYERS = getAllPlayers();

type SortOption = "last5" | "latest" | "age";

const AGE_BANDS = [
  { value: "all", label: "All ages" },
  { value: "u23", label: "Under 23" },
  { value: "23-27", label: "23 – 27" },
  { value: "28+", label: "28+" },
];

function matchesAgeBand(age: number, band: string) {
  switch (band) {
    case "u23":
      return age < 23;
    case "23-27":
      return age >= 23 && age <= 27;
    case "28+":
      return age >= 28;
    default:
      return true;
  }
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

export default function TopPerformersPage() {
  const [position, setPosition] = useState("all");
  const [league, setLeague] = useState("all");
  const [nationality, setNationality] = useState("all");
  const [ageBand, setAgeBand] = useState("all");
  const [sortBy, setSortBy] = useState<SortOption>("last5");

  const leagues = useMemo(() => uniqueSorted(ALL_PLAYERS.map((p) => p.league)), []);
  const nationalities = useMemo(
    () => uniqueSorted(ALL_PLAYERS.map((p) => p.nationality)),
    []
  );

  const rated = useMemo(
    () => ALL_PLAYERS.filter((p) => meetsMinimumMatches(p.matches)),
    []
  );

  const filtered = useMemo(() => {
    return rated
      .filter((p) => {
        if (position !== "all" && p.position !== position) return false;
        if (league !== "all" && p.league !== league) return false;
        if (nationality !== "all" && p.nationality !== nationality) return false;
        if (!matchesAgeBand(calculateAge(p.dateOfBirth), ageBand)) return false;
        return true;
      })
      .sort((a, b) => {
        const statsA = computeMatchStats(a.matches);
        const statsB = computeMatchStats(b.matches);
        if (sortBy === "last5") return (statsB.average ?? 0) - (statsA.average ?? 0);
        if (sortBy === "latest") return (statsB.latest ?? 0) - (statsA.latest ?? 0);
        return calculateAge(a.dateOfBirth) - calculateAge(b.dateOfBirth);
      });
  }, [rated, position, league, nationality, ageBand, sortBy]);

  return (
    <>
      <PageHeader
        title="Top Performers"
        description={`Players with at least ${MINIMUM_RATED_MATCHES} rated matches, ranked by recent SofaScore form.`}
      />

      <FilterBar>
        <FilterSelect
          label="Sort by"
          value={sortBy}
          onChange={(v) => setSortBy(v as SortOption)}
          options={[
            { value: "last5", label: "Last 5 average" },
            { value: "latest", label: "Latest rating" },
            { value: "age", label: "Age" },
          ]}
        />
        <FilterSelect
          label="Position"
          value={position}
          onChange={setPosition}
          options={[
            { value: "all", label: "All positions" },
            ...POSITIONS.map((p) => ({ value: p, label: POSITION_LABELS[p] })),
          ]}
        />
        <FilterSelect
          label="League"
          value={league}
          onChange={setLeague}
          options={[{ value: "all", label: "All leagues" }, ...leagues.map((l) => ({ value: l, label: l }))]}
        />
        <FilterSelect
          label="Nationality"
          value={nationality}
          onChange={setNationality}
          options={[
            { value: "all", label: "All nationalities" },
            ...nationalities.map((n) => ({ value: n, label: n })),
          ]}
        />
        <FilterSelect label="Age" value={ageBand} onChange={setAgeBand} options={AGE_BANDS} />
      </FilterBar>

      <div className="p-8">
        {filtered.length === 0 ? (
          <div className="border border-kvm-border bg-white">
            <EmptyState
              icon={TrendingUp}
              title="No players match these filters"
              description="Try widening your search or clearing a filter."
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {filtered.map((player) => (
              <PlayerCard key={player.id} player={player} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
