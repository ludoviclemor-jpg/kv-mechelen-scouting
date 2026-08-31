"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { Player } from "@/lib/players-data";
import { positionLabel } from "@/lib/players-data";
import { calculateAge, contractStatus, formatCurrency } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useEffectiveStatus } from "@/lib/app-store";
import { cn } from "@/lib/utils";

export type PlayerSortKey =
  | "name"
  | "age"
  | "position"
  | "nationality"
  | "club"
  | "league"
  | "marketValueEUR"
  | "contractExpiry";

export type SortDirection = "asc" | "desc";

interface Column {
  key: PlayerSortKey;
  label: string;
}

const COLUMNS: Column[] = [
  { key: "name", label: "Player" },
  { key: "age", label: "Age" },
  { key: "position", label: "Position" },
  { key: "nationality", label: "Nationality" },
  { key: "club", label: "Club" },
  { key: "league", label: "League" },
  { key: "marketValueEUR", label: "Market Value" },
  { key: "contractExpiry", label: "Contract" },
];

function Row({ player }: { player: Player }) {
  const status = useEffectiveStatus(player.id, player.status);
  const contract = contractStatus(player.contractExpiry);

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
      <td className="tabular-nums">{calculateAge(player.dateOfBirth) ?? "—"}</td>
      <td>{positionLabel(player.position)}</td>
      <td>{player.nationality ?? "Unknown"}</td>
      <td>{player.club ?? "Unknown"}</td>
      <td className="text-gray-500">{player.league ?? "Unknown"}</td>
      <td className="tabular-nums">{formatCurrency(player.marketValueEUR)}</td>
      <td
        className={cn("tabular-nums", contract.urgent && "font-semibold text-kvm-red")}
      >
        {contract.label}
      </td>
      <td>
        <StatusBadge status={status} />
      </td>
    </tr>
  );
}

export function PlayerTable({
  players,
  sortKey,
  sortDirection,
  onSort,
}: {
  players: Player[];
  sortKey: PlayerSortKey;
  sortDirection: SortDirection;
  onSort: (key: PlayerSortKey) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            {COLUMNS.map((col) => {
              const active = col.key === sortKey;
              const Icon = active
                ? sortDirection === "asc"
                  ? ArrowUp
                  : ArrowDown
                : ArrowUpDown;
              return (
                <th key={col.key}>
                  <button
                    type="button"
                    onClick={() => onSort(col.key)}
                    className={cn(
                      "flex items-center gap-1 uppercase tracking-wide hover:text-kvm-ink",
                      active && "text-kvm-ink"
                    )}
                  >
                    {col.label}
                    <Icon size={11} aria-hidden="true" />
                  </button>
                </th>
              );
            })}
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
