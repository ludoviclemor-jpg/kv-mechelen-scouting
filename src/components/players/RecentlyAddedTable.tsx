"use client";

import Link from "next/link";
import type { Player } from "@/lib/players-data";
import { positionLabel } from "@/lib/players-data";
import { calculateAge, compareNumbers, compareStrings } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SortableHeader } from "@/components/ui/SortableHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { useEffectiveStatus } from "@/lib/app-store";
import { useSortableList } from "@/lib/useSortableList";
import { Users } from "lucide-react";

function Row({ player }: { player: Player }) {
  const status = useEffectiveStatus(player.id, player.status);
  return (
    <tr>
      <td>
        <Link
          href={`/player?id=${player.id}`}
          className="font-semibold text-kvm-ink hover:text-kvm-red hover:underline"
        >
          {player.name}
        </Link>
      </td>
      <td>{positionLabel(player.position)}</td>
      <td>{player.club ?? "Unknown"}</td>
      <td className="text-gray-500">{player.league ?? "Unknown"}</td>
      <td>{player.nationality ?? "Unknown"}</td>
      <td className="tabular-nums">{calculateAge(player.dateOfBirth) ?? "—"}</td>
      <td>
        <StatusBadge status={status} />
      </td>
    </tr>
  );
}

// "default" is a no-op comparator (stable sort keeps original order) so
// the table opens showing fetchRecentlyAdded's own newest-first order —
// the entire point of this widget — rather than immediately alphabetizing
// it away. Clicking Player/Age switches to that real sort as normal.
type SortKey = "default" | "name" | "age";

export function RecentlyAddedTable({ players }: { players: Player[] }) {
  const { sorted, sortKey, direction, onSort } = useSortableList<Player, SortKey>(
    players,
    {
      default: () => 0,
      name: (a, b) => compareStrings(a.name, b.name),
      age: (a, b) => compareNumbers(calculateAge(a.dateOfBirth), calculateAge(b.dateOfBirth)),
    },
    "default"
  );

  if (players.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No players yet"
        description="Run the SCOUTASTIC sync to populate the player database."
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
            <th>Nationality</th>
            <SortableHeader label="Age" sortKey="age" activeKey={sortKey} direction={direction} onSort={onSort} />
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((player) => (
            <Row key={player.id} player={player} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
