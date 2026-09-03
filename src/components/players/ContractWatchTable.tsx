"use client";

import Link from "next/link";
import type { Player } from "@/lib/players-data";
import { positionLabel } from "@/lib/players-data";
import { calculateAge, formatCurrency, formatDate, compareNumbers, compareStrings } from "@/lib/utils";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { ContractBadge } from "@/components/ui/ContractBadge";
import { SortableHeader } from "@/components/ui/SortableHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { useSortableList } from "@/lib/useSortableList";
import { FileClock } from "lucide-react";

type SortKey = "name" | "age" | "marketValueEUR" | "contractExpiry";

/** Contract Watch — real free-agent/expiring-contract signal (see fetchContractWatchCandidates' own comment for why this is tier-restricted by default). */
export function ContractWatchTable({ players }: { players: Player[] }) {
  const { sorted, sortKey, direction, onSort } = useSortableList<Player, SortKey>(
    players,
    {
      name: (a, b) => compareStrings(a.name, b.name),
      age: (a, b) => compareNumbers(calculateAge(a.dateOfBirth), calculateAge(b.dateOfBirth)),
      marketValueEUR: (a, b) => compareNumbers(a.marketValueEUR, b.marketValueEUR),
      contractExpiry: (a, b) => compareStrings(a.contractExpiry, b.contractExpiry),
    },
    "contractExpiry"
  );

  if (players.length === 0) {
    return (
      <EmptyState
        icon={FileClock}
        title="No players match this window"
        description="Try widening the contract window, or clearing a filter."
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
            <SortableHeader label="Age" sortKey="age" activeKey={sortKey} direction={direction} onSort={onSort} />
            <SortableHeader label="Market Value" sortKey="marketValueEUR" activeKey={sortKey} direction={direction} onSort={onSort} />
            <SortableHeader label="Contract" sortKey="contractExpiry" activeKey={sortKey} direction={direction} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
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
              <td className="tabular-nums">{calculateAge(p.dateOfBirth) ?? "—"}</td>
              <td className="tabular-nums">{formatCurrency(p.marketValueEUR)}</td>
              <td className="flex items-center gap-2">
                <ContractBadge expiryIso={p.contractExpiry} />
                <span className="text-xs text-gray-400">{formatDate(p.contractExpiry)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
