"use client";

import { useEffect } from "react";
import Link from "next/link";
import { X, ArrowRight } from "lucide-react";
import type { MatchLineupPlayer } from "@/lib/matches-data";
import type { Player } from "@/lib/players-data";
import { computeMatchStats, positionLabel } from "@/lib/players-data";
import { useEffectiveStatus } from "@/lib/app-store";
import { ShortlistButton } from "@/components/shortlists/ShortlistButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { RatingBadge } from "@/components/ui/RatingBadge";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { birthYear, calculateAge, cn } from "@/lib/utils";

/**
 * Quick scouting drawer opened by clicking a player on the match sheet —
 * preferred over navigating away immediately (per explicit requirement),
 * with "View full profile →" for anyone who wants the complete page.
 * Reuses the same shortlist/status components as the full profile —
 * nothing about scouting workflow is duplicated here.
 */
export function PlayerQuickDrawer({
  lineupPlayer,
  player,
  matchRating,
  onClose,
}: {
  lineupPlayer: MatchLineupPlayer | null;
  player: Player | null;
  matchRating: number | null;
  onClose: () => void;
}) {
  const open = lineupPlayer !== null;

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Called unconditionally, before the early return below — hooks can't
  // follow a conditional return (Rules of Hooks).
  const status = useEffectiveStatus(player?.id ?? "", player?.status ?? "not_assessed");

  if (!lineupPlayer) return null;

  const name = player?.name ?? ([lineupPlayer.firstName, lineupPlayer.lastName].filter(Boolean).join(" ") || "Unknown");
  const stats = player ? computeMatchStats(player.matches) : null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/30" />
      <div className="relative flex h-full w-full max-w-sm flex-col overflow-y-auto border-l border-kvm-border bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-kvm-border px-5 py-3.5">
          <h2 className="text-sm font-bold text-kvm-ink">Quick Scout</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-kvm-ink">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-5 p-5">
          <div className="flex items-center gap-3">
            <PlayerAvatar name={name} photoUrl={player?.photoUrl ?? null} />
            <div className="min-w-0">
              <div className="truncate text-base font-bold text-kvm-ink">{name}</div>
              <div className="text-xs text-gray-500">
                {player ? positionLabel(player.position) : "Unknown position"}
                {lineupPlayer.shirtNumber ? ` · #${lineupPlayer.shirtNumber}` : ""}
              </div>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Age</dt>
              <dd className="mt-0.5 font-medium text-kvm-ink">{calculateAge(player?.dateOfBirth ?? null) ?? "Unknown"}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Birth year</dt>
              <dd className="mt-0.5 font-medium text-kvm-ink">{birthYear(player?.dateOfBirth ?? null) ?? "Unknown"}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Nationality</dt>
              <dd className="mt-0.5 font-medium text-kvm-ink">{player?.nationality ?? "Unknown"}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Club</dt>
              <dd className="mt-0.5 font-medium text-kvm-ink">{player?.club ?? "Unknown"}</dd>
            </div>
          </dl>

          <div className="border-t border-kvm-border pt-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">This match&apos;s rating</span>
              <span
                className={cn(
                  "rounded-sm px-2 py-0.5 text-sm font-bold",
                  matchRating !== null ? "bg-kvm-yellow text-kvm-ink" : "bg-gray-100 text-gray-400"
                )}
              >
                {matchRating !== null ? matchRating.toFixed(1) : "Rating unavailable"}
              </span>
            </div>
            {stats ? (
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Last 5 average</span>
                <RatingBadge rating={stats.average} size="sm" />
              </div>
            ) : null}
          </div>

          {player ? (
            <div className="border-t border-kvm-border pt-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Scouting status</span>
                <StatusBadge status={status} />
              </div>
              <div className="mt-3">
                <ShortlistButton playerId={player.id} />
              </div>
            </div>
          ) : (
            <p className="border-t border-kvm-border pt-4 text-xs text-gray-400">
              This player hasn&apos;t been synced into the SCOUTASTIC player database yet — scouting status and shortlists
              aren&apos;t available.
            </p>
          )}
        </div>

        {player ? (
          <Link
            href={`/player?id=${player.id}`}
            className="flex items-center justify-center gap-1.5 border-t border-kvm-border bg-kvm-charcoal px-5 py-3 text-sm font-semibold text-white hover:bg-kvm-charcoal-light"
          >
            View full profile
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
