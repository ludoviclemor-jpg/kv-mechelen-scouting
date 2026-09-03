import Link from "next/link";
import { ArrowUp } from "lucide-react";
import type { MarketValueMover } from "@/lib/players-data";
import { positionLabel } from "@/lib/players-data";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { TrendingUp } from "lucide-react";

/** Compact dashboard version of Market Value Movers (risers only) — same data, top few rows. */
export function MarketMoversList({ movers }: { movers: MarketValueMover[] }) {
  if (movers.length === 0) {
    return <EmptyState icon={TrendingUp} title="No risers found" description="Nobody currently has a real market value increase in the window." />;
  }

  return (
    <ul className="divide-y divide-kvm-border">
      {movers.map((m) => (
        <li key={m.player.id}>
          <Link href={`/player?id=${m.player.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50">
            <PlayerAvatar name={m.player.name} photoUrl={m.player.photoUrl} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-kvm-ink">{m.player.name}</div>
              <div className="truncate text-xs text-gray-400">
                {positionLabel(m.player.position)} · {m.player.club ?? "Unknown club"}
              </div>
            </div>
            <span className="flex shrink-0 items-center gap-0.5 text-xs font-bold tabular-nums text-emerald-600">
              <ArrowUp size={12} aria-hidden="true" />
              {m.changePct.toFixed(0)}%
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
