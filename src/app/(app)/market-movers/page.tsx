"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { FilterSelect, ActiveFilterChips, type ActiveFilterChip } from "@/components/ui/FilterBar";
import { FilterSidebar, FilterSidebarSection } from "@/components/ui/FilterSidebar";
import { MarketMoversTable } from "@/components/players/MarketMoversTable";
import { LoadingState, ErrorState } from "@/components/ui/LoadingState";
import { fetchMarketValueMovers, useAsync, POSITIONS, POSITION_LABELS } from "@/lib/players-data";
import { cn } from "@/lib/utils";

const LOOKBACK_OPTIONS = [
  { value: "90", label: "Last 3 months" },
  { value: "180", label: "Last 6 months" },
  { value: "365", label: "Last 12 months" },
];
const DEFAULT_LOOKBACK = "180";
const DEFAULT_MAX_TIER = 2; // top 2 divisions — same quality bar as Loan Watch/Contract Watch

function uniqueSorted(values: (string | null)[]) {
  return Array.from(new Set(values.filter((v): v is string => v !== null))).sort((a, b) => a.localeCompare(b));
}

export default function MarketMoversPage() {
  const [direction, setDirection] = useState<"risers" | "fallers">("risers");
  const [lookbackDays, setLookbackDays] = useState(DEFAULT_LOOKBACK);
  const [position, setPosition] = useState("all");
  const [league, setLeague] = useState("all");

  const {
    data: movers,
    loading,
    error,
  } = useAsync(
    () => fetchMarketValueMovers(direction, Number(lookbackDays), DEFAULT_MAX_TIER, 100),
    [direction, lookbackDays]
  );

  const leagues = useMemo(() => uniqueSorted((movers ?? []).map((m) => m.player.league)), [movers]);

  const filtered = useMemo(() => {
    return (movers ?? []).filter((m) => {
      if (position !== "all" && m.player.position !== position) return false;
      if (league !== "all" && m.player.league !== league) return false;
      return true;
    });
  }, [movers, position, league]);

  const chips: ActiveFilterChip[] = [];
  if (lookbackDays !== DEFAULT_LOOKBACK) {
    chips.push({
      key: "lookback",
      label: "Window",
      value: LOOKBACK_OPTIONS.find((o) => o.value === lookbackDays)?.label ?? lookbackDays,
      onClear: () => setLookbackDays(DEFAULT_LOOKBACK),
    });
  }
  if (position !== "all") chips.push({ key: "position", label: "Position", value: POSITION_LABELS[position as keyof typeof POSITION_LABELS], onClear: () => setPosition("all") });
  if (league !== "all") chips.push({ key: "league", label: "League", value: league, onClear: () => setLeague("all") });
  function clearAll() {
    setLookbackDays(DEFAULT_LOOKBACK);
    setPosition("all");
    setLeague("all");
  }

  return (
    <>
      <PageHeader
        title="Market Value Movers"
        description="Biggest market value risers and fallers, top 2 divisions per country — real dated points from each player's synced value history, never a synthesized trend."
      />

      <div className="flex min-h-0 flex-1">
        <FilterSidebar activeCount={chips.length} onClearAll={clearAll}>
          <FilterSidebarSection label="Direction">
            <div className="flex rounded-sm border border-kvm-border">
              <button
                type="button"
                onClick={() => setDirection("risers")}
                className={cn(
                  "flex-1 px-2 py-1.5 text-xs font-semibold transition-colors",
                  direction === "risers" ? "bg-kvm-red text-white" : "bg-white text-gray-500 hover:bg-gray-50"
                )}
              >
                Risers
              </button>
              <button
                type="button"
                onClick={() => setDirection("fallers")}
                className={cn(
                  "flex-1 border-l border-kvm-border px-2 py-1.5 text-xs font-semibold transition-colors",
                  direction === "fallers" ? "bg-kvm-red text-white" : "bg-white text-gray-500 hover:bg-gray-50"
                )}
              >
                Fallers
              </button>
            </div>
          </FilterSidebarSection>
          <FilterSidebarSection label="Window">
            <FilterSelect stacked label="" value={lookbackDays} onChange={setLookbackDays} options={LOOKBACK_OPTIONS} />
          </FilterSidebarSection>
          <FilterSidebarSection label="Position">
            <FilterSelect
              stacked
              label=""
              value={position}
              onChange={setPosition}
              options={[{ value: "all", label: "All positions" }, ...POSITIONS.map((p) => ({ value: p, label: POSITION_LABELS[p] }))]}
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
            {error ? (
              <ErrorState message={error.message} />
            ) : loading ? (
              <LoadingState label="Loading market movers…" />
            ) : (
              <MarketMoversTable key={direction} movers={filtered} direction={direction} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
