import { Radar, House, Plane } from "lucide-react";
import type { PlayerRecentPerformance } from "@/lib/sportmonks-data";
import { ratingTier } from "@/lib/sportmonks-data";
import { formatDateShort, cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * TEST integration (Danish Superliga + Scottish Premiership only, see
 * docs/SPORTMONKS_INTEGRATION.md) — reads only from
 * player_match_ratings, already synced by scripts/sync-sportmonks-ratings.mjs.
 * Never calls Sportmonks directly, never shows a placeholder rating.
 */

const TIER_STYLES: Record<ReturnType<typeof ratingTier>, string> = {
  excellent: "bg-emerald-600 text-white",
  "very-good": "bg-emerald-400 text-white",
  good: "bg-kvm-yellow text-kvm-ink",
  average: "bg-gray-300 text-kvm-ink",
  poor: "bg-kvm-red text-white",
};

const TIER_LABELS: Record<ReturnType<typeof ratingTier>, string> = {
  excellent: "Excellent (8.0+)",
  "very-good": "Very Good (7.5–7.9)",
  good: "Good (7.0–7.4)",
  average: "Average (6.5–6.9)",
  poor: "Poor (below 6.5)",
};

function SportmonksRatingBadge({ rating }: { rating: number }) {
  const tier = ratingTier(rating);
  return (
    <span
      title={TIER_LABELS[tier]}
      className={cn("inline-flex min-w-[2.75rem] items-center justify-center rounded-sm px-2 py-1 text-sm font-bold tabular-nums", TIER_STYLES[tier])}
    >
      {rating.toFixed(1)}
    </span>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-kvm-border bg-white px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</div>
      <div className="mt-1 text-lg font-bold text-kvm-ink">{value}</div>
    </div>
  );
}

export function RecentPerformanceSection({ performance }: { performance: PlayerRecentPerformance }) {
  const { ratings, last5Average, seasonAverage } = performance;

  if (ratings.length === 0) {
    return (
      <EmptyState
        icon={Radar}
        title="No performance ratings available yet."
        description="Sportmonks ratings are a test integration scoped to the Danish Superliga and Scottish Premiership — this player isn't in either league, or no matches have been synced yet."
      />
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Opponent</th>
              <th>Competition</th>
              <th>Date</th>
              <th>Min</th>
              <th>Status</th>
              <th>Rating</th>
            </tr>
          </thead>
          <tbody>
            {ratings.map((r) => (
              <tr key={r.fixtureId}>
                <td className="font-medium text-kvm-ink">
                  <span className="inline-flex items-center gap-1.5">
                    {r.homeAway === "home" ? (
                      <House size={13} className="shrink-0 text-gray-400" aria-label="Home game" />
                    ) : r.homeAway === "away" ? (
                      <Plane size={13} className="shrink-0 text-gray-400" aria-label="Away game" />
                    ) : null}
                    {r.opponent ?? "Unknown opponent"}
                  </span>
                </td>
                <td className="text-gray-500">{r.competitionName ?? "Unknown"}</td>
                <td className="text-gray-500">{formatDateShort(r.matchDate)}</td>
                <td className="tabular-nums">{r.minutesPlayed !== null ? r.minutesPlayed : "—"}</td>
                <td className="text-xs text-gray-500">{r.starter === true ? "Starter" : r.starter === false ? "Substitute" : "—"}</td>
                <td>
                  <SportmonksRatingBadge rating={r.rating} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 gap-3 p-5">
        <SummaryStat label="Last 5 Average" value={last5Average !== null ? last5Average.toFixed(2) : "N/A"} />
        <SummaryStat label="Season Average" value={seasonAverage !== null ? seasonAverage.toFixed(2) : "Not available"} />
      </div>
    </div>
  );
}
