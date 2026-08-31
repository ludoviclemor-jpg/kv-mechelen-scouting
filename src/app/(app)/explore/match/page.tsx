"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarDays, MapPin, Users, Flag } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState, ErrorState } from "@/components/ui/LoadingState";
import { PitchFormation } from "@/components/pitch/PitchFormation";
import { BenchList } from "@/components/pitch/BenchList";
import { PlayerQuickDrawer } from "@/components/pitch/PlayerQuickDrawer";
import { ScoutingHighlights } from "@/components/matches/ScoutingHighlights";
import { fetchMatchById, type MatchLineupPlayer } from "@/lib/matches-data";
import { fetchPlayersByIds, useAsync } from "@/lib/players-data";
import { useAppStore } from "@/lib/app-store";
import { formatDate } from "@/lib/utils";

function kickoffLabel(iso: string | null): string {
  if (!iso) return "Kick-off TBD";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
}

function MatchContent() {
  const id = useSearchParams().get("id");
  const [selected, setSelected] = useState<{ team: "home" | "away"; lineupPlayer: MatchLineupPlayer } | null>(null);

  const { data: match, loading, error } = useAsync(() => (id ? fetchMatchById(id) : Promise.resolve(null)), [id]);

  const allLineupPlayers = useMemo(
    () => (match ? [...match.homeTeamPlayers, ...match.awayTeamPlayers] : []),
    [match]
  );
  const playerIds = useMemo(() => allLineupPlayers.map((p) => `sc-${p.id}`), [allLineupPlayers]);

  const { data: players } = useAsync(() => (playerIds.length > 0 ? fetchPlayersByIds(playerIds) : Promise.resolve([])), [
    playerIds.join(","),
  ]);
  const playersById = useMemo(() => new Map((players ?? []).map((p) => [p.id, p])), [players]);

  // Real per-match SofaScore ratings would populate this map (lineup
  // player id -> rating) — no provider is connected today (see
  // docs/SOFASCORE_PROVIDER.md), so it's always empty and every chip
  // genuinely shows "Rating unavailable," not an approximation. Kept as
  // its own value (not hardcoded per-component) so wiring up a real
  // provider later only means filling this map, no component changes.
  const matchRatings = useMemo(() => new Map<string, number>(), []);

  const { shortlists } = useAppStore();
  const shortlistedIds = useMemo(() => new Set(shortlists.flatMap((s) => s.playerIds)), [shortlists]);

  if (!id) {
    return (
      <>
        <PageHeader title="Match" />
        <div className="p-8">
          <div className="border border-kvm-border bg-white">
            <EmptyState icon={Users} title="No match selected" description="Open a match from Explore." />
          </div>
        </div>
      </>
    );
  }

  if (loading) {
    return (
      <>
        <PageHeader title="Match" />
        <div className="p-8">
          <div className="border border-kvm-border bg-white">
            <LoadingState label="Loading match…" />
          </div>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader title="Match" />
        <div className="p-8">
          <div className="border border-kvm-border bg-white">
            <ErrorState message={error.message} />
          </div>
        </div>
      </>
    );
  }

  if (!match) {
    return (
      <>
        <PageHeader title="Match" />
        <div className="p-8">
          <div className="border border-kvm-border bg-white">
            <EmptyState icon={Users} title="Match not found" description="It may not have been synced yet." />
          </div>
        </div>
      </>
    );
  }

  const homeSubs = match.homeTeamPlayers.filter((p) => !p.inLineup);
  const awaySubs = match.awayTeamPlayers.filter((p) => !p.inLineup);

  const selectedPlayer = selected ? playersById.get(`sc-${selected.lineupPlayer.id}`) ?? null : null;
  const selectedRating = selected ? matchRatings.get(selected.lineupPlayer.id) ?? null : null;

  return (
    <>
      <PageHeader
        title={`${match.homeTeamName ?? "TBD"} vs ${match.awayTeamName ?? "TBD"}`}
        description={match.score ? `${match.score} · ${match.status ?? ""}` : match.status ?? undefined}
      />

      <div className="flex flex-wrap gap-x-6 gap-y-1.5 border-b border-kvm-border bg-white px-8 py-3 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <CalendarDays size={13} aria-hidden="true" />
          {match.date ? formatDate(match.date.slice(0, 10)) : "Date TBD"} · {kickoffLabel(match.date)}
        </span>
        {match.venueName ? (
          <span className="flex items-center gap-1.5">
            <MapPin size={13} aria-hidden="true" />
            {match.venueName}
            {match.venueCity ? `, ${match.venueCity}` : ""}
          </span>
        ) : null}
        {match.refereeName ? (
          <span className="flex items-center gap-1.5">
            <Flag size={13} aria-hidden="true" />
            {match.refereeName}
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-6 p-8 xl:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <PitchFormation
            teamName={match.homeTeamName}
            tactic={match.homeTeamTactic}
            players={match.homeTeamPlayers}
            playersById={playersById}
            shortlistedIds={shortlistedIds}
            matchRatings={matchRatings}
            onPlayerClick={(lp) => setSelected({ team: "home", lineupPlayer: lp })}
          />
          <PitchFormation
            teamName={match.awayTeamName}
            tactic={match.awayTeamTactic}
            players={match.awayTeamPlayers}
            playersById={playersById}
            shortlistedIds={shortlistedIds}
            matchRatings={matchRatings}
            onPlayerClick={(lp) => setSelected({ team: "away", lineupPlayer: lp })}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <BenchList
              teamName={match.homeTeamName}
              substitutes={homeSubs}
              events={match.events}
              playersById={playersById}
              matchRatings={matchRatings}
              onPlayerClick={(lp) => setSelected({ team: "home", lineupPlayer: lp })}
            />
            <BenchList
              teamName={match.awayTeamName}
              substitutes={awaySubs}
              events={match.events}
              playersById={playersById}
              matchRatings={matchRatings}
              onPlayerClick={(lp) => setSelected({ team: "away", lineupPlayer: lp })}
            />
          </div>
        </div>

        <div>
          <ScoutingHighlights allLineupPlayers={allLineupPlayers} playersById={playersById} />
        </div>
      </div>

      <PlayerQuickDrawer
        lineupPlayer={selected?.lineupPlayer ?? null}
        player={selectedPlayer}
        matchRating={selectedRating}
        onClose={() => setSelected(null)}
      />
    </>
  );
}

export default function MatchPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading match…" />}>
      <MatchContent />
    </Suspense>
  );
}
