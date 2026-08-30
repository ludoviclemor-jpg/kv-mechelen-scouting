import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { PlayerHeader } from "@/components/player-profile/PlayerHeader";
import { LastMatchesTable } from "@/components/player-profile/LastMatchesTable";
import { ScoutingNotesCard } from "@/components/player-profile/ScoutingNotesCard";
import { getAllPlayers, getPlayerById } from "@/lib/demo-data";

export function generateStaticParams() {
  return getAllPlayers().map((player) => ({ id: player.id }));
}

export default async function PlayerProfilePage(
  props: PageProps<"/players/[id]">
) {
  const { id } = await props.params;
  const player = getPlayerById(id);

  if (!player) {
    notFound();
  }

  return (
    <>
      <PageHeader title={player.name} description="Player profile" />
      <div className="space-y-6 p-8">
        <PlayerHeader player={player} />
        <LastMatchesTable matches={player.matches} />
        <ScoutingNotesCard player={player} />
      </div>
    </>
  );
}
