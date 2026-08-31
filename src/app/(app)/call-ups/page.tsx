"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { FilterBar, FilterSelect } from "@/components/ui/FilterBar";
import { CallUpTable } from "@/components/players/CallUpTable";
import { LoadingState, ErrorState } from "@/components/ui/LoadingState";
import { fetchFirstCallUps, CALL_UP_LEVELS } from "@/lib/callups-data";
import { useAsync } from "@/lib/players-data";

const LEVEL_OPTIONS = [
  { value: "all", label: "All levels" },
  ...CALL_UP_LEVELS.map((l) => ({ value: l, label: l === "Senior" ? "Senior" : l })),
];

export default function CallUpsPage() {
  const [level, setLevel] = useState("all");
  const { data: callUps, loading, error } = useAsync(() => fetchFirstCallUps({ level, limit: 200 }), [level]);

  return (
    <>
      <PageHeader
        title="First International Call-Ups"
        description="Players called up to a national team for the first time — a genuinely different signal than a first appearance/cap. See docs/INTERNATIONAL_CALLUPS.md."
      />

      <FilterBar>
        <FilterSelect label="Level" value={level} onChange={setLevel} options={LEVEL_OPTIONS} />
      </FilterBar>

      <div className="mx-8 my-6 border border-kvm-border bg-white">
        {error ? (
          <ErrorState message={error.message} />
        ) : loading ? (
          <LoadingState label="Loading call-ups…" />
        ) : (
          <CallUpTable callUps={callUps ?? []} />
        )}
      </div>
    </>
  );
}
