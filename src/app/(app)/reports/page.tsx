"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FileText, Trash2, Pencil } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { FilterSelect, ActiveFilterChips, type ActiveFilterChip } from "@/components/ui/FilterBar";
import { FilterSidebar, FilterSidebarSection } from "@/components/ui/FilterSidebar";
import { SearchBar } from "@/components/ui/SearchBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState, ErrorState } from "@/components/ui/LoadingState";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { useAppStore } from "@/lib/app-store";
import { fetchPlayersByIds, useAsync, positionLabel, type Position } from "@/lib/players-data";
import {
  fetchAllMatchReports,
  deleteMatchReport,
  SCOUTING_TYPE_LABELS,
  FOLLOW_UP_LABELS,
  FOLLOW_UP_ACTIONS,
  type MatchReport,
  type FollowUpAction,
} from "@/lib/reports-data";
import { formatDate } from "@/lib/utils";

const RATING_OPTIONS = [
  { value: "all", label: "Any rating" },
  { value: "8", label: "8+" },
  { value: "6", label: "6+" },
  { value: "4", label: "4+" },
];

/**
 * Real, per-match scouting report history (redesign item 5) — replaces
 * the previous single-row-per-player status summary, which had no real
 * per-match data behind it. RLS already scopes every report to the
 * signed-in scout; this page never needs to filter by owner client-side.
 */
export default function ReportsPage() {
  const { isPersistent } = useAppStore();
  const [playerQuery, setPlayerQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [minRating, setMinRating] = useState("all");
  const [followUp, setFollowUp] = useState<FollowUpAction | "all">("all");

  const { data: reports, loading, error, reload } = useAsync(
    () =>
      fetchAllMatchReports({
        minRating: minRating === "all" ? undefined : Number(minRating),
        followUpAction: followUp === "all" ? undefined : followUp,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      }),
    [minRating, followUp, fromDate, toDate]
  );

  const playerIds = useMemo(() => Array.from(new Set((reports ?? []).map((r) => r.playerId))), [reports]);
  const { data: players } = useAsync(() => fetchPlayersByIds(playerIds), [playerIds.join(",")]);
  const playerById = useMemo(() => new Map((players ?? []).map((p) => [p.id, p])), [players]);

  const filtered = useMemo(() => {
    if (!reports) return [];
    const q = playerQuery.trim().toLowerCase();
    if (!q) return reports;
    return reports.filter((r) => (playerById.get(r.playerId)?.name ?? "").toLowerCase().includes(q));
  }, [reports, playerQuery, playerById]);

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this match report? This can't be undone.")) return;
    try {
      await deleteMatchReport(id);
      reload();
    } catch {
      // Delete failures here are rare (RLS already guarantees ownership); a
      // silent no-op reload is enough — the row simply stays visible,
      // which is itself the visible failure signal.
    }
  }

  const chips: ActiveFilterChip[] = [];
  if (minRating !== "all") chips.push({ key: "rating", label: "Rating", value: RATING_OPTIONS.find((o) => o.value === minRating)!.label, onClear: () => setMinRating("all") });
  if (followUp !== "all") chips.push({ key: "followup", label: "Follow-up", value: FOLLOW_UP_LABELS[followUp], onClear: () => setFollowUp("all") });
  if (fromDate) chips.push({ key: "from", label: "From", value: fromDate, onClear: () => setFromDate("") });
  if (toDate) chips.push({ key: "to", label: "To", value: toDate, onClear: () => setToDate("") });
  if (playerQuery) chips.push({ key: "player", label: "Player", value: playerQuery, onClear: () => setPlayerQuery("") });

  function clearAll() {
    setPlayerQuery("");
    setFromDate("");
    setToDate("");
    setMinRating("all");
    setFollowUp("all");
  }

  if (!isPersistent) {
    return (
      <>
        <PageHeader title="Scouting Reports" description="Match report history, private to your account." />
        <div className="p-8">
          <div className="rounded-xl border border-kvm-border bg-white shadow-[0_1px_2px_rgba(26,23,18,0.04),0_8px_24px_-8px_rgba(26,23,18,0.10)]">
            <EmptyState
              icon={FileText}
              title="Database not configured"
              description="Match reports need Postgres persistence (see Settings) before any can be saved or shown here."
            />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Scouting Reports"
        description={reports ? `${filtered.length} of ${reports.length} reports — private to your account` : "Your match report history."}
      />

      <div className="flex min-h-0 flex-1">
        <FilterSidebar activeCount={chips.length} onClearAll={clearAll}>
          <FilterSidebarSection label="Player">
            <SearchBar value={playerQuery} onChange={setPlayerQuery} placeholder="Filter by player..." />
          </FilterSidebarSection>
          <FilterSidebarSection label="From date">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full rounded-md border border-kvm-border bg-white px-2.5 py-1.5 text-sm focus-visible:outline-none"
            />
          </FilterSidebarSection>
          <FilterSidebarSection label="To date">
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full rounded-md border border-kvm-border bg-white px-2.5 py-1.5 text-sm focus-visible:outline-none"
            />
          </FilterSidebarSection>
          <FilterSidebarSection label="Rating">
            <FilterSelect stacked label="" value={minRating} onChange={setMinRating} options={RATING_OPTIONS} />
          </FilterSidebarSection>
          <FilterSidebarSection label="Follow-up">
            <FilterSelect
              stacked
              label=""
              value={followUp}
              onChange={(v) => setFollowUp(v as FollowUpAction | "all")}
              options={[{ value: "all", label: "Any follow-up" }, ...FOLLOW_UP_ACTIONS.map((a) => ({ value: a, label: FOLLOW_UP_LABELS[a] }))]}
            />
          </FilterSidebarSection>
        </FilterSidebar>

        <div className="min-w-0 flex-1">
          <ActiveFilterChips chips={chips} onClearAll={clearAll} />

          <div className="m-6 rounded-xl border border-kvm-border bg-white shadow-[0_1px_2px_rgba(26,23,18,0.04),0_8px_24px_-8px_rgba(26,23,18,0.10)]">
            {error ? (
              <ErrorState message={error.message} onRetry={reload} />
            ) : loading ? (
              <LoadingState label="Loading reports…" />
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={FileText}
                title={(reports?.length ?? 0) === 0 ? "No match reports yet" : "No reports match this filter"}
                description={
                  (reports?.length ?? 0) === 0
                    ? "Open a player profile and add a report from the Scouting tab after watching them."
                    : "Adjust the filters."
                }
              />
            ) : (
              <div className="divide-y divide-kvm-border">
                {filtered.map((r) => (
                  <ReportListRow key={r.id} report={r} player={playerById.get(r.playerId) ?? null} onDelete={() => handleDelete(r.id)} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function ReportListRow({
  report,
  player,
  onDelete,
}: {
  report: MatchReport;
  player: { id: string; name: string; photoUrl: string | null; club: string | null; position: string | null } | null;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 py-3">
      <div className="flex min-w-0 items-start gap-3">
        {player ? (
          <Link href={`/player?id=${player.id}`} className="shrink-0">
            <PlayerAvatar name={player.name} photoUrl={player.photoUrl} size="sm" />
          </Link>
        ) : null}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {player ? (
              <Link href={`/player?id=${player.id}`} className="text-sm font-semibold text-kvm-ink hover:text-kvm-red hover:underline">
                {player.name}
              </Link>
            ) : (
              <span className="text-sm font-semibold text-gray-400">Unknown player</span>
            )}
            <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
              {SCOUTING_TYPE_LABELS[report.scoutingType]}
            </span>
            {report.overallRating !== null ? (
              <span className="rounded-md bg-kvm-red/10 px-1.5 py-0.5 text-[10px] font-bold text-kvm-red">{report.overallRating}/10</span>
            ) : null}
          </div>
          <div className="mt-0.5 text-xs text-gray-400">
            {report.opponent || "Untitled match"} · {formatDate(report.matchDate)}
            {report.positionPlayed ? ` · ${positionLabel(report.positionPlayed as Position)}` : ""}
            {" · "}
            {FOLLOW_UP_LABELS[report.followUpAction]}
          </div>
          {report.strengths || report.weaknesses ? (
            <div className="mt-1.5 grid grid-cols-1 gap-1 text-xs text-gray-600 sm:grid-cols-2">
              {report.strengths ? (
                <p>
                  <span className="font-semibold text-gray-500">Strengths: </span>
                  {report.strengths}
                </p>
              ) : null}
              {report.weaknesses ? (
                <p>
                  <span className="font-semibold text-gray-500">Work-ons: </span>
                  {report.weaknesses}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {player ? (
          <Link
            href={`/player?id=${player.id}`}
            aria-label="Edit on player profile"
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-kvm-ink"
          >
            <Pencil size={14} aria-hidden="true" />
          </Link>
        ) : null}
        <button type="button" onClick={onDelete} aria-label="Delete report" className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-kvm-red">
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
