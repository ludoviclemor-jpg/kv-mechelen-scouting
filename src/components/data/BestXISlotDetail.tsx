"use client";

import Link from "next/link";
import { X } from "lucide-react";
import type { SlotSelection } from "@/lib/best-xi";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";

export function BestXISlotDetail({ slot, onClose }: { slot: SlotSelection; onClose: () => void }) {
  const { candidate, alternates } = slot;

  return (
    <div className="rounded-xl border border-kvm-border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">{slot.label}</h3>
        <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-kvm-ink">
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      {!candidate ? (
        <p className="text-sm text-gray-400">No player with enough real, eligible data was found for this position at the current minimum-minutes filter.</p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <PlayerAvatar name={candidate.playerName} photoUrl={candidate.photoUrl} size="md" />
            <div className="min-w-0">
              <Link href={`/player?id=sc-${candidate.scoutasticPlayerId}`} className="block truncate text-sm font-bold text-kvm-ink hover:text-kvm-red hover:underline">
                {candidate.playerName}
              </Link>
              <p className="truncate text-xs text-gray-500">{candidate.club ?? "Unknown club"}</p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md bg-gray-50 p-2">
              <div className="text-[9px] font-semibold uppercase text-gray-400">Score</div>
              <div className="text-lg font-bold text-kvm-ink">{candidate.performanceScore.toFixed(1)}</div>
            </div>
            <div className="rounded-md bg-gray-50 p-2">
              <div className="text-[9px] font-semibold uppercase text-gray-400">Confidence</div>
              <div className="text-lg font-bold text-kvm-ink">{Math.round(candidate.reliability * 100)}</div>
            </div>
            <div className="rounded-md bg-gray-50 p-2">
              <div className="text-[9px] font-semibold uppercase text-gray-400">Minutes</div>
              <div className="text-lg font-bold text-kvm-ink">{candidate.minutes}</div>
            </div>
          </div>

          <p className="mt-3 text-xs text-gray-500">
            Selected because this player has the highest real within-competition performance score among eligible {slot.label.toLowerCase()} candidates who cleared the
            minimum-minutes filter — score and confidence come directly from Current Level&apos;s own real pillar breakdown for this competition and season, not Potential or
            KV Mechelen Fit.
          </p>

          {alternates.length > 0 ? (
            <div className="mt-4 border-t border-kvm-border pt-3">
              <h4 className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">Next best alternatives</h4>
              <ul className="space-y-1.5">
                {alternates.map((alt) => (
                  <li key={alt.scoutasticPlayerId} className="flex items-center justify-between text-xs">
                    <Link href={`/player?id=sc-${alt.scoutasticPlayerId}`} className="truncate font-medium text-kvm-ink hover:text-kvm-red hover:underline">
                      {alt.playerName}
                    </Link>
                    <span className="shrink-0 tabular-nums text-gray-400">{alt.performanceScore.toFixed(1)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
