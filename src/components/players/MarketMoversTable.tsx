import Link from "next/link";
import { ArrowUp, ArrowDown, TrendingUp } from "lucide-react";
import type { MarketValueMover } from "@/lib/players-data";
import { positionLabel } from "@/lib/players-data";
import { formatCurrency, formatDateShort, cn } from "@/lib/utils";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { EmptyState } from "@/components/ui/EmptyState";

/** Market Value Movers — real biggest risers/fallers over the lookback window (see fetchMarketValueMovers' own comment, including the €0-faller caveat). */
export function MarketMoversTable({ movers, direction }: { movers: MarketValueMover[]; direction: "risers" | "fallers" }) {
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
            <th>Player</th>
            <th>Position</th>
            <th>Club</th>
            <th>League</th>
            <th>From</th>
            <th>To</th>
            <th>Change</th>
          </tr>
        </thead>
        <tbody>
          {movers.map((m) => (
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
