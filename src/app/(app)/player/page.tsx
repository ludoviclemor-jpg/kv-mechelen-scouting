"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { PlayerHeader } from "@/components/player-profile/PlayerHeader";
import { LastMatchesTable } from "@/components/player-profile/LastMatchesTable";
import { ScoutingNotesCard } from "@/components/player-profile/ScoutingNotesCard";
import { StatsOverview, isGoalkeeperPlayer } from "@/components/player-profile/StatsOverview";
import { GameTimeSection } from "@/components/player-profile/GameTimeSection";
import { InternationalStatusSection } from "@/components/player-profile/InternationalStatusSection";
import { PositionUsagePitch } from "@/components/player-profile/PositionUsagePitch";
import { CareerHistorySection } from "@/components/player-profile/CareerHistorySection";
import { RecentPerformanceSection } from "@/components/player-profile/RecentPerformanceSection";
import { fetchPlayerRecentPerformance } from "@/lib/sportmonks-data";
import { FilterSelect } from "@/components/ui/FilterBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState, ErrorState } from "@/components/ui/LoadingState";
import {
  fetchPlayerById,
  fetchPlayerPerformanceDetail,
  useAsync,
  aggregateStats,
  clubRows,
  availableSeasons,
  competitionsInSeason,
  capsByLevel,
} from "@/lib/players-data";
import { fetchCompetitionById } from "@/lib/competitions-data";
import { fetchCallUpsForPlayer } from "@/lib/callups-data";
import { cn } from "@/lib/utils";

const TABS = ["Overview", "Stats", "Career", "Matches", "Scouting"] as const;
type Tab = (typeof TABS)[number];

/**
 * `/player?id=sc-12345` — a query string, not `/players/[id]/`. Static
 * export requires `generateStaticParams()` to enumerate every path
 * segment at build time, which stopped being viable once the SCOUTASTIC
 * catalog grew to hundreds of thousands of players (one pre-rendered
 * page per player is exactly the pattern this rework moved away from —
 * see db/schema.sql's header and docs/SCOUTASTIC_SYNC.md). A query string
 * is one static page (this file) that reads `id` at runtime instead.
 */
function PlayerProfileContent() {
  const id = useSearchParams().get("id");
  const { data: player, loading, error } = useAsync(() => (id ? fetchPlayerById(id) : Promise.resolve(null)), [id]);
  // Official competition name, not the `league` field (that's the
  // competition's *country* — see docs/COMPETITIONS.md). Fetched
  // separately since `players.competition_id` is a soft reference, not a
  // hard FK (a player can reference a competition even if this row was
  // synced before that competition was, so it's never assumed present).
  const { data: competition } = useAsync(
    () => (player?.competitionId ? fetchCompetitionById(player.competitionId) : Promise.resolve(null)),
    [player?.competitionId]
  );
  // The heavier performance/position fields — see PlayerPerformanceDetail's
  // own comment for why this is a separate fetch from fetchPlayerById.
  const { data: detail } = useAsync(
    () =>
      id
        ? fetchPlayerPerformanceDetail(id)
        : Promise.resolve({ performanceSeasons: [], playedPositions: null, marketValueHistory: [], injuryHistory: [], youthTeams: null }),
    [id]
  );
  const { data: callUps } = useAsync(() => (id ? fetchCallUpsForPlayer(id) : Promise.resolve([])), [id]);
  // TEST integration, Danish Superliga + Scottish Premiership only — see
  // docs/SPORTMONKS_INTEGRATION.md. Reads Postgres only, never Sportmonks
  // directly; empty for the vast majority of players (out of scope).
  const { data: recentPerformance } = useAsync(
    () => (id ? fetchPlayerRecentPerformance(id) : Promise.resolve({ ratings: [], last5Average: null, seasonAverage: null })),
    [id]
  );

  const [tab, setTab] = useState<Tab>("Overview");
  const [season, setSeason] = useState("all");
  const [competitionFilter, setCompetitionFilter] = useState("all");

  const performanceSeasons = useMemo(() => detail?.performanceSeasons ?? [], [detail]);
  const seasons = useMemo(() => availableSeasons(performanceSeasons), [performanceSeasons]);
  const competitionOptions = useMemo(
    () => competitionsInSeason(performanceSeasons, season === "all" ? null : season),
    [performanceSeasons, season]
  );

  const filteredClubRows = useMemo(() => {
    let rows = clubRows(performanceSeasons);
    if (season !== "all") rows = rows.filter((r) => r.season === season);
    if (competitionFilter !== "all") rows = rows.filter((r) => r.competitionId === competitionFilter);
    return rows;
  }, [performanceSeasons, season, competitionFilter]);

  const stats = useMemo(() => aggregateStats(filteredClubRows), [filteredClubRows]);
  const caps = useMemo(() => capsByLevel(performanceSeasons), [performanceSeasons]);

  function handleSeasonChange(value: string) {
    setSeason(value);
    setCompetitionFilter("all"); // clear an incompatible competition selection
  }

  if (!id) {
    return (
      <>
        <PageHeader title="Player profile" />
        <div className="p-8">
          <div className="border border-kvm-border bg-white">
            <EmptyState icon={Users} title="No player selected" description="Open a player from the Players list." />
          </div>
        </div>
      </>
    );
  }

  if (loading) {
    return (
      <>
        <PageHeader title="Player profile" />
        <div className="p-8">
          <div className="border border-kvm-border bg-white">
            <LoadingState label="Loading player…" />
          </div>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader title="Player profile" />
        <div className="p-8">
          <div className="border border-kvm-border bg-white">
            <ErrorState message={error.message} />
          </div>
        </div>
      </>
    );
  }

  if (!player) {
    return (
      <>
        <PageHeader title="Player profile" />
        <div className="p-8">
          <div className="border border-kvm-border bg-white">
            <EmptyState icon={Users} title="Player not found" description="This player may have been deactivated by the last sync." />
          </div>
        </div>
      </>
    );
  }

  const isGoalkeeper = isGoalkeeperPlayer(player);

  return (
    <>
      <PageHeader title={player.name} description="Player profile" />
      <div className="space-y-5 p-8">
        <PlayerHeader player={player} competitionName={competition?.name ?? null} />

        <div className="border border-kvm-border bg-white">
          <div role="tablist" aria-label="Player profile sections" className="flex border-b border-kvm-border">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn(
                  "border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
                  tab === t
                    ? "border-kvm-red text-kvm-ink"
                    : "border-transparent text-gray-400 hover:text-kvm-ink"
                )}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="p-5">
            {tab === "Overview" ? (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="space-y-6 lg:col-span-2">
                  <section>
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">Game Time</h3>
                    <GameTimeSection stats={stats} seasonRows={filteredClubRows} />
                  </section>
                  <section>
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">Stats Overview</h3>
                    <StatsOverview stats={stats} isGoalkeeper={isGoalkeeper} />
                  </section>
                </div>
                <div className="space-y-6">
                  <section>
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">International</h3>
                    <InternationalStatusSection caps={caps} callUps={callUps ?? []} />
                  </section>
                </div>
              </div>
            ) : null}

            {tab === "Stats" ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <FilterSelect
                    label="Season"
                    value={season}
                    onChange={handleSeasonChange}
                    options={[{ value: "all", label: "All seasons" }, ...seasons.map((s) => ({ value: s, label: s }))]}
                  />
                  <FilterSelect
                    label="Competition"
                    value={competitionFilter}
                    onChange={setCompetitionFilter}
                    options={[
                      { value: "all", label: "All competitions" },
                      ...competitionOptions.map((c) => ({ value: c.id, label: c.name })),
                    ]}
                  />
                </div>
                <StatsOverview stats={stats} isGoalkeeper={isGoalkeeper} />
              </div>
            ) : null}

            {tab === "Career" ? (
              <div className="space-y-6">
                <section>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">Position Usage</h3>
                  <PositionUsagePitch playedPositions={detail?.playedPositions ?? null} registeredPosition={player.position} />
                </section>
                <section>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">Value, Injuries &amp; Youth Career</h3>
                  <CareerHistorySection
                    marketValueHistory={detail?.marketValueHistory ?? []}
                    injuryHistory={detail?.injuryHistory ?? []}
                    youthTeams={detail?.youthTeams ?? null}
                  />
                </section>
              </div>
            ) : null}

            {tab === "Matches" ? (
              <div className="space-y-6">
                <section>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">Match Performance</h3>
                  <LastMatchesTable matches={player.matches} sofascoreMatchStatus={player.sofascoreMatchStatus} />
                </section>
                <section>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">Recent Performance (Sportmonks)</h3>
                  <RecentPerformanceSection performance={recentPerformance ?? { ratings: [], last5Average: null, seasonAverage: null }} />
                </section>
              </div>
            ) : null}

            {tab === "Scouting" ? <ScoutingNotesCard player={player} /> : null}
          </div>
        </div>
      </div>
    </>
  );
}

export default function PlayerProfilePage() {
  return (
    <Suspense fallback={<LoadingState label="Loading player…" />}>
      <PlayerProfileContent />
    </Suspense>
  );
}
