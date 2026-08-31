"use client";

import { useMemo } from "react";
import Link from "next/link";
import { CalendarDays, ArrowRight } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { fetchMatchById, fetchTodaysMatches, type MatchSummary } from "@/lib/matches-data";
import { fetchPlayersByIds, useAsync } from "@/lib/players-data";
import { useAppStore } from "@/lib/app-store";
import { calculateAge } from "@/lib/utils";

function kickoffLabel(iso: string | null): string {
  if (!iso) return "TBD";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
}

/** U21/shortlisted counts for one match — a small, bounded lookup (one match's ~22 lineup players), computed only for the few matches this teaser shows. */
function MatchRow({ match, shortlistedIds }: { match: MatchSummary; shortlistedIds: Set<string> }) {
  const { data: full } = useAsync(() => fetchMatchById(match.id), [match.id]);
  const lineupIds = useMemo(
    () => (full ? [...full.homeTeamPlayers, ...full.awayTeamPlayers].map((p) => `sc-${p.id}`) : []),
    [full]
  );
  const { data: players } = useAsync(() => (lineupIds.length > 0 ? fetchPlayersByIds(lineupIds) : Promise.resolve([])), [
    lineupIds.join(","),
  ]);

  const u21Count = (players ?? []).filter((p) => {
    const age = calculateAge(p.dateOfBirth);
    return age !== null && age < 21;
  }).length;
  const shortlistedCount = (players ?? []).filter((p) => shortlistedIds.has(p.id)).length;

  return (
    <Link href={`/explore/match?id=${match.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-gray-50">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-kvm-ink">
          {match.homeTeamName ?? "TBD"} <span className="text-gray-400">vs</span> {match.awayTeamName ?? "TBD"}
        </div>
        <div className="text-[11px] text-gray-400">
          {match.competitionName ?? "Unknown competition"}
          {match.competitionArea ? ` · ${match.competitionArea}` : ""} · {kickoffLabel(match.date)}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 text-[11px] font-semibold">
        {u21Count > 0 ? <span className="rounded-sm bg-blue-50 px-1.5 py-0.5 text-blue-700">{u21Count} U21</span> : null}
        {shortlistedCount > 0 ? (
          <span className="rounded-sm bg-kvm-red/10 px-1.5 py-0.5 text-kvm-red">{shortlistedCount} shortlisted</span>
        ) : null}
        {match.status === "played" ? <span className="tabular-nums text-kvm-ink">{match.score}</span> : null}
      </div>
    </Link>
  );
}

export function TodaysMatches({ limit = 5 }: { limit?: number }) {
  const { data: matches, loading } = useAsync(() => fetchTodaysMatches(limit), [limit]);
  const { shortlists } = useAppStore();
  const shortlistedIds = useMemo(() => new Set(shortlists.flatMap((s) => s.playerIds)), [shortlists]);

  if (loading) return <LoadingState label="Loading today's matches…" />;

  if (!matches || matches.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="No matches today"
        description="Browse other days in Explore."
      />
    );
  }

  return (
    <div className="divide-y divide-kvm-border pt-3">
      {matches.map((m) => (
        <MatchRow key={m.id} match={m} shortlistedIds={shortlistedIds} />
      ))}
      <Link
        href="/explore"
        className="flex items-center justify-center gap-1.5 px-5 py-2.5 text-xs font-semibold text-kvm-red hover:underline"
      >
        Explore all matches
        <ArrowRight size={12} aria-hidden="true" />
      </Link>
    </div>
  );
}
