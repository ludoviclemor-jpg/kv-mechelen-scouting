import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { PlayerHeader } from "@/components/player-profile/PlayerHeader";
import { LastMatchesTable } from "@/components/player-profile/LastMatchesTable";
import { ScoutingNotesCard } from "@/components/player-profile/ScoutingNotesCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { getAllPlayers, getPlayerById } from "@/lib/players-data";
import { Users } from "lucide-react";

// `output: export` requires at least one static param even when the sync
// hasn't run yet — this sentinel exists purely so the build doesn't fail
// on an empty player database; it renders the same empty state below.
const NO_DATA_SENTINEL = "_no-players-synced-yet";

export function generateStaticParams() {
  const players = getAllPlayers();
  if (players.length === 0) return [{ id: NO_DATA_SENTINEL }];
  return players.map((player) => ({ id: player.id }));
}

export default async function PlayerProfilePage(
  props: PageProps<"/players/[id]">
) {
  const { id } = await props.params;

  if (id === NO_DATA_SENTINEL) {
    return (
      <>
        <PageHeader title="Player profile" />
        <div className="p-8">
          <div className="border border-kvm-border bg-white">
            <EmptyState
              icon={Users}
              title="No players synced yet"
              description="Run the SCOUTASTIC sync to populate the player database — see Settings for sync status."
            />
          </div>
        </div>
      </>
    );
  }

  const player = getPlayerById(id);

  if (!player) {
    notFound();
  }

  return (
    <>
      <PageHeader title={player.name} description="Player profile" />
      <div className="space-y-6 p-8">
        <PlayerHeader player={player} />
        <LastMatchesTable matches={player.matches} sofascoreMatchStatus={player.sofascoreMatchStatus} />
        <ScoutingNotesCard player={player} />
      </div>
    </>
  );
}
