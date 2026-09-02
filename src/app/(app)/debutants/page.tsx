"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { FilterSelect, ActiveFilterChips, type ActiveFilterChip } from "@/components/ui/FilterBar";
import { FilterSidebar, FilterSidebarSection } from "@/components/ui/FilterSidebar";
import { AgeRangeSlider } from "@/components/ui/AgeFilter";
import { DebutantTable } from "@/components/players/DebutantTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState, ErrorState } from "@/components/ui/LoadingState";
import {
  fetchAfricanDebutants,
  useAsync,
  POSITIONS,
  POSITION_LABELS,
} from "@/lib/players-data";
import { ageRangeLabel, matchesAgeRange, type AgeRange } from "@/lib/agePresets";
import { calculateAge } from "@/lib/utils";
import { Globe2 } from "lucide-react";

const ALL_AGES: AgeRange = { min: null, max: null };

function uniqueSorted(values: (string | null)[]) {
  return Array.from(new Set(values.filter((v): v is string => v !== null))).sort((a, b) =>
    a.localeCompare(b)
  );
}

export default function DebutantsPage() {
  const [country, setCountry] = useState("all");
  const [league, setLeague] = useState("all");
  const [position, setPosition] = useState("all");
  const [ageRange, setAgeRange] = useState<AgeRange>(ALL_AGES);
  const [sortByDebutDate, setSortByDebutDate] = useState<"newest" | "oldest">(
    "newest"
  );

  // The full pool of African-debutant candidates — inherently small (this
  // season's debuts, one nationality group, one league region), so unlike
  // the Players list this doesn't need server-side filtering: fetched once,
  // filtered/sorted in the browser exactly as it always has been.
  const { data: allDebutants, loading, error } = useAsync(() => fetchAfricanDebutants(), []);

  const countries = useMemo(
    () => uniqueSorted((allDebutants ?? []).map((p) => p.nationality)),
    [allDebutants]
  );
  const leagues = useMemo(
    () => uniqueSorted((allDebutants ?? []).map((p) => p.league)),
    [allDebutants]
  );

  const filtered = useMemo(() => {
    return (allDebutants ?? [])
      .filter((p) => {
        if (country !== "all" && p.nationality !== country) return false;
        if (league !== "all" && p.league !== league) return false;
        if (position !== "all" && p.position !== position) return false;
        if (!matchesAgeRange(calculateAge(p.dateOfBirth), ageRange)) return false;
        return true;
      })
      .sort((a, b) => {
        const cmp = (a.debutDate ?? "").localeCompare(b.debutDate ?? "");
        return sortByDebutDate === "newest" ? -cmp : cmp;
      });
  }, [allDebutants, country, league, position, ageRange, sortByDebutDate]);

  const ageLabel = ageRangeLabel(ageRange);
  const chips: ActiveFilterChip[] = [];
  if (country !== "all") chips.push({ key: "country", label: "Nationality", value: country, onClear: () => setCountry("all") });
  if (league !== "all") chips.push({ key: "league", label: "League", value: league, onClear: () => setLeague("all") });
  if (position !== "all") chips.push({ key: "position", label: "Position", value: POSITION_LABELS[position as keyof typeof POSITION_LABELS], onClear: () => setPosition("all") });
  if (ageLabel) chips.push({ key: "age", label: "Age", value: ageLabel, onClear: () => setAgeRange(ALL_AGES) });
  function clearAll() {
    setCountry("all");
    setLeague("all");
    setPosition("all");
    setAgeRange(ALL_AGES);
  }

  return (
    <>
      <PageHeader
        title="African Debutants"
        description="U23 senior first-team debuts by African players worldwide, 1st and 2nd division clubs only (youth &amp; reserve teams excluded)."
      />

      <div className="flex min-h-0 flex-1">
        <FilterSidebar activeCount={chips.length} onClearAll={clearAll}>
          <FilterSidebarSection label="Country">
            <FilterSelect
              stacked
              label=""
              value={country}
              onChange={setCountry}
              options={[{ value: "all", label: "All countries" }, ...countries.map((c) => ({ value: c, label: c }))]}
            />
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
          <FilterSidebarSection label="Debut Date">
            <FilterSelect
              stacked
              label=""
              value={sortByDebutDate}
              onChange={(v) => setSortByDebutDate(v as "newest" | "oldest")}
              options={[
                { value: "newest", label: "Newest first" },
                { value: "oldest", label: "Oldest first" },
              ]}
            />
          </FilterSidebarSection>
        </FilterSidebar>

        <div className="min-w-0 flex-1">
          <ActiveFilterChips chips={chips} onClearAll={clearAll} />

          <div className="m-4 border border-kvm-border bg-white">
            {error ? (
              <ErrorState message={error.message} />
            ) : loading ? (
              <LoadingState label="Loading debutants…" />
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={Globe2}
                title="No debutants match these filters"
                description="Adjust the filters, or check back after the next sync."
              />
            ) : (
              <DebutantTable players={filtered} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
