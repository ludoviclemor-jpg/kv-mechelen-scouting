"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Users, UserPlus, Globe2, Eye, ListChecks, TrendingUp, Trophy, MapPin, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState, ErrorState } from "@/components/ui/LoadingState";
import { SyncStatusBanner } from "@/components/ui/SyncStatusBanner";
import { PlayerCard } from "@/components/players/PlayerCard";
import { DebutantTable } from "@/components/players/DebutantTable";
import { RecentlyAddedTable } from "@/components/players/RecentlyAddedTable";
import { CallUpTable } from "@/components/players/CallUpTable";
import { PriorityPlayersList } from "@/components/players/PriorityPlayersList";
import { LoanWatchList } from "@/components/players/LoanWatchList";
import { AiTipsWidget } from "@/components/dashboard/AiTipsWidget";
import { TodaysMatches } from "@/components/matches/TodaysMatches";
import {
  fetchScoutingOverview,
  fetchTopPerformers,
  fetchAfricanDebutants,
  fetchRecentlyAdded,
  fetchPriorityPlayers,
  fetchLoanWatchCandidates,
  useAsync,
} from "@/lib/players-data";
import { fetchCompetitionsSummary, fetchRecentlyUpdatedCompetitions } from "@/lib/competitions-data";
import { fetchFirstCallUps } from "@/lib/callups-data";
import { fetchLatestAiTips } from "@/lib/ai-tips-data";

/**
 * Dashboard grid — with the sidebar gone (Phase 1), there's real
 * horizontal room to give the highest-signal widgets (today's matches,
 * first call-ups, top performers) more space and let the lower-priority
 * ones (debutants/recently-added/competitions) share a row, instead of
 * stacking six full-width sections top to bottom (item 21/22).
 */
export default function DashboardPage() {
  // Captured once per page load — a fresh value every render would
  // retrigger every fetch below on each render.
  const referenceDate = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const overview = useAsync(() => fetchScoutingOverview(referenceDate), [referenceDate]);
  const topPerformers = useAsync(() => fetchTopPerformers(5), []);
  const debutants = useAsync(() => fetchAfricanDebutants(4), []);
  const recentlyAdded = useAsync(() => fetchRecentlyAdded(8), []);
  const priorityPlayers = useAsync(() => fetchPriorityPlayers(6), []);
  const loanWatch = useAsync(() => fetchLoanWatchCandidates({ limit: 5 }), []); // returns Player[] directly, already ordered by minutes ascending — see fetchLoanWatchCandidates' own comment for why this isn't a paginated/counted query
  const competitionsSummary = useAsync(() => fetchCompetitionsSummary(), []);
  const recentCompetitions = useAsync(() => fetchRecentlyUpdatedCompetitions(5), []);
  const callUps = useAsync(() => fetchFirstCallUps({ limit: 6 }), []);
  const aiTips = useAsync(() => fetchLatestAiTips(), []);

  const loading = overview.loading || topPerformers.loading || debutants.loading || recentlyAdded.loading;
  const error = overview.error ?? topPerformers.error ?? debutants.error ?? recentlyAdded.error;

  return (
    <>
      <PageHeader
        title="Scouting Overview"
        description="Live snapshot of the KV Mechelen recruitment database."
      />

      <div className="space-y-6 p-8">
        <SyncStatusBanner />

        {error ? (
          <ErrorState message={error.message} />
        ) : loading ? (
          <LoadingState label="Loading dashboard…" />
        ) : (
          <>
            <section
              aria-labelledby="overview-heading"
              className="grid grid-cols-2 gap-3 lg:grid-cols-5"
            >
              <h2 id="overview-heading" className="sr-only">
                Scouting overview
              </h2>
              <StatCard label="Total Players" value={overview.data!.totalPlayers} icon={Users} />
              <StatCard label="New Players" value={overview.data!.newPlayers} icon={UserPlus} hint="Last 14 days" />
              <StatCard
                label="African Debutants"
                value={overview.data!.africanDebutants}
                icon={Globe2}
                accent
              />
              <StatCard label="Players Monitored" value={overview.data!.playersMonitored} icon={Eye} />
              <StatCard label="Shortlists" value={overview.data!.shortlists} icon={ListChecks} />
            </section>

            <section className="border border-kvm-border bg-white pb-2">
              <SectionHeader title="AI Scouting Tips" />
              <AiTipsWidget digest={aiTips.data ?? null} />
            </section>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <section className="border border-kvm-border bg-white pb-2">
                <SectionHeader title="Today's Matches" viewAllHref="/explore" />
                <TodaysMatches />
              </section>

              <section className="border border-kvm-border bg-white pb-2">
                <SectionHeader title="First International Call-Ups" viewAllHref="/call-ups" />
                <div className="pt-3">
                  <CallUpTable callUps={callUps.data ?? []} />
                </div>
              </section>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <section className="border border-kvm-border bg-white pb-4 xl:col-span-2">
                <SectionHeader title="Top Performers" viewAllHref="/top-performers" />
                {topPerformers.data!.length === 0 ? (
                  <EmptyState
                    icon={TrendingUp}
                    title="No top performers yet"
                    description="Players need at least 3 rated matches to appear here — see Settings for ratings provider status."
                  />
                ) : (
                  <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
                    {topPerformers.data!.map((player) => (
                      <PlayerCard key={player.id} player={player} />
                    ))}
                  </div>
                )}
              </section>

              <div className="space-y-6">
                <section className="border border-kvm-border bg-white pb-2">
                  <SectionHeader title="Priority Players" viewAllHref="/shortlists" />
                  <div className="pt-1">
                    <PriorityPlayersList players={priorityPlayers.data ?? []} />
                  </div>
                </section>

                <section className="border border-kvm-border bg-white pb-2">
                  <SectionHeader title="Loan Watch" viewAllHref="/loan-watch" />
                  <div className="pt-1">
                    <LoanWatchList players={loanWatch.data ?? []} />
                  </div>
                </section>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <section className="border border-kvm-border bg-white pb-2">
                <SectionHeader title="African Debutants" viewAllHref="/debutants" />
                <div className="pt-3">
                  <DebutantTable players={debutants.data!} />
                </div>
              </section>

              <section className="border border-kvm-border bg-white pb-2">
                <SectionHeader title="Recently Added Players" viewAllHref="/players" />
                <div className="pt-3">
                  <RecentlyAddedTable players={recentlyAdded.data!} />
                </div>
              </section>

              <section className="border border-kvm-border bg-white pb-2">
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
          </>
        )}
      </div>
    </>
  );
}
