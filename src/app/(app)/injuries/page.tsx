"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { FilterSelect, ActiveFilterChips, type ActiveFilterChip } from "@/components/ui/FilterBar";
import { FilterSidebar, FilterSidebarSection } from "@/components/ui/FilterSidebar";
import { InjuryTrackerTable } from "@/components/players/InjuryTrackerTable";
import { LoadingState, ErrorState } from "@/components/ui/LoadingState";
import { fetchCurrentlyInjuredPlayers, useAsync, POSITIONS, POSITION_LABELS } from "@/lib/players-data";

function uniqueSorted(values: (string | null)[]) {
  return Array.from(new Set(values.filter((v): v is string => v !== null))).sort((a, b) => a.localeCompare(b));
}

export default function InjuriesPage() {
  const [position, setPosition] = useState("all");
  const [nationality, setNationality] = useState("all");
  const [league, setLeague] = useState("all");

  // The real currently-injured pool is inherently small (see
  // fetchCurrentlyInjuredPlayers' own comment on coverage) — fetched
  // once, unrestricted by tier (maxTierLevel=null), filtered client-side,
  // same convention as African Debutants.
  const { data: injured, loading, error } = useAsync(() => fetchCurrentlyInjuredPlayers(null), []);

  const nationalities = useMemo(() => uniqueSorted((injured ?? []).map((r) => r.player.nationality)), [injured]);
  const leagues = useMemo(() => uniqueSorted((injured ?? []).map((r) => r.player.league)), [injured]);

  const filtered = useMemo(() => {
    return (injured ?? []).filter((r) => {
      if (position !== "all" && r.player.position !== position) return false;
      if (nationality !== "all" && r.player.nationality !== nationality) return false;
      if (league !== "all" && r.player.league !== league) return false;
      return true;
    });
  }, [injured, position, nationality, league]);

  const chips: ActiveFilterChip[] = [];
  if (position !== "all") chips.push({ key: "position", label: "Position", value: POSITION_LABELS[position as keyof typeof POSITION_LABELS], onClear: () => setPosition("all") });
  if (nationality !== "all") chips.push({ key: "nationality", label: "Nationality", value: nationality, onClear: () => setNationality("all") });
  if (league !== "all") chips.push({ key: "league", label: "League", value: league, onClear: () => setLeague("all") });
  function clearAll() {
    setPosition("all");
    setNationality("all");
    setLeague("all");
  }

  return (
    <>
      <PageHeader
        title="Injury Tracker"
        description={
          injured
            ? `${filtered.length} of ${injured.length} currently injured players, real data from each player's synced injury history.`
            : "Real, currently-injured players — never a placeholder or estimate."
        }
      />

      <div className="flex min-h-0 flex-1">
        <FilterSidebar activeCount={chips.length} onClearAll={clearAll}>
          <FilterSidebarSection label="Position">
            <FilterSelect
              stacked
              label=""
              value={position}
              onChange={setPosition}
              options={[{ value: "all", label: "All positions" }, ...POSITIONS.map((p) => ({ value: p, label: POSITION_LABELS[p] }))]}
            />
          </FilterSidebarSection>
          <FilterSidebarSection label="Nationality">
            <FilterSelect
              stacked
              label=""
              value={nationality}
              onChange={setNationality}
              options={[{ value: "all", label: "All nationalities" }, ...nationalities.map((n) => ({ value: n, label: n }))]}
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
        </FilterSidebar>

        <div className="min-w-0 flex-1">
          <ActiveFilterChips chips={chips} onClearAll={clearAll} />

          <div className="m-4 border border-kvm-border bg-white shadow-sm">
            {error ? <ErrorState message={error.message} /> : loading ? <LoadingState label="Loading injury tracker…" /> : <InjuryTrackerTable injured={filtered} />}
          </div>
        </div>
      </div>
    </>
  );
}
