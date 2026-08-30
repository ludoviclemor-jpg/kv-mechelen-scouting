"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { FilterBar, FilterSelect } from "@/components/ui/FilterBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useEffectiveStatus, useEffectiveNotes } from "@/lib/app-store";
import {
  getAllPlayers,
  SCOUTING_STATUSES,
  STATUS_LABELS,
  POSITION_LABELS,
  type Player,
} from "@/lib/demo-data";
import { formatDate } from "@/lib/utils";

const ALL_PLAYERS = getAllPlayers();

function ReportRow({ player }: { player: Player }) {
  const status = useEffectiveStatus(player.id, player.status);
  const notes = useEffectiveNotes(player.id, player.notes);

  return (
    <tr>
      <td>
        <Link
          href={`/players/${player.id}`}
          className="font-semibold text-kvm-ink hover:text-kvm-red hover:underline"
        >
          {player.name}
        </Link>
        <div className="text-xs text-gray-400">
          {POSITION_LABELS[player.position]} · {player.club}
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

  const filtered = useMemo(() => {
    if (status === "all") return ALL_PLAYERS;
    return ALL_PLAYERS.filter((p) => p.status === status);
  }, [status]);

  return (
    <>
      <PageHeader
        title="Scouting Reports"
        description="Recommendation summary compiled from each player's scouting notes."
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
        {filtered.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No reports match this filter"
            description="Adjust the status filter above."
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
