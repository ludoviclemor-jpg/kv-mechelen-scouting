"use client";

import { useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { DateNav } from "@/components/matches/DateNav";
import { MatchList, groupMatches } from "@/components/matches/MatchList";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState, ErrorState } from "@/components/ui/LoadingState";
import { fetchMatchesByDate } from "@/lib/matches-data";
import { useAsync } from "@/lib/players-data";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function ExplorePage() {
  const [date, setDate] = useState(todayISO);

  const { data: matches, loading, error } = useAsync(() => fetchMatchesByDate(date), [date]);
  const groups = useMemo(() => groupMatches(matches ?? []), [matches]);

  return (
    <>
      <PageHeader
        title="Explore"
        description={matches ? `${matches.length} matches` : "Browse matches by day — country → competition → match."}
      />

      <DateNav date={date} onChange={setDate} />

      <div className="p-8">
        {error ? (
          <div className="border border-kvm-border bg-white">
            <ErrorState message={error.message} />
          </div>
        ) : loading ? (
          <div className="border border-kvm-border bg-white">
            <LoadingState label="Loading matches…" />
          </div>
        ) : groups.length === 0 ? (
          <div className="border border-kvm-border bg-white">
            <EmptyState
              icon={CalendarDays}
              title="No matches on this day"
              description="Try a different date, or check back after the next match sync."
            />
          </div>
        ) : (
          <MatchList groups={groups} />
        )}
      </div>
    </>
  );
}
