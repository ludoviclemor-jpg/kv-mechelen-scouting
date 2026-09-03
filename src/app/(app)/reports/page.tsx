"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { FilterSelect, ActiveFilterChips, type ActiveFilterChip } from "@/components/ui/FilterBar";
import { FilterSidebar, FilterSidebarSection } from "@/components/ui/FilterSidebar";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState, ErrorState } from "@/components/ui/LoadingState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { useAppStore, useEffectiveStatus, useEffectiveNotes } from "@/lib/app-store";
import {
  fetchPlayersByIds,
  useAsync,
  SCOUTING_STATUSES,
  STATUS_LABELS,
  positionLabel,
  type Player,
} from "@/lib/players-data";
import { formatDate } from "@/lib/utils";

function ReportRow({ player }: { player: Player }) {
  const status = useEffectiveStatus(player.id, player.status);
  const notes = useEffectiveNotes(player.id, player.notes);

  return (
    <tr>
      <td>
        <Link href={`/player?id=${player.id}`} className="flex items-center gap-2 font-semibold text-kvm-ink hover:text-kvm-red hover:underline">
          <PlayerAvatar name={player.name} photoUrl={player.photoUrl} size="sm" />
          <div>
            {player.name}
            <div className="text-xs font-normal text-gray-400">
              {positionLabel(player.position)} · {player.club ?? "Unknown club"}
            </div>
          </div>
        </Link>
      </td>
      <td>
        <StatusBadge status={status} />
      </td>
      <td className="max-w-md text-gray-600">{notes.recommendation || "—"}</td>
      <td className="whitespace-nowrap text-gray-500">{formatDate(player.addedDate)}</td>
    </tr>
  );
}

export default function ReportsPage() {
  const [status, setStatus] = useState("all");
  // A "report" only exists for a player a scout has actually assessed — the
  // set of ids with a real row in `player_scouting_state` (already loaded
  // in bulk by AppStoreProvider — see src/lib/app-store.tsx). This stays
  // bounded to however many players have actually been looked at, not the
  // full SCOUTASTIC catalog, so it's safe to resolve every one of them.
  //
  // Note: this is a single-status-per-player summary, not an append-only
  // multi-report log — there's no real Grade/Verdict/Master Verdict/Match
  // Date data behind this table, so those columns aren't shown here (see
  // the audit note in the redesign conversation — never fabricated).
  const { statusOverrides, isLoading: statusLoading } = useAppStore();
  const assessedIds = useMemo(() => Object.keys(statusOverrides), [statusOverrides]);

  const { data: players, loading, error } = useAsync(() => fetchPlayersByIds(assessedIds), [assessedIds]);

  const filtered = useMemo(() => {
    const all = players ?? [];
    if (status === "all") return all;
    return all.filter((p) => (statusOverrides[p.id] ?? p.status) === status);
  }, [players, status, statusOverrides]);

  const chips: ActiveFilterChip[] =
    status !== "all" ? [{ key: "status", label: "Status", value: STATUS_LABELS[status as keyof typeof STATUS_LABELS], onClear: () => setStatus("all") }] : [];

  return (
    <>
      <PageHeader
        title="Scouting Reports"
        description={players ? `${filtered.length} of ${players.length} assessed players` : "Recommendation summary from each assessed player's scouting notes."}
      />

      <div className="flex min-h-0 flex-1">
        <FilterSidebar activeCount={chips.length} onClearAll={() => setStatus("all")}>
          <FilterSidebarSection label="Status">
            <FilterSelect
              stacked
              label=""
              value={status}
              onChange={setStatus}
              options={[
                { value: "all", label: "All statuses" },
                ...SCOUTING_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
              ]}
            />
          </FilterSidebarSection>
        </FilterSidebar>

        <div className="min-w-0 flex-1">
          <ActiveFilterChips chips={chips} onClearAll={() => setStatus("all")} />

          <div className="m-4 border border-kvm-border bg-white shadow-sm">
            {error ? (
              <ErrorState message={error.message} />
            ) : statusLoading || loading ? (
              <LoadingState label="Loading reports…" />
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={FileText}
                title={assessedIds.length === 0 ? "No players assessed yet" : "No reports match this filter"}
                description={
                  assessedIds.length === 0
                    ? "Set a scouting status on a player's profile to see it here."
                    : "Adjust the status filter."
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>Status</th>
                      <th>Recommendation</th>
                      <th>Added</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((player) => (
                      <ReportRow key={player.id} player={player} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
