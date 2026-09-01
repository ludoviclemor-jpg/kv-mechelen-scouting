import Link from "next/link";
import { computeMatchStats, positionLabel } from "@/lib/players-data";
import type { Player } from "@/lib/players-data";
import { calculateAge } from "@/lib/utils";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { RatingBadge, StarRating } from "@/components/ui/RatingBadge";
import { RatingTrendSparkline } from "@/components/ui/RatingTrend";
import { ratingTrendSeries } from "@/lib/players-data";
import { ShortlistButton } from "@/components/shortlists/ShortlistButton";

/**
 * Lets a caller feed in a rating from a different source than
 * `player.matches` (the primary SofaScore/API-Football slot, see
 * docs/SOFASCORE_PROVIDER.md) — used by the combined Top Performers view
 * (src/lib/topPerformersData.ts) to show Sportmonks-sourced players
 * (docs/SPORTMONKS_INTEGRATION.md) through the same card, clearly
 * labeled by provider rather than blended into the primary numbers.
 * Every other caller omits this and gets the original `player.matches`-derived
 * behavior, unchanged.
 */
export interface PlayerCardRatingOverride {
  average: number | null;
  latest: number | null;
  matchesUsed: number;
  trend: { date: string; rating: number }[];
  sourceLabel: string;
}

export function PlayerCard({ player, ratingOverride }: { player: Player; ratingOverride?: PlayerCardRatingOverride }) {
  const stats = ratingOverride ?? computeMatchStats(player.matches);
  const trend = ratingOverride?.trend ?? ratingTrendSeries(player.matches);

  return (
    <div className="flex flex-col justify-between border border-kvm-border bg-white p-4">
      <div>
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/player?id=${player.id}`}
            className="flex items-center gap-3 hover:underline"
          >
            <PlayerAvatar name={player.name} photoUrl={player.photoUrl} />
            <div>
              <div className="text-sm font-bold text-kvm-ink">{player.name}</div>
              <div className="text-xs text-gray-500">
                {calculateAge(player.dateOfBirth) ?? "—"} yrs · {positionLabel(player.position)}
              </div>
            </div>
          </Link>
          {ratingOverride ? (
            <span className="shrink-0 rounded-sm bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gray-500">
              via {ratingOverride.sourceLabel}
            </span>
          ) : null}
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-gray-500">
          <div>
            <dt className="sr-only">Club</dt>
            <dd className="truncate font-medium text-kvm-ink">{player.club ?? "Unknown club"}</dd>
          </div>
          <div>
            <dt className="sr-only">Nationality</dt>
            <dd className="truncate">{player.nationality ?? "Unknown"}</dd>
          </div>
          <div className="col-span-2">
            <dt className="sr-only">League</dt>
            <dd className="truncate">{player.league ?? "Unknown"}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-4 flex items-end justify-between border-t border-kvm-border pt-3">
        <div>
          <div className="flex items-center gap-2">
            <RatingBadge rating={stats.latest} />
            <span className="text-[11px] text-gray-400">Latest</span>
          </div>
          <div className="mt-1.5 text-sm font-bold text-kvm-ink">
            {stats.average !== null ? stats.average.toFixed(2) : "N/A"}
            <span className="ml-1 text-[11px] font-normal text-gray-400">
              Last {stats.matchesUsed} avg
            </span>
          </div>
          <div className="mt-1">
            <StarRating rating={stats.average} />
          </div>
        </div>
        <RatingTrendSparkline data={trend} />
      </div>

      <div className="mt-3 flex justify-end">
        <ShortlistButton playerId={player.id} />
      </div>
    </div>
  );
}
