"use client";

import Link from "next/link";
import type { FirstCallUp } from "@/lib/callups-data";
import { positionLabel } from "@/lib/players-data";
import { formatDate, calculateAge, compareNumbers, compareStrings, cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";
import { SortableHeader } from "@/components/ui/SortableHeader";
import { useSortableList } from "@/lib/useSortableList";
import { Flag } from "lucide-react";

/** Senior gets the strongest visual weight — per the spec's own example, "FIRST SENIOR CALL-UP" should read as the headline signal, youth levels as secondary context. */
function LevelBadge({ level }: { level: string }) {
  const isSenior = level === "Senior";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        isSenior ? "bg-kvm-red text-white" : "bg-gray-100 text-gray-600"
      )}
    >
      {isSenior ? "Senior" : level}
    </span>
  );
}

type SortKey = "name" | "age" | "callUpDate";

export function CallUpTable({ callUps }: { callUps: FirstCallUp[] }) {
  const { sorted, sortKey, direction, onSort } = useSortableList<FirstCallUp, SortKey>(
    callUps,
    {
      name: (a, b) => compareStrings(a.playerName, b.playerName),
      age: (a, b) => compareNumbers(calculateAge(a.dateOfBirth), calculateAge(b.dateOfBirth)),
      callUpDate: (a, b) => compareStrings(a.firstCallUpDate, b.firstCallUpDate),
    },
    "callUpDate",
    "desc"
  );

  if (callUps.length === 0) {
    return (
      <EmptyState
        icon={Flag}
        title="No first call-ups recorded yet"
        description="Populated once scripts/sync-international-callups.mjs has run — see docs/INTERNATIONAL_CALLUPS.md."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <SortableHeader label="Player" sortKey="name" activeKey={sortKey} direction={direction} onSort={onSort} />
            <th>Level</th>
            <th>National team</th>
            <th>Position</th>
            <th>Club</th>
            <SortableHeader label="Age" sortKey="age" activeKey={sortKey} direction={direction} onSort={onSort} />
            <SortableHeader label="Call-up date" sortKey="callUpDate" activeKey={sortKey} direction={direction} onSort={onSort} />
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => (
            <tr key={`${c.playerId}::${c.level}`}>
              <td>
                <Link
                  href={`/player?id=${c.playerId}`}
                  className="font-semibold text-kvm-ink hover:text-kvm-red hover:underline"
                >
                  {c.playerName}
                </Link>
              </td>
              <td>
                <LevelBadge level={c.level} />
              </td>
              <td>{c.teamName}</td>
              <td>{positionLabel(c.position)}</td>
              <td>{c.club ?? "Unknown"}</td>
              <td className="tabular-nums">{calculateAge(c.dateOfBirth) ?? "—"}</td>
              <td className="text-gray-500">{formatDate(c.firstCallUpDate)}</td>
              <td>
                <span className={cn("text-xs", c.appeared ? "text-emerald-700" : "text-gray-400")}>
                  {c.appeared ? "Played" : "Unused sub"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
