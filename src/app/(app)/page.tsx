"use client";

import Link from "next/link";
import { Users, Globe2, TrendingUp, Trophy, MapPin, ArrowRight } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState, ErrorState } from "@/components/ui/LoadingState";
import { SyncStatusBanner } from "@/components/ui/SyncStatusBanner";
import { TopPerformersLeaderboard } from "@/components/players/TopPerformersLeaderboard";
import { DebutantTable } from "@/components/players/DebutantTable";
import { RecentlyAddedTable } from "@/components/players/RecentlyAddedTable";
import { CallUpTable } from "@/components/players/CallUpTable";
import { TodaysMatches } from "@/components/matches/TodaysMatches";
import { TopRatedPlayersWidget } from "@/components/dashboard/TopRatedPlayersWidget";
import { ScoutingRadarWidget } from "@/components/dashboard/ScoutingRadarWidget";
import {
  fetchAfricanDebutants,
  fetchRecentlyAdded,
  fetchPriorityPlayers,
  fetchLoanWatchCandidates,
  fetchContractWatchCandidates,
  fetchCurrentlyInjuredPlayers,
  fetchMarketValueMovers,
  useAsync,
} from "@/lib/players-data";
import { fetchCompetitionsSummary, fetchRecentlyUpdatedCompetitions } from "@/lib/competitions-data";
import { fetchFirstCallUps } from "@/lib/callups-data";
import { fetchCombinedTopPerformers } from "@/lib/topPerformersData";

/**
 * Dashboard grid — with the sidebar gone (Phase 1), there's real
 * horizontal room to give the highest-signal widgets (today's matches,
 * first call-ups, top performers) more space and let the lower-priority
 * ones (debutants/recently-added/competitions) share a row, instead of
 * stacking six full-width sections top to bottom (item 21/22).
 */
export default function DashboardPage() {
  // Merges the primary ratings slot (empty today — see
  // docs/SOFASCORE_PROVIDER.md) with the Sportmonks TEST integration
  // (docs/SPORTMONKS_INTEGRATION.md), never blended per player.
  const topPerformers = useAsync(() => fetchCombinedTopPerformers(8), []);
  const debutants = useAsync(() => fetchAfricanDebutants(4), []);
  const recentlyAdded = useAsync(() => fetchRecentlyAdded(8), []);
  const priorityPlayers = useAsync(() => fetchPriorityPlayers(6), []);
  const loanWatch = useAsync(() => fetchLoanWatchCandidates({ limit: 5, maxTierLevel: 2 }), []); // top-2-divisions default, same as the /loan-watch page — see fetchProfessionalCompetitionIds' own comment for why
  const contractWatch = useAsync(() => fetchContractWatchCandidates({ window: "expiring12", maxTierLevel: 2, limit: 5 }), []);
  const injuryTracker = useAsync(() => fetchCurrentlyInjuredPlayers(null), []);
  const marketMovers = useAsync(() => fetchMarketValueMovers("risers", 180, 2, 5), []);
  const competitionsSummary = useAsync(() => fetchCompetitionsSummary(), []);
  const recentCompetitions = useAsync(() => fetchRecentlyUpdatedCompetitions(5), []);
  const callUps = useAsync(() => fetchFirstCallUps({ limit: 6 }), []);

  const loading = topPerformers.loading || debutants.loading || recentlyAdded.loading;
  const error = topPerformers.error ?? debutants.error ?? recentlyAdded.error;

  return (
    <>
      <div className="space-y-6 p-8">
        <SyncStatusBanner />

        {error ? (
          <ErrorState message={error.message} />
        ) : loading ? (
          <LoadingState label="Loading dashboard…" />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <section className="border border-kvm-border bg-white pb-2 shadow-sm">
                <SectionHeader title="Today's Matches" viewAllHref="/explore" />
                <TodaysMatches />
              </section>

              <section className="border border-kvm-border bg-white pb-2 shadow-sm">
                <SectionHeader title="First International Call-Ups" viewAllHref="/call-ups" />
                <div className="pt-3">
                  <CallUpTable callUps={callUps.data ?? []} />
                </div>
              </section>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <section className="border border-kvm-border bg-white pb-4 shadow-sm xl:col-span-2">
                <SectionHeader title="Top Performers" viewAllHref="/top-performers" />
                {topPerformers.data!.length === 0 ? (
                  <EmptyState
                    icon={TrendingUp}
                    title="No top performers yet"
                    description="Players need at least 3 rated matches to appear here — see Settings for ratings provider status."
                  />
                ) : (
                  <TopPerformersLeaderboard entries={topPerformers.data!} />
                )}
              </section>

              <ScoutingRadarWidget
                priorityPlayers={priorityPlayers.data ?? []}
                loanWatch={loanWatch.data ?? []}
                contractWatch={contractWatch.data ?? []}
                injuries={(injuryTracker.data ?? []).slice(0, 5)}
                marketMovers={marketMovers.data ?? []}
              />
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <section className="border border-kvm-border bg-white pb-2 shadow-sm">
                <SectionHeader title="African Debutants" viewAllHref="/debutants" />
                <div className="pt-3">
                  <DebutantTable players={debutants.data!} />
                </div>
              </section>

              <section className="border border-kvm-border bg-white pb-2 shadow-sm">
                <SectionHeader title="Recently Added Players" viewAllHref="/players" />
                <div className="pt-3">
                  <RecentlyAddedTable players={recentlyAdded.data!} />
                </div>
              </section>

              <section className="border border-kvm-border bg-white pb-2 shadow-sm">
                <SectionHeader title="European Competitions" viewAllHref="/competitions" />
                {competitionsSummary.error ? (
                  <div className="p-5 text-xs text-gray-400">Competition data unavailable.</div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3 p-5">
                      <StatCard
                        label="Competitions"
                        value={competitionsSummary.data?.totalEuropean ?? "—"}
                        icon={Trophy}
                      />
                      <StatCard label="Countries" value={competitionsSummary.data?.countriesCovered ?? "—"} icon={MapPin} />
                      <StatCard label="Active" value={competitionsSummary.data?.activeEuropean ?? "—"} icon={Globe2} />
                      <StatCard
                        label="Players Covered"
                        value={competitionsSummary.data?.playersInEuropeanCompetitions ?? "—"}
                        icon={Users}
                      />
                    </div>
                    {recentCompetitions.data && recentCompetitions.data.length > 0 ? (
                      <ul className="divide-y divide-kvm-border border-t border-kvm-border">
                        {recentCompetitions.data.slice(0, 3).map((c) => (
                          <li key={c.id}>
                            <Link
                              href={`/competition?id=${c.id}`}
                              className="flex items-center justify-between px-5 py-2.5 text-sm hover:bg-gray-50"
                            >
                              <span className="truncate font-medium text-kvm-ink">
                                {c.name} <span className="font-normal text-gray-400">· {c.area}</span>
                              </span>
                              <ArrowRight size={13} className="shrink-0 text-gray-300" aria-hidden="true" />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </>
                )}
              </section>
            </div>

            <section className="border border-kvm-border bg-white pb-2 shadow-sm">
              <SectionHeader title="Top Rated Players (Sportmonks Test — Danish Superliga & Scottish Premiership)" />
              <TopRatedPlayersWidget />
            </section>
          </>
        )}
      </div>
    </>
  );
}
