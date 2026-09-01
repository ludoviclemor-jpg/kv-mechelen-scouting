"use client";

import Link from "next/link";
import { Trophy, Star } from "lucide-react";
import type { MatchSummary } from "@/lib/matches-data";
import { cn } from "@/lib/utils";

function kickoffLabel(iso: string | null): string {
  if (!iso) return "TBD";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
}

function statusBadge(status: string | null) {
  if (status === "played") return null; // score already communicates this
  return (
    <span className="rounded-sm bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gray-500">
      {status ?? "Scheduled"}
    </span>
  );
}

interface CountryGroup {
  area: string;
  competitions: { id: string | null; name: string; matches: MatchSummary[] }[];
}

/**
 * Favorited competitions sort first at both levels — within a country
 * group (so a favorited competition never gets buried under an
 * alphabetically-earlier one in the same country) and across country
 * groups (so a country containing a favorite comes before one that
 * doesn't) — falling back to alphabetical among ties either way. See
 * docs/EXPLORE.md.
 */
export function groupMatches(matches: MatchSummary[], favoriteCompetitionIds: Set<string> = new Set()): CountryGroup[] {
  const byArea = new Map<string, Map<string, { id: string | null; name: string; matches: MatchSummary[] }>>();
  for (const m of matches) {
    const area = m.competitionArea ?? "Other";
    const compKey = m.competitionId ?? m.competitionName ?? "unknown";
    if (!byArea.has(area)) byArea.set(area, new Map());
    const comps = byArea.get(area)!;
    if (!comps.has(compKey)) comps.set(compKey, { id: m.competitionId, name: m.competitionName ?? "Unknown competition", matches: [] });
    comps.get(compKey)!.matches.push(m);
  }

  function isFavorite(id: string | null) {
    return id !== null && favoriteCompetitionIds.has(id);
  }

  return Array.from(byArea.entries())
    .map(([area, comps]) => {
      const competitions = Array.from(comps.values()).sort((a, b) => {
        const favDiff = Number(isFavorite(b.id)) - Number(isFavorite(a.id));
        return favDiff !== 0 ? favDiff : a.name.localeCompare(b.name);
      });
      return { area, competitions, hasFavorite: competitions.some((c) => isFavorite(c.id)) };
    })
    .sort((a, b) => {
      const favDiff = Number(b.hasFavorite) - Number(a.hasFavorite);
      return favDiff !== 0 ? favDiff : a.area.localeCompare(b.area);
    })
    .map(({ area, competitions }) => ({ area, competitions }));
}

export function MatchList({
  groups,
  favoriteCompetitionIds = new Set(),
  onToggleFavorite,
}: {
  groups: CountryGroup[];
  favoriteCompetitionIds?: Set<string>;
  onToggleFavorite?: (competitionId: string) => void;
}) {
  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <section key={group.area} className="border border-kvm-border bg-white">
          <h2 className="border-b border-kvm-border bg-gray-50 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-gray-500">
            {group.area}
          </h2>
          {group.competitions.map((comp) => {
            const isFavorite = comp.id !== null && favoriteCompetitionIds.has(comp.id);
            return (
              <div key={comp.id ?? comp.name} className="border-b border-kvm-border last:border-b-0">
                <div className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-gray-500">
                  <Trophy size={12} className="text-gray-300" aria-hidden="true" />
                  {comp.id ? (
                    <Link href={`/competition?id=${comp.id}`} className="hover:text-kvm-red hover:underline">
                      {comp.name}
                    </Link>
                  ) : (
                    comp.name
                  )}
                  {comp.id && onToggleFavorite ? (
                    <button
                      type="button"
                      onClick={() => onToggleFavorite(comp.id!)}
                      aria-label={isFavorite ? `Remove ${comp.name} from favorites` : `Add ${comp.name} to favorites`}
                      aria-pressed={isFavorite}
                      title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                      className="text-gray-300 hover:text-kvm-yellow-dark"
                    >
                      <Star size={13} className={cn(isFavorite && "fill-kvm-yellow text-kvm-yellow-dark")} aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
                <ul className="divide-y divide-kvm-border">
                  {comp.matches.map((m) => (
                    <li key={m.id}>
                      <Link
                        href={`/explore/match?id=${m.id}`}
                        className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-gray-50"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="w-12 shrink-0 text-xs font-semibold tabular-nums text-gray-400">
                            {kickoffLabel(m.date)}
                          </span>
                          <span className="truncate text-sm font-medium text-kvm-ink">
                            {m.homeTeamName ?? "TBD"} <span className="text-gray-400">vs</span> {m.awayTeamName ?? "TBD"}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {statusBadge(m.status)}
                          <span
                            className={cn(
                              "text-sm font-bold tabular-nums",
                              m.status === "played" ? "text-kvm-ink" : "text-gray-300"
                            )}
                          >
                            {m.score ?? "–"}
                          </span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
