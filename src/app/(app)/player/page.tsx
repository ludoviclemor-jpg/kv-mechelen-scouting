"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { PlayerHeader } from "@/components/player-profile/PlayerHeader";
import { LastMatchesTable } from "@/components/player-profile/LastMatchesTable";
import { ScoutingNotesCard } from "@/components/player-profile/ScoutingNotesCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState, ErrorState } from "@/components/ui/LoadingState";
import { fetchPlayerById, useAsync } from "@/lib/players-data";
import { fetchCompetitionById } from "@/lib/competitions-data";

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

  return (
    <>
      <PageHeader title={player.name} description="Player profile" />
      <div className="space-y-6 p-8">
        <PlayerHeader player={player} competitionName={competition?.name ?? null} />
        <LastMatchesTable matches={player.matches} sofascoreMatchStatus={player.sofascoreMatchStatus} />
        <ScoutingNotesCard player={player} />
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
