"use client";

import Link from "next/link";
import { ArrowUp, ArrowDown, TrendingUp } from "lucide-react";
import type { MarketValueMover } from "@/lib/players-data";
import { positionLabel } from "@/lib/players-data";
import { formatCurrency, formatDateShort, compareNumbers, compareStrings, cn } from "@/lib/utils";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { SortableHeader } from "@/components/ui/SortableHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { useSortableList } from "@/lib/useSortableList";

type SortKey = "name" | "baselineValue" | "latestValue" | "changePct";

/** Market Value Movers — real biggest risers/fallers over the lookback window (see fetchMarketValueMovers' own comment, including the €0-faller caveat). Render with `key={direction}` from the caller so toggling Risers/Fallers resets to a fresh, direction-appropriate sort instead of keeping stale sort state. */
export function MarketMoversTable({ movers, direction }: { movers: MarketValueMover[]; direction: "risers" | "fallers" }) {
  const { sorted, sortKey, direction: sortDirection, onSort } = useSortableList<MarketValueMover, SortKey>(
    movers,
    {
      name: (a, b) => compareStrings(a.player.name, b.player.name),
      baselineValue: (a, b) => compareNumbers(a.baselineValue, b.baselineValue),
      latestValue: (a, b) => compareNumbers(a.latestValue, b.latestValue),
      changePct: (a, b) => compareNumbers(a.changePct, b.changePct),
    },
    "changePct",
    direction === "risers" ? "desc" : "asc"
  );

  if (movers.length === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="No movers found"
        description="Try a longer lookback window, or clearing a filter."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <SortableHeader label="Player" sortKey="name" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
            <th>Position</th>
            <th>Club</th>
            <th>League</th>
            <SortableHeader label="From" sortKey="baselineValue" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
            <SortableHeader label="To" sortKey="latestValue" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
            <SortableHeader label="Change" sortKey="changePct" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((m) => (
            <tr key={m.player.id}>
              <td>
                <Link href={`/player?id=${m.player.id}`} className="flex items-center gap-2 font-semibold text-kvm-ink hover:text-kvm-red hover:underline">
                  <PlayerAvatar name={m.player.name} photoUrl={m.player.photoUrl} size="sm" />
                  {m.player.name}
                </Link>
              </td>
              <td>{positionLabel(m.player.position)}</td>
              <td>{m.player.club ?? "Unknown"}</td>
              <td className="text-gray-500">{m.player.league ?? "Unknown"}</td>
              <td className="tabular-nums text-gray-500">
                {formatCurrency(m.baselineValue)} <span className="text-[10px]">({formatDateShort(m.baselineDate)})</span>
              </td>
              <td className="tabular-nums font-semibold text-kvm-ink">
                {formatCurrency(m.latestValue)} <span className="text-[10px] font-normal text-gray-400">({formatDateShort(m.latestDate)})</span>
              </td>
              <td className={cn("flex items-center gap-1 tabular-nums font-bold", direction === "risers" ? "text-emerald-600" : "text-kvm-red")}>
                {direction === "risers" ? <ArrowUp size={13} aria-hidden="true" /> : <ArrowDown size={13} aria-hidden="true" />}
                {Math.abs(m.changePct).toFixed(0)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
