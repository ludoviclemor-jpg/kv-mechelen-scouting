"use client";

import { TrendingUp } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState, ErrorState } from "@/components/ui/LoadingState";
import { SyncStatusBanner } from "@/components/ui/SyncStatusBanner";
import { TopPerformersLeaderboard } from "@/components/players/TopPerformersLeaderboard";
import { DebutantTable } from "@/components/players/DebutantTable";
import { CallUpTable } from "@/components/players/CallUpTable";
import { TodaysMatches } from "@/components/matches/TodaysMatches";
import { TopRatedPlayersWidget } from "@/components/dashboard/TopRatedPlayersWidget";
import { ScoutingRadarWidget } from "@/components/dashboard/ScoutingRadarWidget";
import {
  fetchAfricanDebutants,
  fetchPriorityPlayers,
  fetchLoanWatchCandidates,
  fetchContractWatchCandidates,
  fetchCurrentlyInjuredPlayers,
  fetchMarketValueMovers,
  useAsync,
} from "@/lib/players-data";
import { fetchFirstCallUps } from "@/lib/callups-data";
import { fetchCombinedTopPerformers } from "@/lib/topPerformersData";

const STADIUM_BG_URL = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/branding/stadium-bg.webp`;

/**
 * Dashboard grid — trimmed to the widgets that carry a real, distinct
 * scouting signal (2026-09-03 pass): "Recently Added Players" (just the
 * newest DB rows, no actual signal) and "European Competitions" (a
 * browse utility already covered by /competitions, not a dashboard-worthy
 * signal) were dropped so the page is shorter and every remaining card
 * earns its place.
 */
export default function DashboardPage() {
  // Merges the primary ratings slot (empty today — see
  // docs/SOFASCORE_PROVIDER.md) with the Sportmonks TEST integration
  // (docs/SPORTMONKS_INTEGRATION.md), never blended per player.
  const topPerformers = useAsync(() => fetchCombinedTopPerformers(8), []);
  const debutants = useAsync(() => fetchAfricanDebutants(6), []);
  const priorityPlayers = useAsync(() => fetchPriorityPlayers(6), []);
  const loanWatch = useAsync(() => fetchLoanWatchCandidates({ limit: 5, maxTierLevel: 2 }), []); // top-2-divisions default, same as the /loan-watch page — see fetchProfessionalCompetitionIds' own comment for why
  const contractWatch = useAsync(() => fetchContractWatchCandidates({ window: "expiring12", maxTierLevel: 2, limit: 5 }), []);
  const injuryTracker = useAsync(() => fetchCurrentlyInjuredPlayers(null), []);
  const marketMovers = useAsync(() => fetchMarketValueMovers("risers", 180, 2, 5), []);
  const callUps = useAsync(() => fetchFirstCallUps({ limit: 6 }), []);

  const loading = topPerformers.loading || debutants.loading;
  const error = topPerformers.error ?? debutants.error;

  return (
    /* AFAS Stadion, faded well into the background — texture, not
       imagery competing with the dense data on top. Applied as a plain
       background-image on the page's own normal-flow wrapper (not a
       separate `fixed`/negative-z-index overlay — that was reported as
       invisible; this is the simpler, harder-to-get-wrong technique:
       every child paints on top of its own parent's background by
       definition, no stacking-context ambiguity). `bg-fixed`
       (background-attachment: fixed) keeps the image sized/positioned
       relative to the *viewport*, not this wrapper's full scrollable
       height — without it, `bg-cover` on a very tall stacked-cards page
       would scale the photo to an enormous, near-unrecognizable crop.
       Scoped to the Dashboard only — every other page stays plain so a
       background image never competes with a data-dense table. Opacity
       has gone 5% -> 14% -> 22% (via the ivory linear-gradient tint
       over the photo, which also keeps card content legible) after
       repeated "still don't see it" reports. */
    <div
      className="space-y-6 bg-cover bg-center bg-no-repeat bg-fixed p-8"
      style={{ backgroundImage: `linear-gradient(rgba(250, 246, 236, 0.78), rgba(250, 246, 236, 0.78)), url(${STADIUM_BG_URL})` }}
    >
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

          <section className="border border-kvm-border bg-white pb-2 shadow-sm">
            <SectionHeader title="African Debutants" viewAllHref="/debutants" />
            <div className="pt-3">
              <DebutantTable players={debutants.data!} />
            </div>
          </section>

          <section className="border border-kvm-border bg-white pb-2 shadow-sm">
            <SectionHeader title="Top Rated Players (Sportmonks Test — Danish Superliga & Scottish Premiership)" />
            <TopRatedPlayersWidget />
          </section>
        </>
      )}
    </div>
  );
}
