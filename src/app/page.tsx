import { Users, UserPlus, Globe2, Eye, ListChecks, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { SyncStatusBanner } from "@/components/ui/SyncStatusBanner";
import { PlayerCard } from "@/components/players/PlayerCard";
import { DebutantTable } from "@/components/players/DebutantTable";
import { RecentlyAddedTable } from "@/components/players/RecentlyAddedTable";
import {
  getScoutingOverview,
  getTopPerformers,
  getAfricanDebutants,
  getRecentlyAdded,
} from "@/lib/players-data";

// Captured once at build time — refreshed on every sync-triggered rebuild.
const REFERENCE_DATE = new Date().toISOString().slice(0, 10);

export default function DashboardPage() {
  const overview = getScoutingOverview(REFERENCE_DATE);
  const topPerformers = getTopPerformers(5);
  const debutants = getAfricanDebutants().slice(0, 4);
  const recentlyAdded = getRecentlyAdded(8);

  return (
    <>
      <PageHeader
        title="Scouting Overview"
        description="Live snapshot of the KV Mechelen recruitment database."
      />

      <div className="space-y-6 p-8">
        <SyncStatusBanner />

        <section
          aria-labelledby="overview-heading"
          className="grid grid-cols-2 gap-3 lg:grid-cols-5"
        >
          <h2 id="overview-heading" className="sr-only">
            Scouting overview
          </h2>
          <StatCard label="Total Players" value={overview.totalPlayers} icon={Users} />
          <StatCard label="New Players" value={overview.newPlayers} icon={UserPlus} hint="Last 14 days" />
          <StatCard
            label="African Debutants"
            value={overview.africanDebutants}
            icon={Globe2}
            accent
          />
          <StatCard label="Players Monitored" value={overview.playersMonitored} icon={Eye} />
          <StatCard label="Shortlists" value={overview.shortlists} icon={ListChecks} />
        </section>

        <section className="border border-kvm-border bg-white pb-4">
          <SectionHeader title="Top Performers" viewAllHref="/top-performers" />
          {topPerformers.length === 0 ? (
            <EmptyState
              icon={TrendingUp}
              title="No top performers yet"
              description="Players need at least 3 SofaScore-rated matches to appear here — coming in Phase 4."
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 xl:grid-cols-5">
              {topPerformers.map((player) => (
                <PlayerCard key={player.id} player={player} />
              ))}
            </div>
          )}
        </section>

        <section className="border border-kvm-border bg-white pb-2">
          <SectionHeader title="African Debutants" viewAllHref="/debutants" />
          <div className="pt-3">
            <DebutantTable players={debutants} />
          </div>
        </section>

        <section className="border border-kvm-border bg-white pb-2">
          <SectionHeader title="Recently Added Players" viewAllHref="/players" />
          <div className="pt-3">
            <RecentlyAddedTable players={recentlyAdded} />
          </div>
        </section>
      </div>
    </>
  );
}
