"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { FilterBar, FilterSelect, ActiveFilterChips, type ActiveFilterChip } from "@/components/ui/FilterBar";
import { AgeFilter } from "@/components/ui/AgeFilter";
import { CallUpTable } from "@/components/players/CallUpTable";
import { LoadingState, ErrorState } from "@/components/ui/LoadingState";
import { fetchFirstCallUps, fetchCallUpCountries, CALL_UP_LEVELS } from "@/lib/callups-data";
import { useAsync } from "@/lib/players-data";
import { ageRangeLabel, matchesAgeRange, type AgeRange } from "@/lib/agePresets";
import { calculateAge } from "@/lib/utils";

const LEVEL_OPTIONS = [
  { value: "all", label: "All levels" },
  ...CALL_UP_LEVELS.map((l) => ({ value: l, label: l === "Senior" ? "Senior" : l })),
];
const ALL_AGES: AgeRange = { min: null, max: null };

export default function CallUpsPage() {
  const [level, setLevel] = useState("all");
  const [country, setCountry] = useState("all");
  const [ageRange, setAgeRange] = useState<AgeRange>(ALL_AGES);

  const countries = useAsync(() => fetchCallUpCountries(), []);
  // Level and Country are both filtered server-side (see fetchFirstCallUps'
  // own comment) — only Age narrows client-side, over the already-bounded
  // (≤200) fetch, same convention as Debutants/Top Performers.
  const { data: callUps, loading, error } = useAsync(() => fetchFirstCallUps({ level, country, limit: 200 }), [level, country]);

  const filtered = useMemo(
    () => (callUps ?? []).filter((c) => matchesAgeRange(calculateAge(c.dateOfBirth), ageRange)),
    [callUps, ageRange]
  );

  const ageLabel = ageRangeLabel(ageRange);
  const chips: ActiveFilterChip[] = [];
  if (level !== "all") chips.push({ key: "level", label: "Level", value: LEVEL_OPTIONS.find((o) => o.value === level)?.label ?? level, onClear: () => setLevel("all") });
  if (country !== "all") chips.push({ key: "country", label: "Country", value: country, onClear: () => setCountry("all") });
  if (ageLabel) chips.push({ key: "age", label: "Age", value: ageLabel, onClear: () => setAgeRange(ALL_AGES) });
  function clearAll() {
    setLevel("all");
    setCountry("all");
    setAgeRange(ALL_AGES);
  }

  return (
    <>
      <PageHeader
        title="First International Call-Ups"
        description="Players called up to a national team for the first time — a genuinely different signal than a first appearance/cap. See docs/INTERNATIONAL_CALLUPS.md."
      />

      <FilterBar activeCount={chips.length}>
        <FilterSelect label="Level" value={level} onChange={setLevel} options={LEVEL_OPTIONS} />
        <FilterSelect
          label="Country"
          value={country}
          onChange={setCountry}
          options={[{ value: "all", label: "All countries" }, ...(countries.data ?? []).map((c) => ({ value: c, label: c }))]}
        />
        <AgeFilter range={ageRange} onChange={setAgeRange} />
      </FilterBar>

      <ActiveFilterChips chips={chips} onClearAll={clearAll} />

      <div className="mx-8 my-6 border border-kvm-border bg-white">
        {error ? (
          <ErrorState message={error.message} />
        ) : loading ? (
          <LoadingState label="Loading call-ups…" />
        ) : (
          <CallUpTable callUps={filtered} />
        )}
      </div>
    </>
  );
}
