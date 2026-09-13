"use client";

import Link from "next/link";
import { getFormation } from "@/lib/shadow-xi";
import type { SlotSelection } from "@/lib/best-xi";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { cn } from "@/lib/utils";

/**
 * Read-only pitch view for the "Data Best XI" page — same formation
 * config and the same visual language as
 * src/components/shortlists/ShadowXIView.tsx's pitch (modern, subtle
 * lines, no game-like decoration), but a dedicated, simpler component
 * since the interaction model is fundamentally different here (no
 * drag/drop, no editing — click a card to open the detail panel, click
 * the name to open the real player profile).
 */
export function BestXIPitch({
  formationId,
  slots,
  selectedSlot,
  onSelectSlot,
}: {
  formationId: string;
  slots: SlotSelection[];
  selectedSlot: string | null;
  onSelectSlot: (slot: string) => void;
}) {
  const formation = getFormation(formationId);
  const slotBySlotKey = new Map(slots.map((s) => [s.slot, s]));

  return (
    <div
      className="relative mx-auto w-full max-w-2xl overflow-hidden rounded-xl border border-emerald-900/20"
      style={{ aspectRatio: "68 / 100", background: "linear-gradient(180deg, #1f6b3f 0%, #24793f 50%, #1f6b3f 100%)" }}
    >
      <div className="absolute inset-3 rounded-sm border border-white/25" />
      <div className="absolute left-3 right-3 top-1/2 h-px -translate-y-1/2 bg-white/25" />
      <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25" />
      <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/40" />
      <div className="absolute left-1/2 top-3 h-[16%] w-[46%] -translate-x-1/2 border border-t-0 border-white/25" />
      <div className="absolute bottom-3 left-1/2 h-[16%] w-[46%] -translate-x-1/2 border border-b-0 border-white/25" />

      {formation.positions.map((pos) => {
        const slot = slotBySlotKey.get(pos.slot);
        const candidate = slot?.candidate ?? null;
        const isSelected = selectedSlot === pos.slot;

        return (
          <div key={pos.slot} className="absolute w-[17%] min-w-14 max-w-28 -translate-x-1/2 -translate-y-1/2 sm:w-24" style={{ left: `${pos.x}%`, top: `${pos.y}%` }}>
            {candidate ? (
              <button
                type="button"
                onClick={() => onSelectSlot(pos.slot)}
                className={cn(
                  "w-full rounded-lg border bg-white p-1.5 text-center shadow-md transition-transform hover:-translate-y-0.5",
                  isSelected ? "ring-2 ring-kvm-red" : ""
                )}
              >
                <PlayerAvatar name={candidate.playerName} photoUrl={candidate.photoUrl} size="sm" className="mx-auto" />
                <Link
                  href={`/player?id=sc-${candidate.scoutasticPlayerId}`}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-1 block truncate text-[10.5px] font-bold text-kvm-ink hover:text-kvm-red hover:underline"
                  title={candidate.playerName}
                >
                  {candidate.playerName}
                </Link>
                <p className="truncate text-[9.5px] text-gray-400">{candidate.club ?? "Unknown club"}</p>
                <p className="mt-0.5 text-[10px] font-bold text-kvm-red tabular-nums">{candidate.performanceScore.toFixed(1)}</p>
                <p className="text-[9px] text-gray-400">{candidate.minutes} min</p>
              </button>
            ) : (
              <div className="flex w-full flex-col items-center gap-0.5 rounded-lg border-2 border-dashed border-white/40 bg-white/10 px-1.5 py-3 text-white backdrop-blur-sm">
                <span className="text-[10px] font-semibold uppercase tracking-wide">{pos.slot}</span>
                <span className="text-[8.5px] text-white/70">No eligible data</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
