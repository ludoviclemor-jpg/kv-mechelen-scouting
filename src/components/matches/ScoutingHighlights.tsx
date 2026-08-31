"use client";

import type { MatchLineupPlayer } from "@/lib/matches-data";
import type { Player } from "@/lib/players-data";
import { useAppStore } from "@/lib/app-store";
import { calculateAge } from "@/lib/utils";
import { Star, Globe2, Bookmark, Eye } from "lucide-react";

interface Highlight {
  icon: typeof Star;
  label: string;
  players: { lineupPlayer: MatchLineupPlayer; player: Player | null }[];
}

/**
 * Automatic scouting summary for a match — surfaces what's actually
 * knowable from real data (African players, shortlisted players,
 * players with a scouting status set, U21/U23 players) rather than
 * rating-based highlights, which stay empty until a real SofaScore
 * source exists (see docs/SOFASCORE_PROVIDER.md) — never approximated.
 */
export function ScoutingHighlights({
  allLineupPlayers,
  playersById,
}: {
  allLineupPlayers: MatchLineupPlayer[];
  playersById: Map<string, Player>;
}) {
  const { shortlists, statusOverrides } = useAppStore();
  const shortlistedIds = new Set(shortlists.flatMap((s) => s.playerIds));

  const withPlayer = allLineupPlayers
    .filter((lp) => lp.inLineup || lp.minutesPlayed > 0)
    .map((lp) => ({ lineupPlayer: lp, player: playersById.get(`sc-${lp.id}`) ?? null }))
    .filter((x): x is { lineupPlayer: MatchLineupPlayer; player: Player } => x.player !== null);

  const highlights: Highlight[] = [
    {
      icon: Globe2,
      label: "African players featured",
      players: withPlayer.filter((x) => x.player.isAfrican),
    },
    {
      icon: Star,
      label: "Under-21",
      players: withPlayer.filter((x) => {
        const age = calculateAge(x.player.dateOfBirth);
        return age !== null && age < 21;
      }),
    },
    {
      icon: Bookmark,
      label: "Shortlisted",
      players: withPlayer.filter((x) => shortlistedIds.has(x.player.id)),
    },
    {
      icon: Eye,
      label: "Monitoring / Interested / Priority",
      players: withPlayer.filter((x) =>
        ["monitoring", "interested", "priority"].includes(statusOverrides[x.player.id] ?? x.player.status)
      ),
    },
  ].filter((h) => h.players.length > 0);

  if (highlights.length === 0) return null;

  return (
    <div className="border border-kvm-border bg-white">
      <h3 className="border-b border-kvm-border px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-gray-500">
        Scouting Highlights
      </h3>
      <div className="space-y-3 p-4">
        {highlights.map((h) => (
          <div key={h.label} className="flex items-start gap-2.5">
            <h.icon size={14} className="mt-0.5 shrink-0 text-kvm-red" aria-hidden="true" />
            <div>
              <div className="text-xs font-semibold text-gray-500">{h.label}</div>
              <div className="mt-0.5 text-sm text-kvm-ink">
                {h.players.map((x) => x.player!.name).join(", ")}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
