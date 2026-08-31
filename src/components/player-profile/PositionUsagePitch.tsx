import { pitchCoordinateFor } from "@/lib/positionPitch";
import { positionLabel, type Position } from "@/lib/players-data";
import { cn } from "@/lib/utils";
import { LayoutGrid } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

interface UsageEntry {
  code: string;
  label: string;
  matches: number;
  pct: number;
}

/**
 * "Positions actually played" (real, appearance-counted, from
 * `players.played_positions`) versus the generic registered `position` —
 * item 16's explicit instruction: never conflate the two. When
 * played_positions is empty (not yet re-crawled since this field was
 * added, or SCOUTASTIC genuinely has none for this player — see
 * docs/PLAYER_PROFILE.md), this falls back to clearly labeling the
 * registered position instead of pretending it's usage data.
 */
export function PositionUsagePitch({
  playedPositions,
  registeredPosition,
}: {
  playedPositions: Record<string, number> | null;
  registeredPosition: Position | null;
}) {
  const total = playedPositions ? Object.values(playedPositions).reduce((a, b) => a + b, 0) : 0;

  if (!playedPositions || total === 0) {
    return (
      <div>
        <EmptyState
          icon={LayoutGrid}
          title="Positions actually played — data unavailable"
          description="SCOUTASTIC hasn't returned match-by-match position data for this player yet."
        />
        <p className="px-1 pb-3 text-center text-xs text-gray-400">
          Registered position: <span className="font-semibold text-kvm-ink">{positionLabel(registeredPosition)}</span>
        </p>
      </div>
    );
  }

  const entries: UsageEntry[] = Object.entries(playedPositions)
    .map(([code, matches]) => ({ code, label: pitchCoordinateFor(code)?.label ?? code, matches, pct: (matches / total) * 100 }))
    .sort((a, b) => b.matches - a.matches);

  const primary = entries[0];
  const secondary = entries.slice(1);
  const plottable = entries.map((e) => ({ ...e, coord: pitchCoordinateFor(e.code) })).filter((e) => e.coord !== null);
  const unplottable = entries.filter((e) => pitchCoordinateFor(e.code) === null);

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Primary position: <span className="font-semibold text-kvm-ink">{primary.label}</span>
        {secondary.length > 0 ? (
          <>
            {" "}
            · Secondary: <span className="font-medium text-kvm-ink">{secondary.map((s) => s.label).join(", ")}</span>
          </>
        ) : null}
      </p>

      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-sm bg-kvm-pitch sm:aspect-[4/3]">
        <div className="pointer-events-none absolute inset-3 rounded-sm border border-white/25" />
        <div className="pointer-events-none absolute left-3 right-3 top-1/2 border-t border-white/25" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25" />

        {plottable.map((e) => {
          // Most-used position reads strongest (larger, fully opaque);
          // secondary ones stay visible but recede — the visual weight
          // is driven by real appearance share, not a fixed rank.
          const scale = 0.55 + (e.pct / 100) * 0.7;
          const opacity = 0.55 + (e.pct / 100) * 0.45;
          return (
            <div
              key={e.code}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
              style={{ left: `${e.coord!.x}%`, top: `${100 - e.coord!.y}%` }}
            >
              <div
                className={cn(
                  "flex items-center justify-center rounded-full bg-kvm-yellow font-bold text-kvm-ink shadow-sm ring-1 ring-black/10"
                )}
                style={{ width: `${2.2 * scale}rem`, height: `${2.2 * scale}rem`, opacity, fontSize: `${0.6 * scale + 0.3}rem` }}
              >
                {e.label}
              </div>
              <span className="mt-0.5 rounded-sm bg-black/40 px-1 text-[10px] font-semibold text-white">{Math.round(e.pct)}%</span>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
        {entries.map((e) => (
          <div key={e.code} className="flex items-center justify-between border-b border-kvm-border py-1">
            <span className="font-medium text-kvm-ink">{e.label}</span>
            <span className="text-xs text-gray-500">
              {Math.round(e.pct)}% · {e.matches} {e.matches === 1 ? "match" : "matches"}
            </span>
          </div>
        ))}
      </div>

      {unplottable.length > 0 ? (
        <p className="text-[11px] text-gray-400">
          Also played (position code not recognized for pitch placement): {unplottable.map((e) => e.label).join(", ")}
        </p>
      ) : null}
    </div>
  );
}
