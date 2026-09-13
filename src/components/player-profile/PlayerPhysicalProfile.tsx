"use client";

import { Activity, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Legend, Tooltip } from "recharts";
import type { PlayerPhysicalProfile as PlayerPhysicalProfileData } from "@/lib/skillcorner-data/remote";
import { PHYSICAL_METRICS } from "@/lib/skillcorner-data/remote";
import { MIN_POPULATION } from "@/lib/percentile";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState, ErrorState } from "@/components/ui/LoadingState";

const AVERAGE_DEAD_ZONE = 5;

function averageComparison(percentile: number | null) {
  if (percentile === null) return null;
  if (percentile > 50 + AVERAGE_DEAD_ZONE) return { direction: "above" as const, Icon: ArrowUp, className: "text-emerald-700" };
  if (percentile < 50 - AVERAGE_DEAD_ZONE) return { direction: "below" as const, Icon: ArrowDown, className: "text-kvm-red" };
  return { direction: "average" as const, Icon: Minus, className: "text-gray-400" };
}

function AverageBadge({ percentile }: { percentile: number | null }) {
  const comparison = averageComparison(percentile);
  if (!comparison) return <span className="text-gray-300">—</span>;
  const { Icon, className, direction } = comparison;
  const label = direction === "above" ? "Above average" : direction === "below" ? "Below average" : "Average";
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", className)}>
      <Icon size={12} aria-hidden="true" />
      {label}
    </span>
  );
}

function formatValue(value: number | null, unit: string): string {
  if (value === null) return "—";
  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return unit ? `${rounded.toLocaleString("en-GB")} ${unit}` : rounded.toLocaleString("en-GB");
}

export function PlayerPhysicalProfile({
  profile,
  loading,
  error,
  onRetry,
  compact = false,
}: {
  profile: PlayerPhysicalProfileData | null;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  /** Chart + cohort line only — no metric table. Used for the always-visible top-of-profile zone (2026-09-11 redesign); the full breakdown still renders in the Ratings tab. */
  compact?: boolean;
}) {
  if (error) return <ErrorState message={error.message} onRetry={onRetry} />;
  if (loading) return <LoadingState label="Loading physical data…" />;
  if (!profile) {
    return (
      <EmptyState
        icon={Activity}
        title="No SkillCorner data yet"
        description="This player hasn't been matched to real SkillCorner physical tracking data yet — run scripts/sync-skillcorner-physical.mjs for their competition."
      />
    );
  }

  const { physical, percentiles, cohortSize } = profile;
  const hasEnoughPeers = cohortSize >= MIN_POPULATION;

  // Only metrics with a real percentile go on the chart — a metric this
  // player genuinely has no value for (rather than just a too-small
  // cohort) is excluded from the axis entirely, never plotted as a
  // fabricated 0 (see percentiles[metric.key] being `undefined`, not
  // `0`, for a metric fetchPlayerPhysicalProfile skipped).
  const radarData = hasEnoughPeers
    ? PHYSICAL_METRICS.filter((metric) => percentiles[metric.key] !== undefined && percentiles[metric.key] !== null).map((metric) => ({
        metric: metric.label,
        score: percentiles[metric.key] as number,
        average: 50,
      }))
    : [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Physical Profile — SkillCorner</h3>
        <span className="text-[11px] text-gray-400">
          {physical.competitionName} {physical.seasonName} · {physical.countMatch} matches tracked
        </span>
      </div>

      {!hasEnoughPeers ? (
        <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-inset ring-amber-200">
          Only {cohortSize} comparable {physical.positionGroup ?? "position"} player{cohortSize === 1 ? "" : "s"} tracked in this
          competition so far — percentiles need at least {MIN_POPULATION} to be meaningful, so raw values are shown below without a
          comparison.
        </div>
      ) : null}

      {hasEnoughPeers && radarData.length < 3 ? (
        <p className="text-xs text-gray-400">Not enough real physical metrics available yet to draw a chart for this player.</p>
      ) : null}

      {hasEnoughPeers && radarData.length >= 3 ? (
        <div className={compact ? "h-56 w-full" : "h-72 w-full"}>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} outerRadius="75%">
              <PolarGrid stroke="#e7e1d4" />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: compact ? 9 : 10, fill: "#6b665f" }} />
              <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#a39d8e" }} tickCount={5} />
              <Radar name="Cohort average" dataKey="average" stroke="#a39d8e" strokeDasharray="4 3" fill="none" isAnimationActive={false} />
              <Radar name="This player" dataKey="score" stroke="#2563eb" fill="#2563eb" fillOpacity={0.2} isAnimationActive={false} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6, borderColor: "#e7e1d4" }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      <p className="text-xs text-gray-500">
        <span className="font-semibold text-gray-700">Compared with: </span>
        {cohortSize} other {physical.positionGroup ?? "players"} tracked in {physical.competitionName} {physical.seasonName}
      </p>

      {!compact ? (
        <>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Value</th>
                  <th>vs. Cohort Average</th>
                  <th>Percentile</th>
                </tr>
              </thead>
              <tbody>
                {PHYSICAL_METRICS.map((metric) => {
                  const value = physical[metric.key];
                  const percentile = hasEnoughPeers ? (percentiles[metric.key] ?? null) : null;
                  return (
                    <tr key={metric.key}>
                      <td className="font-medium text-kvm-ink">{metric.label}</td>
                      <td className="tabular-nums text-gray-600">{formatValue(value, metric.unit)}</td>
                      <td>
                        <AverageBadge percentile={percentile} />
                      </td>
                      <td className="tabular-nums text-gray-600">{percentile !== null ? `${percentile}th` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 gap-3 border-t border-kvm-border pt-4 text-xs text-gray-500 sm:grid-cols-2">
            <div>
              <span className="font-semibold text-gray-700">Comparison group: </span>
              {cohortSize} other {physical.positionGroup ?? "players"} tracked in {physical.competitionName} {physical.seasonName}
            </div>
            <div>
              <span className="font-semibold text-gray-700">Source: </span>SkillCorner tracking data · updated{" "}
              {new Date(physical.updatedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
