import Link from "next/link";
import type { InjuredPlayer } from "@/lib/players-data";
import { positionLabel } from "@/lib/players-data";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { HeartPulse } from "lucide-react";

/** Compact dashboard version of the Injury Tracker — same data, top few rows. */
export function InjuryTrackerList({ injured }: { injured: InjuredPlayer[] }) {
  if (injured.length === 0) {
    return <EmptyState icon={HeartPulse} title="No currently injured players found" description="Coverage grows as more players are re-crawled." />;
  }

  return (
    <ul className="divide-y divide-kvm-border">
      {injured.map(({ player: p, description, to }) => (
        <li key={p.id}>
          <Link href={`/player?id=${p.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50">
            <PlayerAvatar name={p.name} photoUrl={p.photoUrl} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-kvm-ink">{p.name}</div>
              <div className="truncate text-xs text-gray-400">
                {positionLabel(p.position)} · {description ?? "Unspecified"}
              </div>
            </div>
            {!to ? (
              <span className="shrink-0 rounded-sm bg-red-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-kvm-red">Ongoing</span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
