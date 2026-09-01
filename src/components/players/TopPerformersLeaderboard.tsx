import Link from "next/link";
import { positionLabel } from "@/lib/players-data";
import { calculateAge, cn } from "@/lib/utils";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { RatingTrendSparkline } from "@/components/ui/RatingTrend";
import { combinedStats, type TopPerformerEntry } from "@/lib/topPerformersData";

/**
 * The homepage "Top Performers" widget — a ranked leaderboard, not a
 * card grid, since the whole point of this section is "who's in form
 * right now," and rank position (not just the raw number) is the
 * signal. Entries can come from either ratings source (the primary
 * SofaScore/API-Football slot, docs/SOFASCORE_PROVIDER.md, or the
 * Sportmonks TEST integration, docs/SPORTMONKS_INTEGRATION.md) — see
 * src/lib/topPerformersData.ts for how they're merged (never blended
 * per player). Assumes `entries` already arrives ranked (highest
 * average first); this component only renders the order it's given.
 */

const RANK_BADGE_STYLES = ["bg-kvm-red text-white", "bg-kvm-ink text-white", "bg-gray-400 text-white"];

function RankBadge({ rank }: { rank: number }) {
  return (
    <span
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-sm font-bold tabular-nums",
        RANK_BADGE_STYLES[rank - 1] ?? "bg-gray-100 text-gray-400"
      )}
    >
      {rank}
    </span>
  );
}

function ratingTone(rating: number | null): string {
  if (rating === null) return "text-gray-300";
  if (rating >= 7.5) return "text-emerald-600";
  if (rating >= 6.5) return "text-kvm-yellow-dark";
  return "text-gray-500";
}

export function TopPerformersLeaderboard({ entries }: { entries: TopPerformerEntry[] }) {
  return (
    <ul className="divide-y divide-kvm-border">
      {entries.map((entry, i) => {
        const stats = combinedStats(entry);
        const player = entry.player;
        const rank = i + 1;
        return (
          <li key={player.id}>
            <Link
              href={`/player?id=${player.id}`}
              className={cn("flex items-center gap-3 px-5 py-3 transition-colors hover:bg-gray-50", rank === 1 && "bg-red-50/40")}
            >
              <RankBadge rank={rank} />
              <PlayerAvatar name={player.name} photoUrl={player.photoUrl} />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-bold text-kvm-ink">{player.name}</span>
                  {entry.rating ? (
                    <span className="shrink-0 rounded-sm bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gray-500">
                      via {entry.rating.sourceLabel}
                    </span>
                  ) : null}
                </div>
                <div className="truncate text-xs text-gray-500">
                  {player.club ?? "Unknown club"} · {positionLabel(player.position)} · {calculateAge(player.dateOfBirth) ?? "—"} yrs
                </div>
              </div>

              <div className="hidden shrink-0 sm:block">
                <RatingTrendSparkline data={stats.trend} />
              </div>

              <div className="shrink-0 text-right">
                <div className={cn("text-lg font-bold tabular-nums", ratingTone(stats.average))}>
                  {stats.average !== null ? stats.average.toFixed(2) : "N/A"}
                </div>
                <div className="text-[10px] text-gray-400">Last {stats.matchesUsed} avg</div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
