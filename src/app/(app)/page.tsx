"use client";

import { useMemo } from "react";
import { Users, UserPlus, Globe2, Eye, ListChecks, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState, ErrorState } from "@/components/ui/LoadingState";
import { SyncStatusBanner } from "@/components/ui/SyncStatusBanner";
import { PlayerCard } from "@/components/players/PlayerCard";
import { DebutantTable } from "@/components/players/DebutantTable";
import { RecentlyAddedTable } from "@/components/players/RecentlyAddedTable";
import {
  fetchScoutingOverview,
  fetchTopPerformers,
  fetchAfricanDebutants,
  fetchRecentlyAdded,
  useAsync,
} from "@/lib/players-data";

export default function DashboardPage() {
  // Captured once per page load — a fresh value every render would
  // retrigger every fetch below on each render.
  const referenceDate = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const overview = useAsync(() => fetchScoutingOverview(referenceDate), [referenceDate]);
  const topPerformers = useAsync(() => fetchTopPerformers(5), []);
  const debutants = useAsync(() => fetchAfricanDebutants(4), []);
  const recentlyAdded = useAsync(() => fetchRecentlyAdded(8), []);

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

            <section className="border border-kvm-border bg-white pb-4">
              <SectionHeader title="Top Performers" viewAllHref="/top-performers" />
              {topPerformers.data!.length === 0 ? (
                <EmptyState
                  icon={TrendingUp}
                  title="No top performers yet"
                  description="Players need at least 3 rated matches to appear here — see Settings for ratings provider status."
                />
              ) : (
                <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 xl:grid-cols-5">
                  {topPerformers.data!.map((player) => (
                    <PlayerCard key={player.id} player={player} />
                  ))}
                </div>
              )}
            </section>

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
          </>
        )}
      </div>
    </>
  );
}
