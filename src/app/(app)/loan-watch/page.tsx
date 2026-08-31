"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { FilterBar, FilterSelect, ActiveFilterChips, type ActiveFilterChip } from "@/components/ui/FilterBar";
import { AgeFilter } from "@/components/ui/AgeFilter";
import { LoanWatchTable } from "@/components/players/LoanWatchTable";
import { LoadingState, ErrorState } from "@/components/ui/LoadingState";
import {
  fetchLoanWatchCandidates,
  fetchFilterOptions,
  fetchCompetitionsInCountry,
  fetchClubsInCompetition,
  useAsync,
  POSITIONS,
  POSITION_LABELS,
  LOAN_WATCH_DEFAULT_MAX_MINUTES,
} from "@/lib/players-data";
import { ageRangeLabel, type AgeRange } from "@/lib/agePresets";

const ALL_AGES: AgeRange = { min: null, max: null };
const MINUTES_OPTIONS = [
  { value: "180", label: "Under 180′ (2 matches)" },
  { value: "450", label: "Under 450′ (5 matches)" },
  { value: "900", label: "Under 900′ (10 matches)" },
  { value: "1350", label: "Under 1350′ (15 matches)" },
];
const VALUE_BANDS = [
  { value: "all", label: "All values" },
  { value: "u1", label: "Under €1M" },
  { value: "1-3", label: "€1M – €3M" },
  { value: "3-6", label: "€3M – €6M" },
  { value: "6+", label: "€6M+" },
];
const VALUE_BAND_LABELS: Record<string, string> = Object.fromEntries(VALUE_BANDS.map((b) => [b.value, b.label]));

// "Professional" is genuinely ambiguous below the top few tiers (varies by
// country) — exposed as an adjustable filter rather than a silent
// hardcoded cutoff. Default excludes cup/youth-league noise (see
// fetchProfessionalCompetitionIds' own comment) at a conservative tier
// cutoff; "All levels" keeps the full crawled pool, cup contexts included.
const TIER_OPTIONS = [
  { value: "3", label: "Professional (top 3 tiers)" },
  { value: "2", label: "Top 2 tiers only" },
  { value: "1", label: "Top tier only" },
  { value: "all", label: "All levels (incl. cups/amateur)" },
];
const DEFAULT_TIER = "3";

export default function LoanWatchPage() {
  const [maxMinutes, setMaxMinutes] = useState(String(LOAN_WATCH_DEFAULT_MAX_MINUTES));
  const [tier, setTier] = useState(DEFAULT_TIER);
  const [position, setPosition] = useState("all");
  const [nationality, setNationality] = useState("all");
  // Cascading: country -> competition -> club, same convention as the
  // Players page — changing a parent clears its children so the UI can
  // never show options that don't actually apply anymore.
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
      fetchLoanWatchCandidates({
        maxMinutes: Number(maxMinutes),
        position,
        nationality,
        league: country,
        competitionId,
        club,
        ageRange,
        valueBand,
        maxTierLevel: tier === "all" ? null : Number(tier),
      }),
    [maxMinutes, position, nationality, country, competitionId, club, ageRange, valueBand, tier]
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
  if (maxMinutes !== String(LOAN_WATCH_DEFAULT_MAX_MINUTES)) {
    const opt = MINUTES_OPTIONS.find((o) => o.value === maxMinutes);
    chips.push({ key: "minutes", label: "Minutes", value: opt?.label ?? `Under ${maxMinutes}′`, onClear: () => setMaxMinutes(String(LOAN_WATCH_DEFAULT_MAX_MINUTES)) });
  }
  if (tier !== DEFAULT_TIER) chips.push({ key: "tier", label: "Level", value: TIER_OPTIONS.find((o) => o.value === tier)?.label ?? tier, onClear: () => setTier(DEFAULT_TIER) });
  if (position !== "all") chips.push({ key: "position", label: "Position", value: POSITION_LABELS[position as keyof typeof POSITION_LABELS], onClear: () => setPosition("all") });
  if (nationality !== "all") chips.push({ key: "nationality", label: "Nationality", value: nationality, onClear: () => setNationality("all") });
  if (country !== "all") chips.push({ key: "country", label: "Country", value: country, onClear: () => handleCountryChange("all") });
  if (competitionId !== "all") chips.push({ key: "competition", label: "Competition", value: competitionName, onClear: () => handleCompetitionChange("all") });
  if (club !== "all") chips.push({ key: "club", label: "Club", value: club, onClear: () => setClub("all") });
  if (ageLabel) chips.push({ key: "age", label: "Age", value: ageLabel, onClear: () => setAgeRange(ALL_AGES) });
  if (valueBand !== "all") chips.push({ key: "value", label: "Value", value: VALUE_BAND_LABELS[valueBand], onClear: () => setValueBand("all") });
  function clearAll() {
    setMaxMinutes(String(LOAN_WATCH_DEFAULT_MAX_MINUTES));
    setTier(DEFAULT_TIER);
    setPosition("all");
    setNationality("all");
    handleCountryChange("all");
    setAgeRange(ALL_AGES);
    setValueBand("all");
  }

  return (
    <>
      <PageHeader
        title="Loan Watch"
        description="Players with limited game time this season — a real signal for a possible loan move. Built entirely from real minutes/appearances data; SCOUTASTIC has no transfer-rumour data, so nothing here is based on speculation. Defaults to the top 3 tiers only (Level filter) to exclude amateur/cup-context noise — widen it if you want the full crawled pool."
      />

      <FilterBar activeCount={chips.length}>
        <FilterSelect label="Minutes" value={maxMinutes} onChange={setMaxMinutes} options={MINUTES_OPTIONS} />
        <FilterSelect label="Level" value={tier} onChange={setTier} options={TIER_OPTIONS} />
        <FilterSelect
          label="Position"
          value={position}
          onChange={setPosition}
          options={[{ value: "all", label: "All positions" }, ...POSITIONS.map((p) => ({ value: p, label: POSITION_LABELS[p] }))]}
        />
        <FilterSelect
          label="Nationality"
          value={nationality}
          onChange={setNationality}
          options={[{ value: "all", label: "All nationalities" }, ...(filterOptions.data?.nationalities ?? []).map((n) => ({ value: n, label: n }))]}
        />
        <FilterSelect
          label="Country"
          value={country}
          onChange={handleCountryChange}
          options={[{ value: "all", label: "All countries" }, ...(filterOptions.data?.leagues ?? []).map((l) => ({ value: l, label: l }))]}
        />
        <FilterSelect
          label="Competition"
          value={competitionId}
          onChange={handleCompetitionChange}
          disabled={country === "all"}
          options={[
            { value: "all", label: country === "all" ? "Pick a country first" : "All competitions" },
            ...(competitionOptions.data ?? []).map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
        <FilterSelect
          label="Club"
          value={club}
          onChange={setClub}
          disabled={competitionId === "all"}
          options={[
            { value: "all", label: competitionId === "all" ? "Pick a competition first" : "All clubs" },
            ...(clubOptions.data ?? []).map((c) => ({ value: c, label: c })),
          ]}
        />
        <AgeFilter range={ageRange} onChange={setAgeRange} />
        <FilterSelect label="Market Value" value={valueBand} onChange={setValueBand} options={VALUE_BANDS} />
      </FilterBar>

      <ActiveFilterChips chips={chips} onClearAll={clearAll} />

      <div className="mx-8 my-6 border border-kvm-border bg-white">
        {error ? (
          <ErrorState message={error.message} />
        ) : loading ? (
          <LoadingState label="Loading loan-watch candidates…" />
        ) : (
          <LoanWatchTable players={players ?? []} />
        )}
      </div>
    </>
  );
}
