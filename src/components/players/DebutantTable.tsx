"use client";

import Link from "next/link";
import type { Player } from "@/lib/players-data";
import { computeMatchStats } from "@/lib/players-data";
import { formatDate, calculateAge, compareNumbers, compareStrings } from "@/lib/utils";
import { matchesAgeRange } from "@/lib/agePresets";
import { RatingBadge } from "@/components/ui/RatingBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SortableHeader } from "@/components/ui/SortableHeader";
import { useSortableList } from "@/lib/useSortableList";
import { Globe2 } from "lucide-react";

// Same DOB-based U23 cutoff as everywhere else (agePresets.ts) — computed
// per-row from real date_of_birth rather than assumed from the caller,
// so the badge stays correct even if this table is ever reused somewhere
// the U23 eligibility isn't already enforced server-side.
const U23 = { min: null, max: 22 } as const;

type SortKey = "name" | "age" | "debutDate" | "debutMinutes" | "latest" | "last5Avg";

export function DebutantTable({ players, debutMinutes = {} }: { players: Player[]; debutMinutes?: Record<string, number> }) {
  const { sorted, sortKey, direction, onSort } = useSortableList<Player, SortKey>(
    players,
    {
      name: (a, b) => compareStrings(a.name, b.name),
      age: (a, b) => compareNumbers(calculateAge(a.dateOfBirth), calculateAge(b.dateOfBirth)),
      debutDate: (a, b) => compareStrings(a.debutDate, b.debutDate),
      debutMinutes: (a, b) => compareNumbers(debutMinutes[a.id] ?? null, debutMinutes[b.id] ?? null),
      latest: (a, b) => compareNumbers(computeMatchStats(a.matches).latest, computeMatchStats(b.matches).latest),
      last5Avg: (a, b) => compareNumbers(computeMatchStats(a.matches).average, computeMatchStats(b.matches).average),
    },
    "debutDate",
    "desc"
  );

  if (players.length === 0) {
    return (
      <EmptyState
        icon={Globe2}
        title="No debutants recorded yet"
        description="African debutants from 1st and 2nd division clubs worldwide will appear here as SCOUTASTIC detects them."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <SortableHeader label="Player" sortKey="name" activeKey={sortKey} direction={direction} onSort={onSort} />
            <th />
            <th>Nationality</th>
            <SortableHeader label="Age" sortKey="age" activeKey={sortKey} direction={direction} onSort={onSort} />
            <th>Club</th>
            <th>League</th>
            <SortableHeader label="Debut date" sortKey="debutDate" activeKey={sortKey} direction={direction} onSort={onSort} />
            <SortableHeader label="Debut min" sortKey="debutMinutes" activeKey={sortKey} direction={direction} onSort={onSort} />
            <SortableHeader label="Latest" sortKey="latest" activeKey={sortKey} direction={direction} onSort={onSort} />
            <SortableHeader label="Last 5 avg" sortKey="last5Avg" activeKey={sortKey} direction={direction} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((player) => {
            const stats = computeMatchStats(player.matches);
            const age = calculateAge(player.dateOfBirth);
            const isU23 = matchesAgeRange(age, U23);
            const debutMins = debutMinutes[player.id];
            return (
              <tr key={player.id}>
                <td>
                  <Link
                    href={`/player?id=${player.id}`}
                    className="font-semibold text-kvm-ink hover:text-kvm-red hover:underline"
                  >
                    {player.name}
                  </Link>
                </td>
                <td>
                  {isU23 ? (
                    <span className="inline-flex items-center rounded-sm bg-kvm-yellow px-1.5 py-0.5 text-[10px] font-bold text-kvm-ink">
                      U23
                    </span>
                  ) : null}
                </td>
                <td>{player.nationality}</td>
                <td className="tabular-nums">{calculateAge(player.dateOfBirth) ?? "—"}</td>
                <td>{player.club}</td>
                <td className="text-gray-500">{player.league}</td>
                <td className="text-gray-500">
                  {player.debutDate ? formatDate(player.debutDate) : "—"}
                </td>
                <td className="tabular-nums text-gray-700" title={debutMins !== undefined ? undefined : "No match synced for this exact debut date yet"}>
                  {debutMins !== undefined ? `${debutMins}'` : "—"}
                </td>
                <td>
                  <RatingBadge rating={stats.latest} size="sm" />
                </td>
                <td className="tabular-nums text-gray-700">
                  {stats.average !== null ? stats.average.toFixed(2) : "N/A"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
