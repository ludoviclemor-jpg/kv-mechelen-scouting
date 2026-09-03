"use client";

import Link from "next/link";
import type { InjuredPlayer } from "@/lib/players-data";
import { positionLabel } from "@/lib/players-data";
import { formatDate, compareStrings } from "@/lib/utils";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { SortableHeader } from "@/components/ui/SortableHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { useSortableList } from "@/lib/useSortableList";
import { HeartPulse } from "lucide-react";

function daysOutValue(from: string | null, to: string | null): number {
  if (!from) return -1;
  const start = new Date(from).getTime();
  const end = to ? new Date(to).getTime() : Date.now();
  return Math.round((end - start) / 86_400_000);
}

function daysOut(from: string | null, to: string | null): string {
  const days = daysOutValue(from, to);
  return days >= 0 ? `${days}d` : "—";
}

type SortKey = "name" | "since" | "daysOut";

/** Injury Tracker — real currently-injured players, from injury_history (see fetchCurrentlyInjuredPlayers' own comment on coverage). */
export function InjuryTrackerTable({ injured }: { injured: InjuredPlayer[] }) {
  const { sorted, sortKey, direction, onSort } = useSortableList<InjuredPlayer, SortKey>(
    injured,
    {
      name: (a, b) => compareStrings(a.player.name, b.player.name),
      since: (a, b) => compareStrings(a.from, b.from),
      daysOut: (a, b) => daysOutValue(a.from, a.to) - daysOutValue(b.from, b.to),
    },
    "since",
    "desc"
  );

  if (injured.length === 0) {
    return (
      <EmptyState
        icon={HeartPulse}
        title="No currently injured players found"
        description="Real injury data is scoped to players whose latest sync included it — coverage grows as more players are re-crawled. Try clearing a filter."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <SortableHeader label="Player" sortKey="name" activeKey={sortKey} direction={direction} onSort={onSort} />
            <th>Position</th>
            <th>Club</th>
            <th>League</th>
            <th>Injury</th>
            <SortableHeader label="Since" sortKey="since" activeKey={sortKey} direction={direction} onSort={onSort} />
            <th>Expected Return</th>
            <SortableHeader label="Days Out" sortKey="daysOut" activeKey={sortKey} direction={direction} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {sorted.map(({ player: p, description, from, to }) => (
            <tr key={p.id}>
              <td>
                <Link href={`/player?id=${p.id}`} className="flex items-center gap-2 font-semibold text-kvm-ink hover:text-kvm-red hover:underline">
                  <PlayerAvatar name={p.name} photoUrl={p.photoUrl} size="sm" />
                  {p.name}
                </Link>
              </td>
              <td>{positionLabel(p.position)}</td>
              <td>{p.club ?? "Unknown"}</td>
              <td className="text-gray-500">{p.league ?? "Unknown"}</td>
              <td className="font-medium text-kvm-ink">{description ?? "Unspecified"}</td>
              <td className="text-gray-500">{from ? formatDate(from) : "—"}</td>
              <td className="text-gray-500">
                {to ? (
                  formatDate(to)
                ) : (
                  <span className="inline-flex items-center rounded-sm bg-red-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-kvm-red">
                    Ongoing
                  </span>
                )}
              </td>
              <td className="tabular-nums">{daysOut(from, to)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
