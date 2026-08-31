"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { FilterBar, FilterSelect, ActiveFilterChips, type ActiveFilterChip } from "@/components/ui/FilterBar";
import { AgeFilter } from "@/components/ui/AgeFilter";
import { LoanWatchTable } from "@/components/players/LoanWatchTable";
import { LoadingState, ErrorState } from "@/components/ui/LoadingState";
import {
  fetchLoanWatchCandidates,
  useAsync,
  POSITIONS,
  POSITION_LABELS,
  LOAN_WATCH_DEFAULT_MAX_MINUTES,
} from "@/lib/players-data";
import { ageRangeLabel, matchesAgeRange, type AgeRange } from "@/lib/agePresets";
import { calculateAge } from "@/lib/utils";

const ALL_AGES: AgeRange = { min: null, max: null };
const MINUTES_OPTIONS = [
  { value: "180", label: "Under 180′ (2 matches)" },
  { value: "450", label: "Under 450′ (5 matches)" },
  { value: "900", label: "Under 900′ (10 matches)" },
  { value: "1350", label: "Under 1350′ (15 matches)" },
];

export default function LoanWatchPage() {
  const [maxMinutes, setMaxMinutes] = useState(String(LOAN_WATCH_DEFAULT_MAX_MINUTES));
  const [position, setPosition] = useState("all");
  const [ageRange, setAgeRange] = useState<AgeRange>(ALL_AGES);
  const [hasValueOnly, setHasValueOnly] = useState(false);

  // Bounded fetch (up to 300, ordered by minutes ascending) server-side —
  // "under N minutes" alone matches most of the crawled catalog (see
  // docs/LOAN_WATCH.md), so position/age/value narrow client-side from
  // there, same pattern as Debutants/Top Performers.
  const { data: candidates, loading, error } = useAsync(() => fetchLoanWatchCandidates({ maxMinutes: Number(maxMinutes) }), [maxMinutes]);

  const filtered = useMemo(() => {
    return (candidates ?? []).filter((p) => {
      if (position !== "all" && p.position !== position) return false;
      if (!matchesAgeRange(calculateAge(p.dateOfBirth), ageRange)) return false;
      if (hasValueOnly && (p.marketValueEUR === null || p.marketValueEUR === 0)) return false;
      return true;
    });
  }, [candidates, position, ageRange, hasValueOnly]);

  const ageLabel = ageRangeLabel(ageRange);
  const chips: ActiveFilterChip[] = [];
  if (maxMinutes !== String(LOAN_WATCH_DEFAULT_MAX_MINUTES)) {
    const opt = MINUTES_OPTIONS.find((o) => o.value === maxMinutes);
    chips.push({ key: "minutes", label: "Minutes", value: opt?.label ?? `Under ${maxMinutes}′`, onClear: () => setMaxMinutes(String(LOAN_WATCH_DEFAULT_MAX_MINUTES)) });
  }
  if (position !== "all") chips.push({ key: "position", label: "Position", value: POSITION_LABELS[position as keyof typeof POSITION_LABELS], onClear: () => setPosition("all") });
  if (ageLabel) chips.push({ key: "age", label: "Age", value: ageLabel, onClear: () => setAgeRange(ALL_AGES) });
  if (hasValueOnly) chips.push({ key: "value", label: "Market value", value: "Has a value", onClear: () => setHasValueOnly(false) });
  function clearAll() {
    setMaxMinutes(String(LOAN_WATCH_DEFAULT_MAX_MINUTES));
    setPosition("all");
    setAgeRange(ALL_AGES);
    setHasValueOnly(false);
  }

  return (
    <>
      <PageHeader
        title="Loan Watch"
        description="Players with limited game time this season — a real signal for a possible loan move. Built entirely from real minutes/appearances data; SCOUTASTIC has no transfer-rumour data, so nothing here is based on speculation. Many results are semi-pro/amateur-tier squad depth rather than genuine loan candidates — use the filters below to narrow."
      />

      <FilterBar activeCount={chips.length}>
        <FilterSelect label="Minutes" value={maxMinutes} onChange={setMaxMinutes} options={MINUTES_OPTIONS} />
        <FilterSelect
          label="Position"
          value={position}
          onChange={setPosition}
          options={[{ value: "all", label: "All positions" }, ...POSITIONS.map((p) => ({ value: p, label: POSITION_LABELS[p] }))]}
        />
        <AgeFilter range={ageRange} onChange={setAgeRange} />
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          <input type="checkbox" checked={hasValueOnly} onChange={(e) => setHasValueOnly(e.target.checked)} className="rounded-sm" />
          Has a market value
        </label>
      </FilterBar>

      <ActiveFilterChips chips={chips} onClearAll={clearAll} />

      <div className="mx-8 my-6 border border-kvm-border bg-white">
        {error ? (
          <ErrorState message={error.message} />
        ) : loading ? (
          <LoadingState label="Loading loan-watch candidates…" />
        ) : (
          <LoanWatchTable players={filtered} />
        )}
      </div>
    </>
  );
}
