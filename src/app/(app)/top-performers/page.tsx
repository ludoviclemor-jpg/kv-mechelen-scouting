"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { FilterSelect, ActiveFilterChips, type ActiveFilterChip } from "@/components/ui/FilterBar";
import { FilterSidebar, FilterSidebarSection } from "@/components/ui/FilterSidebar";
import { AgeRangeSlider } from "@/components/ui/AgeFilter";
import { PlayerCard } from "@/components/players/PlayerCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState, ErrorState } from "@/components/ui/LoadingState";
import {
  useAsync,
  MINIMUM_RATED_MATCHES,
  POSITIONS,
  POSITION_LABELS,
} from "@/lib/players-data";
import { fetchCombinedTopPerformers, combinedStats } from "@/lib/topPerformersData";
import { ageRangeLabel, matchesAgeRange, type AgeRange } from "@/lib/agePresets";
import { calculateAge } from "@/lib/utils";
import { TrendingUp } from "lucide-react";

type SortOption = "last5" | "latest" | "age";
const ALL_AGES: AgeRange = { min: null, max: null };

function uniqueSorted(values: (string | null)[]) {
  return Array.from(new Set(values.filter((v): v is string => v !== null))).sort((a, b) =>
    a.localeCompare(b)
  );
}

export default function TopPerformersPage() {
  const [position, setPosition] = useState("all");
  const [league, setLeague] = useState("all");
  const [nationality, setNationality] = useState("all");
  const [ageRange, setAgeRange] = useState<AgeRange>(ALL_AGES);
  const [sortBy, setSortBy] = useState<SortOption>("last5");

  // Merges the primary ratings slot (empty today — see
  // docs/SOFASCORE_PROVIDER.md) with the Sportmonks TEST integration
  // (docs/SPORTMONKS_INTEGRATION.md), never blended per player — each
  // entry carries its own source. Inherently small, fetched once and
  // filtered/sorted client-side, unlike the full Players list.
  const { data: entries, loading, error } = useAsync(() => fetchCombinedTopPerformers(200), []);

  const leagues = useMemo(() => uniqueSorted((entries ?? []).map((e) => e.player.league)), [entries]);
  const nationalities = useMemo(
    () => uniqueSorted((entries ?? []).map((e) => e.player.nationality)),
    [entries]
  );

  const filtered = useMemo(() => {
    return (entries ?? [])
      .filter((e) => {
        const p = e.player;
        if (position !== "all" && p.position !== position) return false;
        if (league !== "all" && p.league !== league) return false;
        if (nationality !== "all" && p.nationality !== nationality) return false;
        if (!matchesAgeRange(calculateAge(p.dateOfBirth), ageRange)) return false;
        return true;
      })
      .sort((a, b) => {
        const statsA = combinedStats(a);
        const statsB = combinedStats(b);
        if (sortBy === "last5") return (statsB.average ?? 0) - (statsA.average ?? 0);
        if (sortBy === "latest") return (statsB.latest ?? 0) - (statsA.latest ?? 0);
        return (calculateAge(a.player.dateOfBirth) ?? 0) - (calculateAge(b.player.dateOfBirth) ?? 0);
      });
  }, [entries, position, league, nationality, ageRange, sortBy]);

  const ageLabel = ageRangeLabel(ageRange);
  const chips: ActiveFilterChip[] = [];
  if (position !== "all") chips.push({ key: "position", label: "Position", value: POSITION_LABELS[position as keyof typeof POSITION_LABELS], onClear: () => setPosition("all") });
  if (league !== "all") chips.push({ key: "league", label: "League", value: league, onClear: () => setLeague("all") });
  if (nationality !== "all") chips.push({ key: "nationality", label: "Nationality", value: nationality, onClear: () => setNationality("all") });
  if (ageLabel) chips.push({ key: "age", label: "Age", value: ageLabel, onClear: () => setAgeRange(ALL_AGES) });
  function clearAll() {
    setPosition("all");
    setLeague("all");
    setNationality("all");
    setAgeRange(ALL_AGES);
  }

  return (
    <>
      <PageHeader
        title="Top Performers"
        description={`Players with at least ${MINIMUM_RATED_MATCHES} rated matches, ranked by recent form.`}
      />

      <div className="flex min-h-0 flex-1">
        <FilterSidebar activeCount={chips.length} onClearAll={clearAll}>
          <FilterSidebarSection label="Sort By">
            <FilterSelect
              stacked
              label=""
              value={sortBy}
              onChange={(v) => setSortBy(v as SortOption)}
              options={[
                { value: "last5", label: "Last 5 average" },
                { value: "latest", label: "Latest rating" },
                { value: "age", label: "Age" },
              ]}
            />
          </FilterSidebarSection>
          <FilterSidebarSection label="Position">
            <FilterSelect
              stacked
              label=""
              value={position}
              onChange={setPosition}
              options={[
                { value: "all", label: "All positions" },
                ...POSITIONS.map((p) => ({ value: p, label: POSITION_LABELS[p] })),
              ]}
            />
          </FilterSidebarSection>
          <FilterSidebarSection label="Age">
            <AgeRangeSlider range={ageRange} onChange={setAgeRange} />
          </FilterSidebarSection>
          <FilterSidebarSection label="League">
            <FilterSelect
              stacked
              label=""
              value={league}
              onChange={setLeague}
              options={[{ value: "all", label: "All leagues" }, ...leagues.map((l) => ({ value: l, label: l }))]}
            />
          </FilterSidebarSection>
          <FilterSidebarSection label="Nationality">
            <FilterSelect
              stacked
              label=""
              value={nationality}
              onChange={setNationality}
              options={[
                { value: "all", label: "All nationalities" },
                ...nationalities.map((n) => ({ value: n, label: n })),
              ]}
            />
          </FilterSidebarSection>
        </FilterSidebar>

        <div className="min-w-0 flex-1">
          <ActiveFilterChips chips={chips} onClearAll={clearAll} />

          <div className="m-4">
            {error ? (
              <div className="border border-kvm-border bg-white">
                <ErrorState message={error.message} />
              </div>
            ) : loading ? (
              <div className="border border-kvm-border bg-white">
                <LoadingState label="Loading top performers…" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="border border-kvm-border bg-white">
                <EmptyState
                  icon={TrendingUp}
                  title="No players match these filters"
                  description="Try widening your search or clearing a filter."
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map((entry) => (
                  <PlayerCard key={entry.player.id} player={entry.player} ratingOverride={entry.rating ?? undefined} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
