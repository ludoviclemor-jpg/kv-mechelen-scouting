"use client";

import type { MatchLineupPlayer } from "@/lib/matches-data";
import type { Player } from "@/lib/players-data";
import { buildPitchRows } from "@/lib/formation";
import { EmptyState } from "@/components/ui/EmptyState";
import { PlayerPitchChip } from "./PlayerPitchChip";
import { LayoutGrid } from "lucide-react";

/**
 * One team's starting XI on a pitch, attacking upward (GK at the bottom,
 * nearest their own goal). Real formation/lineup data only — never a
 * randomized layout; falls back to "Formation unavailable" when
 * SCOUTASTIC's data doesn't confirm a clean 11-player formation for this
 * match (see src/lib/formation.ts).
 */
export function PitchFormation({
  teamName,
  tactic,
  players,
  playersById,
  shortlistedIds,
  matchRatings,
  onPlayerClick,
}: {
  teamName: string | null;
  tactic: string | null;
  players: MatchLineupPlayer[];
  playersById: Map<string, Player>;
  shortlistedIds: Set<string>;
  matchRatings: Map<string, number>;
  onPlayerClick: (lineupPlayer: MatchLineupPlayer) => void;
}) {
  const rows = buildPitchRows(players, tactic);

  return (
    <div className="border border-kvm-border bg-white">
      <div className="flex items-center justify-between border-b border-kvm-border px-4 py-2.5">
        <h3 className="text-sm font-bold text-kvm-ink">{teamName ?? "Unknown team"}</h3>
        <span className="text-xs font-medium text-gray-400">{tactic ?? "Formation unavailable"}</span>
      </div>

      {!rows ? (
        <EmptyState icon={LayoutGrid} title="Formation unavailable" description="SCOUTASTIC hasn't confirmed a full starting lineup for this match." />
      ) : (
        <div className="relative overflow-hidden bg-kvm-pitch">
          {/* Subtle field markings — kept minimal on purpose, not a literal pitch illustration */}
          <div className="pointer-events-none absolute inset-3 rounded-sm border border-white/25" />
          <div className="pointer-events-none absolute left-3 right-3 top-1/2 border-t border-white/25" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25" />

          <div className="relative flex flex-col-reverse gap-4 px-2 py-5 sm:px-4">
            {rows.map((row, i) => (
              <div key={i} className="flex items-start justify-evenly">
                {row.players.map((p) => (
                  <PlayerPitchChip
                    key={p.id}
                    lineupPlayer={p}
                    player={playersById.get(`sc-${p.id}`) ?? null}
                    isShortlisted={shortlistedIds.has(`sc-${p.id}`)}
                    matchRating={matchRatings.get(p.id) ?? null}
                    onClick={() => onPlayerClick(p)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
