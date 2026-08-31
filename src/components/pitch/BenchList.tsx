"use client";

import { Clock } from "lucide-react";
import type { Match, MatchLineupPlayer } from "@/lib/matches-data";
import type { Player } from "@/lib/players-data";
import { positionLabel } from "@/lib/players-data";
import { birthYear, contractStatus, cn } from "@/lib/utils";

type MatchEvents = Match["events"];

/**
 * Substitutes for one team — distinguishes players who actually entered
 * the match (real minutes played) from unused substitutes, and shows
 * substitute-in/out minutes from the match's real events timeline where
 * available (never fabricated when the event data doesn't confirm it).
 */
export function BenchList({
  teamName,
  substitutes,
  events,
  playersById,
  matchRatings,
  onPlayerClick,
}: {
  teamName: string | null;
  substitutes: MatchLineupPlayer[];
  events: MatchEvents;
  playersById: Map<string, Player>;
  matchRatings: Map<string, number>;
  onPlayerClick: (lineupPlayer: MatchLineupPlayer) => void;
}) {
  const used = substitutes.filter((p) => p.minutesPlayed > 0);
  const unused = substitutes.filter((p) => p.minutesPlayed === 0);

  function subInMinute(playerId: string): number | null {
    const e = events.find((ev) => ev.type === "substituteIn" && ev.playerId === playerId);
    return e?.gameMinute ?? null;
  }

  function Row({ p }: { p: MatchLineupPlayer }) {
    const player = playersById.get(`sc-${p.id}`) ?? null;
    const name = player?.name ?? ([p.firstName, p.lastName].filter(Boolean).join(" ") || "Unknown");
    const rating = matchRatings.get(p.id) ?? null;
    const inMinute = subInMinute(p.id);
    // Same urgent cutoff (<=12 months) as the pitch chips/Players table — see contractStatus() in src/lib/utils.ts.
    const contractUrgent = player ? contractStatus(player.contractExpiry).urgent : false;

    return (
      <button
        type="button"
        onClick={() => onPlayerClick(p)}
        className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left hover:bg-gray-50"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              "relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-bold text-gray-500",
              contractUrgent && "ring-2 ring-kvm-red"
            )}
            title={contractUrgent ? `Contract expires ${contractStatus(player!.contractExpiry).label}` : undefined}
          >
            {p.shirtNumber ?? "–"}
            {contractUrgent ? (
              <Clock size={10} className="absolute -left-1 -top-1 rounded-full bg-kvm-red p-[1px] text-white" aria-label="Contract expiring within a year" />
            ) : null}
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-kvm-ink">{name}</div>
            <div className="text-[11px] text-gray-400">
              {birthYear(player?.dateOfBirth ?? null) ?? "—"} · {player ? positionLabel(player.position) : "Unknown"}
              {inMinute !== null ? ` · on ${inMinute}′` : ""}
              {p.minutesPlayed > 0 ? ` · ${p.minutesPlayed}′ played` : ""}
            </div>
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-sm px-1.5 py-0.5 text-[11px] font-bold",
            rating !== null ? "bg-kvm-yellow text-kvm-ink" : "bg-gray-100 text-gray-400"
          )}
        >
          {rating !== null ? rating.toFixed(1) : "N/A"}
        </span>
      </button>
    );
  }

  return (
    <div className="border border-kvm-border bg-white">
      <h3 className="border-b border-kvm-border px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-gray-500">
        Substitutes {teamName ? `· ${teamName}` : ""}
      </h3>
      {substitutes.length === 0 ? (
        <p className="px-4 py-4 text-xs text-gray-400">No substitute data available for this match.</p>
      ) : (
        <>
          {used.length > 0 ? (
            <div>
              <p className="px-4 pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Entered the match</p>
              <div className="divide-y divide-kvm-border">
                {used.map((p) => (
                  <Row key={p.id} p={p} />
                ))}
              </div>
            </div>
          ) : null}
          {unused.length > 0 ? (
            <div>
              <p className="px-4 pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Unused</p>
              <div className="divide-y divide-kvm-border">
                {unused.map((p) => (
                  <Row key={p.id} p={p} />
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
