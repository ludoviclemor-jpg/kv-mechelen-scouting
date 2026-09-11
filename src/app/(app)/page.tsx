"use client";

import Link from "next/link";
import { TrendingUp, ListChecks, ArrowRight } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { SyncStatusBanner } from "@/components/ui/SyncStatusBanner";
import { AsyncSection } from "@/components/dashboard/AsyncSection";
import { TopPerformersLeaderboard } from "@/components/players/TopPerformersLeaderboard";
import { DebutantTable } from "@/components/players/DebutantTable";
import { CallUpTable } from "@/components/players/CallUpTable";
import { TodaysMatches } from "@/components/matches/TodaysMatches";
import { TopRatedPlayersWidget } from "@/components/dashboard/TopRatedPlayersWidget";
import { ImpectSquadRatingsWidget } from "@/components/dashboard/ImpectSquadRatingsWidget";
import { ImpectLeaguePlayerKpisWidget } from "@/components/dashboard/ImpectLeaguePlayerKpisWidget";
import { ScoutingRadarWidget } from "@/components/dashboard/ScoutingRadarWidget";
import { NextActionsWidget } from "@/components/dashboard/NextActionsWidget";
import { useAppStore } from "@/lib/app-store";
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

const CREST_URL = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/branding/crest.png`;

/**
 * My Shortlists — compact preview of the scout's own shortlists (real data
 * already loaded in bulk by AppStoreProvider, no extra fetch needed here).
 * Kept small and link-out only; full editing stays on /shortlists.
 */
function MyShortlistsPreview() {
  const { shortlists, isLoading } = useAppStore();

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-2 px-5 py-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-5 rounded bg-gray-100" />
        ))}
      </div>
    );
  }

  if (shortlists.length === 0) {
    return (
      <EmptyState
        icon={ListChecks}
        title="No shortlists yet"
        description="Create one from the Shortlists page to start tracking candidates."
      />
    );
  }

  return (
    <ul className="divide-y divide-kvm-border">
      {shortlists.slice(0, 5).map((s) => (
        <li key={s.id}>
          <Link href="/shortlists" className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-gray-50">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-kvm-ink">{s.name}</div>
              {s.description ? <div className="truncate text-xs text-gray-400">{s.description}</div> : null}
            </div>
            <span className="shrink-0 text-xs font-semibold tabular-nums text-gray-400">
              {s.playerIds.length} {s.playerIds.length === 1 ? "player" : "players"}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Dashboard grid (2026-09-07 redesign pass). Every widget below owns its
 * own load/error/empty state via `AsyncSection` — one slow or failing
 * source (e.g. the Sportmonks TEST integration) can no longer block the
 * rest of the page, and each has its own "Try again". Ordered per the
 * requested priority: relevant matches, own shortlists, then broader
 * scouting signals. "My Next Actions" lands once the owner-scoped
 * action_items table exists (see the in-progress DB migration) — not
 * added here yet since there's no real data to back it.
 *
 * The previous stadium-photo background was reported as visually
 * competing with the dense widgets and is dropped here per the redesign
 * brief ("rustigere basis... clubidentiteit mag subtiel terugkomen") —
 * replaced with a single, very low-opacity crest watermark, not tiled
 * across the page.
 */
export default function DashboardPage() {
  const topPerformers = useAsync(() => fetchCombinedTopPerformers(8), []);
  const debutants = useAsync(() => fetchAfricanDebutants(6), []);
  const priorityPlayers = useAsync(() => fetchPriorityPlayers(6), []);
  const loanWatch = useAsync(() => fetchLoanWatchCandidates({ limit: 5, maxTierLevel: 2 }), []);
  const contractWatch = useAsync(() => fetchContractWatchCandidates({ window: "expiring12", maxTierLevel: 2, limit: 5 }), []);
  const injuryTracker = useAsync(() => fetchCurrentlyInjuredPlayers(null), []);
  const marketMovers = useAsync(() => fetchMarketValueMovers("risers", 180, 2, 5), []);
  const callUps = useAsync(() => fetchFirstCallUps({ limit: 6 }), []);

  return (
    <div className="relative overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element -- static export has no Image Optimization server, same convention as ClubCrest.tsx */}
      <img
        src={CREST_URL}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute -right-12 -top-12 h-72 w-72 object-contain opacity-[0.05] grayscale select-none"
      />

      <div className="relative space-y-8 p-8">
        <SyncStatusBanner />

        <section className="rounded-xl border border-kvm-border bg-white pb-2 shadow-[0_1px_2px_rgba(26,23,18,0.04),0_8px_24px_-8px_rgba(26,23,18,0.10)]">
          <SectionHeader title="My Next Actions" />
          <NextActionsWidget />
        </section>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <section className="rounded-xl border border-kvm-border bg-white pb-2 shadow-[0_1px_2px_rgba(26,23,18,0.04),0_8px_24px_-8px_rgba(26,23,18,0.10)]">
            <SectionHeader title="Today's Matches" viewAllHref="/explore" />
            <TodaysMatches />
          </section>

          <section className="rounded-xl border border-kvm-border bg-white pb-2 shadow-[0_1px_2px_rgba(26,23,18,0.04),0_8px_24px_-8px_rgba(26,23,18,0.10)]">
            <SectionHeader title="My Shortlists" viewAllHref="/shortlists" />
            <MyShortlistsPreview />
          </section>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <section className="rounded-xl border border-kvm-border bg-white pb-2 shadow-[0_1px_2px_rgba(26,23,18,0.04),0_8px_24px_-8px_rgba(26,23,18,0.10)]">
            <SectionHeader title="First International Call-Ups" viewAllHref="/call-ups" />
            <div className="pt-3">
              <AsyncSection loading={callUps.loading} error={callUps.error} data={callUps.data} onRetry={callUps.reload} skeletonRows={5}>
                {(data) => <CallUpTable callUps={data} />}
              </AsyncSection>
            </div>
          </section>

          <ScoutingRadarWidget
            priorityPlayers={priorityPlayers.data ?? []}
            loanWatch={loanWatch.data ?? []}
            contractWatch={contractWatch.data ?? []}
            injuries={(injuryTracker.data ?? []).slice(0, 5)}
            marketMovers={marketMovers.data ?? []}
          />
        </div>

        <section className="rounded-xl border border-kvm-border bg-white pb-4 shadow-[0_1px_2px_rgba(26,23,18,0.04),0_8px_24px_-8px_rgba(26,23,18,0.10)]">
          <SectionHeader title="Top Performers" viewAllHref="/top-performers" />
          <AsyncSection loading={topPerformers.loading} error={topPerformers.error} data={topPerformers.data} onRetry={topPerformers.reload} skeletonRows={5}>
            {(data) =>
              data.length === 0 ? (
                <EmptyState
                  icon={TrendingUp}
                  title="No top performers yet"
                  description="Players need at least 3 rated matches to appear here — see Settings for ratings provider status."
                />
              ) : (
                <TopPerformersLeaderboard entries={data} />
              )
            }
          </AsyncSection>
        </section>

        <section className="rounded-xl border border-kvm-border bg-white pb-2 shadow-[0_1px_2px_rgba(26,23,18,0.04),0_8px_24px_-8px_rgba(26,23,18,0.10)]">
          <SectionHeader title="African Debutants" viewAllHref="/debutants" />
          <div className="pt-3">
            <AsyncSection loading={debutants.loading} error={debutants.error} data={debutants.data} onRetry={debutants.reload} skeletonRows={5}>
              {(data) => <DebutantTable players={data} />}
            </AsyncSection>
          </div>
        </section>

        <section className="rounded-xl border border-kvm-border bg-white pb-2 shadow-[0_1px_2px_rgba(26,23,18,0.04),0_8px_24px_-8px_rgba(26,23,18,0.10)]">
          <div className="flex items-center justify-between px-5 pt-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Top Rated Players — Sportmonks TEST (Danish Superliga &amp; Scottish Premiership)
            </h2>
            <Link href="/settings" className="flex items-center gap-1 text-xs font-semibold text-kvm-red hover:underline">
              Provider status
              <ArrowRight size={12} aria-hidden="true" />
            </Link>
          </div>
          <TopRatedPlayersWidget />
        </section>

        <section className="rounded-xl border border-kvm-border bg-white pb-2 shadow-[0_1px_2px_rgba(26,23,18,0.04),0_8px_24px_-8px_rgba(26,23,18,0.10)]">
          <ImpectSquadRatingsWidget />
        </section>

        <section className="rounded-xl border border-kvm-border bg-white pb-2 shadow-[0_1px_2px_rgba(26,23,18,0.04),0_8px_24px_-8px_rgba(26,23,18,0.10)]">
          <ImpectLeaguePlayerKpisWidget />
        </section>
      </div>
    </div>
  );
}
