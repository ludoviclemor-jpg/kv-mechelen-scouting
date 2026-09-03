"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { FilterSelect, ActiveFilterChips, type ActiveFilterChip } from "@/components/ui/FilterBar";
import { FilterSidebar, FilterSidebarSection } from "@/components/ui/FilterSidebar";
import { AgeRangeSlider } from "@/components/ui/AgeFilter";
import { ContractWatchTable } from "@/components/players/ContractWatchTable";
import { LoadingState, ErrorState } from "@/components/ui/LoadingState";
import {
  fetchContractWatchCandidates,
  fetchFilterOptions,
  fetchCompetitionsInCountry,
  fetchClubsInCompetition,
  useAsync,
  POSITIONS,
  POSITION_LABELS,
  type ContractWatchWindow,
} from "@/lib/players-data";
import { ageRangeLabel, type AgeRange } from "@/lib/agePresets";

const ALL_AGES: AgeRange = { min: null, max: null };

const WINDOW_OPTIONS: { value: ContractWatchWindow; label: string }[] = [
  { value: "expiring6", label: "Expiring within 6 months" },
  { value: "expiring12", label: "Expiring within 12 months" },
  { value: "expired", label: "Already expired (last 12 months)" },
];
const WINDOW_LABELS: Record<ContractWatchWindow, string> = Object.fromEntries(WINDOW_OPTIONS.map((o) => [o.value, o.label])) as Record<
  ContractWatchWindow,
  string
>;

const VALUE_BANDS = [
  { value: "all", label: "All values" },
  { value: "u1", label: "Under €1M" },
  { value: "1-3", label: "€1M – €3M" },
  { value: "3-6", label: "€3M – €6M" },
  { value: "6+", label: "€6M+" },
];
const VALUE_BAND_LABELS: Record<string, string> = Object.fromEntries(VALUE_BANDS.map((b) => [b.value, b.label]));

const DEFAULT_WINDOW: ContractWatchWindow = "expiring12";
const DEFAULT_MAX_TIER = 2; // top 2 divisions — see fetchContractWatchCandidates' own comment on why this matters here

export default function ContractWatchPage() {
  const [window, setWindow] = useState<ContractWatchWindow>(DEFAULT_WINDOW);
  const [position, setPosition] = useState("all");
  const [nationality, setNationality] = useState("all");
  const [country, setCountry] = useState("all");
  const [competitionId, setCompetitionId] = useState("all");
  const [club, setClub] = useState("all");
  const [ageRange, setAgeRange] = useState<AgeRange>(ALL_AGES);
  const [valueBand, setValueBand] = useState("all");

  const filterOptions = useAsync(() => fetchFilterOptions(), []);
  const competitionOptions = useAsync(() => (country !== "all" ? fetchCompetitionsInCountry(country) : Promise.resolve([])), [country]);
  const clubOptions = useAsync(() => (competitionId !== "all" ? fetchClubsInCompetition(competitionId) : Promise.resolve([])), [competitionId]);

  const {
    data: players,
    loading,
    error,
  } = useAsync(
    () =>
      fetchContractWatchCandidates({
        window,
        position,
        nationality,
        league: country,
        competitionId,
        club,
        ageRange,
        valueBand,
        maxTierLevel: DEFAULT_MAX_TIER,
      }),
    [window, position, nationality, country, competitionId, club, ageRange, valueBand]
  );

  function handleCountryChange(value: string) {
    setCountry(value);
    setCompetitionId("all");
    setClub("all");
  }
  function handleCompetitionChange(value: string) {
    setCompetitionId(value);
    setClub("all");
  }

  const ageLabel = ageRangeLabel(ageRange);
  const competitionName = competitionOptions.data?.find((c) => c.id === competitionId)?.name ?? competitionId;
  const chips: ActiveFilterChip[] = [];
  if (window !== DEFAULT_WINDOW) chips.push({ key: "window", label: "Window", value: WINDOW_LABELS[window], onClear: () => setWindow(DEFAULT_WINDOW) });
  if (position !== "all") chips.push({ key: "position", label: "Position", value: POSITION_LABELS[position as keyof typeof POSITION_LABELS], onClear: () => setPosition("all") });
  if (nationality !== "all") chips.push({ key: "nationality", label: "Nationality", value: nationality, onClear: () => setNationality("all") });
  if (country !== "all") chips.push({ key: "country", label: "Country", value: country, onClear: () => handleCountryChange("all") });
  if (competitionId !== "all") chips.push({ key: "competition", label: "Competition", value: competitionName, onClear: () => handleCompetitionChange("all") });
  if (club !== "all") chips.push({ key: "club", label: "Club", value: club, onClear: () => setClub("all") });
  if (ageLabel) chips.push({ key: "age", label: "Age", value: ageLabel, onClear: () => setAgeRange(ALL_AGES) });
  if (valueBand !== "all") chips.push({ key: "value", label: "Value", value: VALUE_BAND_LABELS[valueBand], onClear: () => setValueBand("all") });

  function clearAll() {
    setWindow(DEFAULT_WINDOW);
    setPosition("all");
    setNationality("all");
    handleCountryChange("all");
    setAgeRange(ALL_AGES);
    setValueBand("all");
  }

  return (
    <>
      <PageHeader
        title="Contract Watch"
        description="Players entering the final stretch of their contract, or already free — top 2 divisions per country only. Real signal for cheap or free transfer targets."
      />

      <div className="flex min-h-0 flex-1">
        <FilterSidebar activeCount={chips.length} onClearAll={clearAll}>
          <FilterSidebarSection label="Window">
            <FilterSelect stacked label="" value={window} onChange={(v) => setWindow(v as ContractWatchWindow)} options={WINDOW_OPTIONS} />
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
          <FilterSidebarSection label="Age">
            <AgeRangeSlider range={ageRange} onChange={setAgeRange} />
          </FilterSidebarSection>
          <FilterSidebarSection label="Nationality">
            <FilterSelect
              stacked
              label=""
              value={nationality}
              onChange={setNationality}
              options={[{ value: "all", label: "All nationalities" }, ...(filterOptions.data?.nationalities ?? []).map((n) => ({ value: n, label: n }))]}
            />
          </FilterSidebarSection>
          <FilterSidebarSection label="Country">
            <FilterSelect
              stacked
              label=""
              value={country}
              onChange={handleCountryChange}
              options={[{ value: "all", label: "All countries" }, ...(filterOptions.data?.leagues ?? []).map((l) => ({ value: l, label: l }))]}
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
              onChange={setClub}
              disabled={competitionId === "all"}
              options={[
                { value: "all", label: competitionId === "all" ? "Pick a competition first" : "All clubs" },
                ...(clubOptions.data ?? []).map((c) => ({ value: c, label: c })),
              ]}
            />
          </FilterSidebarSection>
          <FilterSidebarSection label="Market Value">
            <FilterSelect stacked label="" value={valueBand} onChange={setValueBand} options={VALUE_BANDS} />
          </FilterSidebarSection>
        </FilterSidebar>

        <div className="min-w-0 flex-1">
          <ActiveFilterChips chips={chips} onClearAll={clearAll} />

          <div className="m-4 border border-kvm-border bg-white">
            {error ? (
              <ErrorState message={error.message} />
            ) : loading ? (
              <LoadingState label="Loading contract watch…" />
            ) : (
              <ContractWatchTable players={players ?? []} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
