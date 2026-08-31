import Link from "next/link";
import type { Player } from "@/lib/players-data";
import { positionLabel } from "@/lib/players-data";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { ArrowRightLeft } from "lucide-react";

/** Compact dashboard version of Loan Watch (see docs/LOAN_WATCH.md) — same data, top few rows. */
export function LoanWatchList({ players }: { players: Player[] }) {
  if (players.length === 0) {
    return (
      <EmptyState
        icon={ArrowRightLeft}
        title="No limited-game-time players found"
        description="Nobody currently falls under the minutes threshold."
      />
    );
  }

  return (
    <ul className="divide-y divide-kvm-border">
      {players.map((p) => (
        <li key={p.id}>
          <Link href={`/player?id=${p.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50">
            <PlayerAvatar name={p.name} photoUrl={p.photoUrl} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-kvm-ink">{p.name}</div>
              <div className="truncate text-xs text-gray-400">
                {positionLabel(p.position)} · {p.club ?? "Unknown club"}
              </div>
            </div>
            <span className="shrink-0 text-xs font-semibold text-kvm-red tabular-nums">{p.minutes ?? 0}&apos;</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
