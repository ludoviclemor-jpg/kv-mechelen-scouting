"use client";

import Link from "next/link";
import type { Player } from "@/lib/players-data";
import { positionLabel } from "@/lib/players-data";
import { calculateAge, compareNumbers, compareStrings } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";
import { SortableHeader } from "@/components/ui/SortableHeader";
import { useSortableList } from "@/lib/useSortableList";
import { ArrowRightLeft } from "lucide-react";

type SortKey = "name" | "age" | "appearances" | "minutes";

/** "Limited Game Time" — the real, data-backed half of loan-candidate scouting (see docs/LOAN_WATCH.md). */
export function LoanWatchTable({ players }: { players: Player[] }) {
  const { sorted, sortKey, direction, onSort } = useSortableList<Player, SortKey>(
    players,
    {
      name: (a, b) => compareStrings(a.name, b.name),
      age: (a, b) => compareNumbers(calculateAge(a.dateOfBirth), calculateAge(b.dateOfBirth)),
      appearances: (a, b) => compareNumbers(a.appearances, b.appearances),
      minutes: (a, b) => compareNumbers(a.minutes, b.minutes),
    },
    "minutes"
  );

  if (players.length === 0) {
    return (
      <EmptyState
        icon={ArrowRightLeft}
        title="No players match this threshold"
        description="Try raising the minutes threshold, or clearing the position/age filters."
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
            <th>Competition</th>
            <SortableHeader label="Age" sortKey="age" activeKey={sortKey} direction={direction} onSort={onSort} />
            <SortableHeader label="Appearances" sortKey="appearances" activeKey={sortKey} direction={direction} onSort={onSort} />
            <SortableHeader label="Minutes" sortKey="minutes" activeKey={sortKey} direction={direction} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={p.id}>
              <td>
                <Link href={`/player?id=${p.id}`} className="font-semibold text-kvm-ink hover:text-kvm-red hover:underline">
                  {p.name}
                </Link>
              </td>
              <td>{positionLabel(p.position)}</td>
              <td>{p.club ?? "Unknown"}</td>
              <td className="text-gray-500">{p.league ?? "Unknown"}</td>
              <td className="tabular-nums">{calculateAge(p.dateOfBirth) ?? "—"}</td>
              <td className="tabular-nums">{p.appearances ?? "—"}</td>
              <td className="tabular-nums font-semibold text-kvm-red">{p.minutes ?? "—"}&apos;</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
