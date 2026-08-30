import type { MatchRating } from "@/lib/demo-data";
import { computeMatchStats, ratingTrendSeries } from "@/lib/demo-data";
import { formatDate } from "@/lib/utils";
import { RatingBadge } from "@/components/ui/RatingBadge";
import { RatingTrendChart } from "@/components/ui/RatingTrend";
import { Check, X } from "lucide-react";

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

export function LastMatchesTable({ matches }: { matches: MatchRating[] }) {
  const stats = computeMatchStats(matches);
  const trend = ratingTrendSeries(matches);
  const recent = matches.slice(0, 5);

  return (
    <div className="border border-kvm-border bg-white">
      <h2 className="border-b border-kvm-border px-5 py-3 text-xs font-bold uppercase tracking-wider text-gray-500">
        Last 5 Matches
      </h2>

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

      <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">
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

      <div className="border-t border-kvm-border p-5">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          Rating Trend
        </h3>
        <RatingTrendChart data={trend} />
      </div>
    </div>
  );
}
