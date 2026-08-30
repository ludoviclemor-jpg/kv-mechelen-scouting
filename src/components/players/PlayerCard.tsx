import Link from "next/link";
import { computeMatchStats, positionLabel } from "@/lib/players-data";
import type { Player } from "@/lib/players-data";
import { calculateAge } from "@/lib/utils";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { RatingBadge, StarRating } from "@/components/ui/RatingBadge";
import { RatingTrendSparkline } from "@/components/ui/RatingTrend";
import { ratingTrendSeries } from "@/lib/players-data";
import { ShortlistButton } from "@/components/shortlists/ShortlistButton";

export function PlayerCard({ player }: { player: Player }) {
  const stats = computeMatchStats(player.matches);
  const trend = ratingTrendSeries(player.matches);

  return (
    <div className="flex flex-col justify-between border border-kvm-border bg-white p-4">
      <div>
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/players/${player.id}`}
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
