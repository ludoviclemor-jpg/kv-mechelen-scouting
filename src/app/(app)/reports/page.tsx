"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { FilterBar, FilterSelect } from "@/components/ui/FilterBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState, ErrorState } from "@/components/ui/LoadingState";
import { StatusBadge } from "@/components/ui/StatusBadge";
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
        <Link
          href={`/player?id=${player.id}`}
          className="font-semibold text-kvm-ink hover:text-kvm-red hover:underline"
        >
          {player.name}
        </Link>
        <div className="text-xs text-gray-400">
          {positionLabel(player.position)} · {player.club ?? "Unknown club"}
        </div>
      </td>
      <td>
        <StatusBadge status={status} />
      </td>
      <td className="max-w-md text-gray-600">{notes.recommendation}</td>
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
  const { statusOverrides, isLoading: statusLoading } = useAppStore();
  const assessedIds = useMemo(() => Object.keys(statusOverrides), [statusOverrides]);

  const { data: players, loading, error } = useAsync(() => fetchPlayersByIds(assessedIds), [assessedIds]);

  const filtered = useMemo(() => {
    const all = players ?? [];
    if (status === "all") return all;
    return all.filter((p) => (statusOverrides[p.id] ?? p.status) === status);
  }, [players, status, statusOverrides]);

  return (
    <>
      <PageHeader
        title="Scouting Reports"
        description="Recommendation summary compiled from each assessed player's scouting notes."
      />

      <FilterBar>
        <FilterSelect
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: "All statuses" },
            ...SCOUTING_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
          ]}
        />
      </FilterBar>

      <div className="mx-8 my-6 border border-kvm-border bg-white">
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
                : "Adjust the status filter above."
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
    </>
  );
}
