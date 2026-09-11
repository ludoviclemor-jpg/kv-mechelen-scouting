"use client";

import { useEffect, useMemo } from "react";
import { X } from "lucide-react";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { PercentilePizzaChart, PizzaLegend, type PizzaWedge } from "@/components/players/PercentilePizzaChart";
import { percentileRank, positionGroup } from "@/lib/percentile";
import { formatDate } from "@/lib/utils";
import type { ImpectLeaguePlayer as LeaguePlayer } from "@/lib/impect-types";

const MIN_MINUTES_FOR_POPULATION = 270; // ~3 full matches — same "enough of a sample" bar used elsewhere in this app (MINIMUM_RATED_MATCHES)

function buildWedges(player: LeaguePlayer, allPlayers: LeaguePlayer[]): PizzaWedge[] {
  const group = positionGroup(player.position);
  const peers = allPlayers.filter((p) => positionGroup(p.position) === group && p.minutes >= MIN_MINUTES_FOR_POPULATION);

  function rank(pick: (p: LeaguePlayer) => number | null, inverted = false): number | null {
    const value = pick(player);
    if (value === null) return null;
    const population = peers.map(pick).filter((v): v is number => v !== null);
    return percentileRank(value, population, inverted);
  }

  return [
    { label: "Goals", percentile: rank((p) => p.goals), group: "attacking" },
    { label: "Assists", percentile: rank((p) => p.assists), group: "attacking" },
    { label: "Shots /90", percentile: rank((p) => p.shotsPer90), group: "attacking" },
    { label: "Shot xG /90", percentile: rank((p) => p.shotXgPer90), group: "attacking" },
    { label: "Packing xG /90", percentile: rank((p) => p.packingXgPer90), group: "progression" },
    { label: "Byp. Opp. /90", percentile: rank((p) => p.bypassedOpponentsPer90), group: "progression" },
    { label: "Byp. Def. /90", percentile: rank((p) => p.bypassedDefendersPer90), group: "progression" },
    { label: "Ball Win /90", percentile: rank((p) => p.ballWinPer90), group: "progression" },
    { label: "Ground Duel %", percentile: rank((p) => p.groundDuelWinPercent), group: "duels" },
    { label: "Aerial Duel %", percentile: rank((p) => p.aerialDuelWinPercent), group: "duels" },
    { label: "Ball Security /90", percentile: rank((p) => p.ballLossPer90, true), group: "duels" },
  ];
}

export function ImpectPlayerPizzaDrawer({
  player,
  allPlayers,
  competitionName,
  season,
  onClose,
}: {
  player: LeaguePlayer | null;
  allPlayers: LeaguePlayer[];
  competitionName: string;
  season: string;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!player) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [player, onClose]);

  const wedges = useMemo(() => (player ? buildWedges(player, allPlayers) : []), [player, allPlayers]);
  const group = player ? positionGroup(player.position) : "";
  const peerCount = player
    ? allPlayers.filter((p) => positionGroup(p.position) === group && p.minutes >= MIN_MINUTES_FOR_POPULATION).length
    : 0;

  if (!player) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-y-auto rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-kvm-border px-5 py-3.5">
          <div className="flex items-center gap-3">
            <PlayerAvatar name={player.name} size="md" />
            <div>
              <h2 className="text-sm font-bold text-kvm-ink">{player.name}</h2>
              <p className="text-xs text-gray-500">
                {player.squadName} &middot; {competitionName} {season}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-kvm-ink">
            <X size={18} />
          </button>
        </div>

        <div className="p-5">
          <p className="mb-3 text-center text-xs text-gray-400">
            Percentile rank vs. {peerCount} {group} with 270+ minutes in {competitionName} {season} — real ranks from
            Impect&apos;s data, never estimated.
          </p>

          <PercentilePizzaChart
            wedges={wedges}
            centerContent={
              <>
                <PlayerAvatar name={player.name} size="lg" />
                <span className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  {group}
                </span>
              </>
            }
          />

          <div className="mt-3">
            <PizzaLegend />
          </div>

          <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-kvm-border pt-4 text-center text-sm">
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Minutes</dt>
              <dd className="mt-0.5 font-bold tabular-nums text-kvm-ink">{player.minutes}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Match Share</dt>
              <dd className="mt-0.5 font-bold tabular-nums text-kvm-ink">{player.matchShare}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Birthdate</dt>
              <dd className="mt-0.5 font-bold text-kvm-ink">{player.birthdate ? formatDate(player.birthdate) : "Unknown"}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
