import type { MatchRating, SofaScoreMatchStatus } from "@/lib/players-data";
import { computeMatchStats, ratingTrendSeries } from "@/lib/players-data";
import { formatDate } from "@/lib/utils";
import { RatingBadge } from "@/components/ui/RatingBadge";
import { RatingTrendChart } from "@/components/ui/RatingTrend";
import { EmptyState } from "@/components/ui/EmptyState";
import { Check, X, Radar } from "lucide-react";

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-kvm-border bg-white px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </div>
      <div className="mt-1 text-lg font-bold text-kvm-ink">{value}</div>
    </div>
  );
}

const UNAVAILABLE_REASON: Record<SofaScoreMatchStatus, string> = {
  pending: "This player hasn't been checked against a ratings provider yet.",
  ambiguous: "Multiple possible ratings profiles were found — needs manual review before ratings can be shown.",
  not_found: "No ratings profile could be confidently matched for this player.",
  matched: "Matched, but no rated matches are available yet.",
};

export function LastMatchesTable({
  matches,
  sofascoreMatchStatus,
}: {
  matches: MatchRating[];
  sofascoreMatchStatus: SofaScoreMatchStatus;
}) {
  const stats = computeMatchStats(matches);
  const trend = ratingTrendSeries(matches);
  const recent = matches.slice(0, 5);

  if (recent.length === 0) {
    return (
      <EmptyState
        icon={Radar}
        title="Rating data unavailable"
        description={UNAVAILABLE_REASON[sofascoreMatchStatus]}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Competition</th>
              <th>Opponent</th>
              <th>Result</th>
              <th>Minutes</th>
              <th>Starter</th>
              <th>Rating</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((m) => (
              <tr key={`${m.date}-${m.opponent}`}>
                <td className="text-gray-500">{formatDate(m.date)}</td>
                <td>{m.competition}</td>
                <td>{m.opponent}</td>
                <td>{m.result}</td>
                <td className="tabular-nums">{m.minutes}&apos;</td>
                <td>
                  {m.starter ? (
                    <Check size={15} className="text-emerald-600" aria-label="Starter" />
                  ) : (
                    <X size={15} className="text-gray-300" aria-label="Substitute" />
                  )}
                </td>
                <td>
                  <RatingBadge rating={m.rating} size="sm" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryStat
          label="Last 5 Average"
          value={stats.average !== null ? stats.average.toFixed(2) : "N/A"}
        />
        <SummaryStat
          label="Highest Rating"
          value={stats.highest !== null ? stats.highest.toFixed(2) : "N/A"}
        />
        <SummaryStat
          label="Lowest Rating"
          value={stats.lowest !== null ? stats.lowest.toFixed(2) : "N/A"}
        />
        <SummaryStat
          label="Average Minutes"
          value={stats.averageMinutes !== null ? `${stats.averageMinutes}'` : "N/A"}
        />
      </div>

      <div>
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          Rating Trend
        </h4>
        <RatingTrendChart data={trend} />
      </div>
    </div>
  );
}
