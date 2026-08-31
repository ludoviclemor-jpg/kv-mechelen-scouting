import Link from "next/link";
import type { Player } from "@/lib/players-data";
import { positionLabel } from "@/lib/players-data";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { Star } from "lucide-react";

/** Compact "Shortlist / Priority Players" dashboard widget (item 21) — players currently marked `priority`, most recently flagged first. */
export function PriorityPlayersList({ players }: { players: Player[] }) {
  if (players.length === 0) {
    return (
      <EmptyState
        icon={Star}
        title="No priority players yet"
        description="Mark a player Priority from their profile to see them here."
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
          </Link>
        </li>
      ))}
    </ul>
  );
}
