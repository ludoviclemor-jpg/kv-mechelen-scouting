"use client";

import { Globe2, Bookmark } from "lucide-react";
import type { MatchLineupPlayer } from "@/lib/matches-data";
import type { Player } from "@/lib/players-data";
import { birthYear, cn } from "@/lib/utils";

/**
 * One player marker on the pitch: shirt number, name, birth year, and the
 * match-specific SofaScore rating slot — genuinely "Rating unavailable"
 * today (no real provider connected, see docs/SOFASCORE_PROVIDER.md),
 * never an approximation. `player` (the matched real Player record, when
 * one exists) adds the African/shortlisted accent dots — a lineup player
 * SCOUTASTIC hasn't synced into `players` yet still renders from the
 * match-sheet fields alone, just without those accents.
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

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-[92px] flex-col items-center gap-1 rounded-sm px-1 py-1 text-center transition-colors hover:bg-white/15 sm:w-[104px]"
    >
      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-bold text-kvm-ink shadow-sm ring-1 ring-black/10 sm:h-9 sm:w-9">
        {lineupPlayer.shirtNumber ?? "–"}
        {player?.isAfrican ? (
          <Globe2
            size={11}
            className="absolute -right-1 -top-1 rounded-full bg-kvm-yellow p-[1px] text-kvm-ink"
            aria-label="African nationality"
          />
        ) : null}
        {isShortlisted ? (
          <Bookmark
            size={11}
            className="absolute -bottom-1 -right-1 rounded-full bg-kvm-red p-[1px] text-white"
            aria-label="Shortlisted"
          />
        ) : null}
      </span>
      <span className="w-full truncate text-[11px] font-semibold leading-tight text-white drop-shadow-sm">{name}</span>
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
    </button>
  );
}
