import Link from "next/link";
import type { Player } from "@/lib/players-data";
import { positionLabel } from "@/lib/players-data";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { ContractBadge } from "@/components/ui/ContractBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { FileClock } from "lucide-react";

/** Compact dashboard version of Contract Watch — same data, top few rows. */
export function ContractWatchList({ players }: { players: Player[] }) {
  if (players.length === 0) {
    return <EmptyState icon={FileClock} title="No expiring contracts found" description="Nobody currently falls in the tracked window." />;
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
            <ContractBadge expiryIso={p.contractExpiry} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
