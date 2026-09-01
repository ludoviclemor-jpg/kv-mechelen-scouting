"use client";

import { useState } from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import { fetchTopRatedPlayers, SPORTMONKS_LEAGUE_FILTERS } from "@/lib/sportmonks-data";
import { useAsync } from "@/lib/players-data";
import { FilterSelect } from "@/components/ui/FilterBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState, ErrorState } from "@/components/ui/LoadingState";

/**
 * TEST widget — Sportmonks ratings only, Danish Superliga + Scottish
 * Premiership (see docs/SPORTMONKS_INTEGRATION.md). Distinct from the
 * existing "Top Performers" section (SofaScore/API-Football provider
 * slot, docs/SOFASCORE_PROVIDER.md) — a separate, independent ratings
 * source, never blended with it.
 */

const MIN_RATING_OPTIONS = [6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0];
const MIN_APPEARANCE_OPTIONS = [1, 2, 3, 4, 5];

export function TopRatedPlayersWidget() {
  const [league, setLeague] = useState("all");
  const [minAvgRating, setMinAvgRating] = useState(6.0);
  const [minAppearances, setMinAppearances] = useState(3);

  const {
    data: players,
    loading,
    error,
  } = useAsync(
    () =>
      fetchTopRatedPlayers({
        competitionIds: league === "all" ? undefined : [league],
        minAvgRating,
        minAppearances,
        limit: 10,
      }),
    [league, minAvgRating, minAppearances]
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-kvm-border px-5 py-2.5">
        <FilterSelect
          label="League"
          value={league}
          onChange={setLeague}
          options={[{ value: "all", label: "All leagues" }, ...SPORTMONKS_LEAGUE_FILTERS.map((l) => ({ value: l.id, label: l.name }))]}
        />
        <FilterSelect
          label="Min Rating"
          value={String(minAvgRating)}
          onChange={(v) => setMinAvgRating(Number(v))}
          options={MIN_RATING_OPTIONS.map((r) => ({ value: String(r), label: r.toFixed(1) }))}
        />
        <FilterSelect
          label="Min Matches"
          value={String(minAppearances)}
          onChange={(v) => setMinAppearances(Number(v))}
          options={MIN_APPEARANCE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
        />
      </div>

      {error ? (
        <ErrorState message={error.message} />
      ) : loading ? (
        <LoadingState label="Loading top rated players…" />
      ) : !players || players.length === 0 ? (
        <EmptyState
          icon={Star}
          title="No rated players yet"
          description="Sportmonks ratings are a test integration scoped to the Danish Superliga and Scottish Premiership — try lowering the filters, or check back once more matches are synced."
        />
      ) : (
        <ul className="divide-y divide-kvm-border">
          {players.map((p, i) => (
            <li key={p.playerId}>
              <Link href={`/player?id=${p.playerId}`} className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-gray-50">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="w-5 shrink-0 text-right text-xs font-semibold tabular-nums text-gray-400">{i + 1}</span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-kvm-ink">{p.playerName}</div>
                    <div className="truncate text-xs text-gray-400">
                      {p.club ?? "Unknown club"} · {p.competitionName ?? "Unknown league"}
                    </div>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-bold tabular-nums text-kvm-ink">{p.avgRating.toFixed(2)}</div>
                  <div className="text-[10px] text-gray-400">{p.ratedMatches} matches</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
