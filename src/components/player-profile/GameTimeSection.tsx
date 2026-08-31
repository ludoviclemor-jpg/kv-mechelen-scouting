"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AggregatedStats } from "@/lib/players-data";
import type { PerformanceSeasonRow } from "@/lib/players-data";

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-sm bg-gray-50 px-2.5 py-1.5">
      <div className="text-[9px] font-semibold uppercase tracking-wide text-gray-400">{label}</div>
      <div className="mt-0.5 text-sm font-bold text-kvm-ink tabular-nums">{value}</div>
    </div>
  );
}

/**
 * Appearances / starts / sub appearances / minutes / 90s played, plus a
 * simple starts-vs-sub-appearances bar per season (club rows only — the
 * scoped selection this section is passed, see the player profile page).
 * `starts` is derived (matchesPlayed - substitutes) — SCOUTASTIC doesn't
 * return a separate "starts" field, this is the one reasonable reading
 * of what it does return (see aggregateStats() in
 * src/lib/players-data/performance.ts).
 */
export function GameTimeSection({ stats, seasonRows }: { stats: AggregatedStats; seasonRows: PerformanceSeasonRow[] }) {
  if (stats.matchesPlayed === 0) {
    return <p className="px-1 py-4 text-sm text-gray-400">No matches in this selection.</p>;
  }

  const bySeasonMap = new Map<string, { starts: number; subs: number }>();
  for (const row of seasonRows) {
    const entry = bySeasonMap.get(row.season) ?? { starts: 0, subs: 0 };
    const played = row.matchesPlayed ?? 0;
    const subs = row.substitutes ?? 0;
    entry.starts += Math.max(0, played - subs);
    entry.subs += subs;
    bySeasonMap.set(row.season, entry);
  }
  const chartData = [...bySeasonMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([season, v]) => ({ season, Starts: v.starts, Sub: v.subs }));

  const ninetiesPlayed = stats.minutesPlayed > 0 ? (stats.minutesPlayed / 90).toFixed(1) : "0.0";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
        <Tile label="Appearances" value={stats.matchesPlayed} />
        <Tile label="Starts" value={stats.starts} />
        <Tile label="Sub apps" value={stats.substitutes} />
        <Tile label="Minutes" value={stats.minutesPlayed.toLocaleString()} />
        <Tile label="90s played" value={ninetiesPlayed} />
      </div>

      {chartData.length > 1 ? (
        <div>
          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Starts vs. sub appearances by season</h4>
          <div className="h-28 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ececec" />
                <XAxis dataKey="season" tick={{ fontSize: 11, fill: "#8a8a8a" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#8a8a8a" }} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
                <Tooltip cursor={{ fill: "#fafafa" }} contentStyle={{ fontSize: 12, borderRadius: 2 }} />
                <Bar dataKey="Starts" stackId="a" fill="#161616" />
                <Bar dataKey="Sub" stackId="a" fill="#ffd400" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
