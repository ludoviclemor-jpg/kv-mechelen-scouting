"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TrendingUp, HeartPulse, Shirt } from "lucide-react";
import type { InjuryRecord, MarketValuePoint } from "@/lib/players-data";
import { formatCurrency, formatDate, formatDateShort } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";

const RECENT_INJURIES_SHOWN = 8;

/**
 * Real, dated market-value points (`marketValueHistory`, confirmed live
 * against Mbappé/Yamal/Haaland — see docs/PLAYER_PROFILE.md) — never a
 * synthesized trend from just the current value.
 */
function MarketValueTrend({ history }: { history: MarketValuePoint[] }) {
  if (history.length < 2) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="Not enough market value history"
        description="SCOUTASTIC has fewer than two dated market-value points for this player yet."
      />
    );
  }

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={history} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="marketValueGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#d0021b" stopOpacity={0.15} />
              <stop offset="100%" stopColor="#d0021b" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tickFormatter={(v: string) => formatDateShort(v)}
            tick={{ fontSize: 10, fill: "#8a8a8a" }}
            minTickGap={40}
          />
          <YAxis
            tickFormatter={(v: number) => formatCurrency(v)}
            tick={{ fontSize: 10, fill: "#8a8a8a" }}
            width={52}
          />
          <Tooltip
            formatter={(value) => [formatCurrency(typeof value === "number" ? value : null), "Market value"]}
            labelFormatter={(label) => formatDate(typeof label === "string" ? label : null)}
            contentStyle={{ fontSize: 12, borderRadius: 2, borderColor: "#e5e5e5" }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#d0021b"
            strokeWidth={2}
            fill="url(#marketValueGradient)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function injuryDuration(injury: InjuryRecord): string | null {
  if (!injury.to) return null;
  const days = Math.round((new Date(injury.to).getTime() - new Date(injury.from).getTime()) / 86_400_000);
  return days >= 0 ? `${days} day${days === 1 ? "" : "s"}` : null;
}

/**
 * Real injury spells (`injuryHistory`, confirmed live — needs
 * injuryData=true on the crawl, see scripts/lib/scoutasticClient.mjs).
 * Most recent first; capped to a "quick recap" of the most recent
 * RECENT_INJURIES_SHOWN, with a real total count shown regardless.
 */
function InjuryRecap({ history }: { history: InjuryRecord[] }) {
  if (history.length === 0) {
    return <EmptyState icon={HeartPulse} title="No injury history" description="SCOUTASTIC has no recorded injuries for this player." />;
  }

  const mostRecentFirst = [...history].reverse();
  const shown = mostRecentFirst.slice(0, RECENT_INJURIES_SHOWN);

  return (
    <div className="space-y-2">
      <ul className="divide-y divide-kvm-border">
        {shown.map((injury, i) => (
          <li key={`${injury.from}-${i}`} className="flex items-center justify-between gap-3 py-1.5 text-sm">
            <span className="font-medium text-kvm-ink">{injury.description}</span>
            <span className="shrink-0 text-right text-xs text-gray-500">
              {formatDate(injury.from)}
              {injury.to ? ` – ${formatDate(injury.to)}` : " – ongoing at last sync"}
              {injuryDuration(injury) ? <span className="text-gray-400"> · {injuryDuration(injury)}</span> : null}
            </span>
          </li>
        ))}
      </ul>
      {history.length > RECENT_INJURIES_SHOWN ? (
        <p className="text-xs text-gray-400">
          {history.length} total injuries recorded — showing the {RECENT_INJURIES_SHOWN} most recent.
        </p>
      ) : (
        <p className="text-xs text-gray-400">{history.length} total injuries recorded.</p>
      )}
    </div>
  );
}

/**
 * Youth clubs only — a real free-text string from SCOUTASTIC
 * (`youthTeams`, e.g. "AS Bondy (2004-2011), INF Clairefontaine
 * (2011-2013), AS Monaco (2013-2016)"). There is no confirmed source for
 * senior transfer/club history in the API (see docs/PLAYER_PROFILE.md) —
 * the current club is already shown in the profile header above, so this
 * deliberately doesn't repeat it.
 */
function YouthClubs({ youthTeams }: { youthTeams: string | null }) {
  if (!youthTeams) {
    return <EmptyState icon={Shirt} title="No youth club history" description="SCOUTASTIC has no recorded youth clubs for this player." />;
  }
  const clubs = youthTeams.split(",").map((c) => c.trim()).filter(Boolean);
  return (
    <ul className="space-y-1.5 text-sm">
      {clubs.map((club, i) => (
        <li key={i} className="text-kvm-ink">
          {club}
        </li>
      ))}
    </ul>
  );
}

export function CareerHistorySection({
  marketValueHistory,
  injuryHistory,
  youthTeams,
}: {
  marketValueHistory: MarketValuePoint[];
  injuryHistory: InjuryRecord[];
  youthTeams: string | null;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">Market Value</h3>
          <MarketValueTrend history={marketValueHistory} />
        </section>
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">Injury History</h3>
          <InjuryRecap history={injuryHistory} />
        </section>
      </div>
      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">Youth Clubs</h3>
        <YouthClubs youthTeams={youthTeams} />
      </section>
    </div>
  );
}
