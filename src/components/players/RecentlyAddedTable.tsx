"use client";

import Link from "next/link";
import type { Player } from "@/lib/demo-data";
import { POSITION_LABELS } from "@/lib/demo-data";
import { calculateAge } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useEffectiveStatus } from "@/lib/app-store";

function Row({ player }: { player: Player }) {
  const status = useEffectiveStatus(player.id, player.status);
  return (
    <tr>
      <td>
        <Link
          href={`/players/${player.id}`}
          className="font-semibold text-kvm-ink hover:text-kvm-red hover:underline"
        >
          {player.name}
        </Link>
      </td>
      <td>{POSITION_LABELS[player.position]}</td>
      <td>{player.club}</td>
      <td className="text-gray-500">{player.league}</td>
      <td>{player.nationality}</td>
      <td className="tabular-nums">{calculateAge(player.dateOfBirth)}</td>
      <td>
        <StatusBadge status={status} />
      </td>
    </tr>
  );
}

export function RecentlyAddedTable({ players }: { players: Player[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <th>Player</th>
            <th>Position</th>
            <th>Club</th>
            <th>League</th>
            <th>Nationality</th>
            <th>Age</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {players.map((player) => (
            <Row key={player.id} player={player} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
