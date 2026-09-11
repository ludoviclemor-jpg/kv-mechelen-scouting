"use client";

import Link from "next/link";
import { ListChecks } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { SyncStatusBanner } from "@/components/ui/SyncStatusBanner";
import { TodaysMatches } from "@/components/matches/TodaysMatches";
import { ScoutingRadarWidget } from "@/components/dashboard/ScoutingRadarWidget";
import { NextActionsWidget } from "@/components/dashboard/NextActionsWidget";
import { useAppStore } from "@/lib/app-store";
import {
  fetchPriorityPlayers,
  fetchLoanWatchCandidates,
  fetchContractWatchCandidates,
  fetchCurrentlyInjuredPlayers,
  fetchMarketValueMovers,
  useAsync,
} from "@/lib/players-data";

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
 * Dashboard grid (2026-09-11 trim) — First International Call-Ups, Top
 * Performers, African Debutants, Top Rated Players (Sportmonks), Squad
 * Strength Ratings (Impect) and Player KPIs (Impect) were removed from
 * this page at explicit request; every one of those still has its own
 * full page (/call-ups, /top-performers, /debutants, and the Impect
 * data remains fully live on each player's own profile — see
 * src/components/player-profile/PlayerRatingBreakdown.tsx) — nothing
 * about the underlying features was deleted, just their dashboard
 * preview cards.
 */
export default function DashboardPage() {
  const priorityPlayers = useAsync(() => fetchPriorityPlayers(6), []);
  const loanWatch = useAsync(() => fetchLoanWatchCandidates({ limit: 5, maxTierLevel: 2 }), []);
  const contractWatch = useAsync(() => fetchContractWatchCandidates({ window: "expiring12", maxTierLevel: 2, limit: 5 }), []);
  const injuryTracker = useAsync(() => fetchCurrentlyInjuredPlayers(null), []);
  const marketMovers = useAsync(() => fetchMarketValueMovers("risers", 180, 2, 5), []);

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

        <ScoutingRadarWidget
          priorityPlayers={priorityPlayers.data ?? []}
          loanWatch={loanWatch.data ?? []}
          contractWatch={contractWatch.data ?? []}
          injuries={(injuryTracker.data ?? []).slice(0, 5)}
          marketMovers={marketMovers.data ?? []}
        />
      </div>
    </div>
  );
}
