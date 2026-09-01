"use client";

import { Bookmark, Clock } from "lucide-react";
import type { MatchLineupPlayer } from "@/lib/matches-data";
import type { Player } from "@/lib/players-data";
import { birthYear, contractStatus, cn } from "@/lib/utils";
import { flagForNationality } from "@/lib/nationalityFlags";

/**
 * One player marker on the pitch: nationality flag, shirt number, name,
 * birth year, the match-specific SofaScore rating slot — genuinely
 * "Rating unavailable" today (no real provider connected, see
 * docs/SOFASCORE_PROVIDER.md), never an approximation — and, when this
 * specific match's real events confirm it, goals/assists actually
 * scored in this match (`lineupPlayer.goals`/`assists`, straight from
 * SCOUTASTIC's match sheet). `player` (the matched real Player record,
 * when one exists) adds the flag/shortlisted/contract accents — a
 * lineup player SCOUTASTIC hasn't synced into `players` yet still
 * renders from the match-sheet fields alone, just without those.
 */
export function PlayerPitchChip({
  lineupPlayer,
  player,
  isShortlisted,
  matchRating,
  onClick,
}: {
  lineupPlayer: MatchLineupPlayer;
  player: Player | null;
  isShortlisted: boolean;
  matchRating: number | null;
  onClick: () => void;
}) {
  const name = player?.name ?? ([lineupPlayer.firstName, lineupPlayer.lastName].filter(Boolean).join(" ") || "Unknown");
  const year = birthYear(player?.dateOfBirth ?? null);
  const flag = flagForNationality(player?.nationality ?? null);
  // "Running out of contract or 1 year left" — same urgent cutoff (<=12
  // months) already used for the Players table's contract column, see
  // contractStatus() in src/lib/utils.ts.
  const contractUrgent = player ? contractStatus(player.contractExpiry).urgent : false;
  const hasGoalContribution = lineupPlayer.goals > 0 || lineupPlayer.assists > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-[92px] flex-col items-center gap-1 rounded-sm px-1 py-1 text-center transition-colors hover:bg-white/15 sm:w-[104px]"
    >
      <span
        className={cn(
          "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-bold text-kvm-ink shadow-sm ring-1 ring-black/10 sm:h-9 sm:w-9",
          contractUrgent && "ring-2 ring-kvm-red ring-offset-1 ring-offset-kvm-pitch"
        )}
        title={contractUrgent ? `Contract expires ${contractStatus(player!.contractExpiry).label}` : undefined}
      >
        {lineupPlayer.shirtNumber ?? "–"}
        {isShortlisted ? (
          <Bookmark
            size={11}
            className="absolute -bottom-1 -right-1 rounded-full bg-kvm-red p-[1px] text-white"
            aria-label="Shortlisted"
          />
        ) : null}
        {contractUrgent ? (
          <Clock
            size={11}
            className="absolute -left-1 -top-1 rounded-full bg-kvm-red p-[1px] text-white"
            aria-label="Contract expiring within a year"
          />
        ) : null}
      </span>
      <span className="flex w-full items-center justify-center gap-1 truncate text-[11px] font-semibold leading-tight text-white drop-shadow-sm">
        {flag ? (
          <span aria-label={player?.nationality ?? undefined} title={player?.nationality ?? undefined}>
            {flag}
          </span>
        ) : null}
        <span className="truncate">{name}</span>
      </span>
      <span className="flex items-center gap-1 text-[10px] leading-tight text-white/80">
        {year ?? "—"}
        <span
          className={cn(
            "rounded-sm px-1 font-bold",
            matchRating !== null ? "bg-kvm-yellow text-kvm-ink" : "bg-white/20 text-white/70"
          )}
        >
          {matchRating !== null ? matchRating.toFixed(1) : "N/A"}
        </span>
      </span>
      {hasGoalContribution ? (
        <span className="flex items-center gap-1 text-[10px] font-bold leading-tight">
          {lineupPlayer.goals > 0 ? (
            <span className="rounded-sm bg-kvm-yellow px-1 text-kvm-ink" title={`${lineupPlayer.goals} goal${lineupPlayer.goals > 1 ? "s" : ""}`}>
              ⚽ {lineupPlayer.goals}
            </span>
          ) : null}
          {lineupPlayer.assists > 0 ? (
            <span className="rounded-sm bg-white/20 px-1 text-white" title={`${lineupPlayer.assists} assist${lineupPlayer.assists > 1 ? "s" : ""}`}>
              A {lineupPlayer.assists}
            </span>
          ) : null}
        </span>
      ) : null}
    </button>
  );
}
