"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Plus, X, ArrowLeftRight, RefreshCw, Trash2 } from "lucide-react";
import { fetchShadowXI, saveShadowXI, clearShadowXI, getFormation, assignPlayerToSlot, removePlayerFromSlot, swapSlots, type ShadowXISlots } from "@/lib/shadow-xi";
import { fetchPlayersByIds, useAsync, type Shortlist } from "@/lib/players-data";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { LoadingState, ErrorState } from "@/components/ui/LoadingState";
import { calculateAge, formatDate, cn } from "@/lib/utils";
import { PlayerPickerModal } from "./PlayerPickerModal";

/** Formation slot key -> real Scoutastic Position codes it corresponds to — sorting-only hint for the picker (see PlayerPickerModal), never a hard restriction (a scout can place any player in any slot on purpose). */
const SLOT_MATCHING_POSITIONS: Record<string, string[]> = {
  GK: ["GK"],
  RB: ["RB"],
  RCB: ["CB"],
  LCB: ["CB"],
  LB: ["LB"],
  RDM: ["DM"],
  LDM: ["DM"],
  RW: ["RW"],
  CAM: ["AM"],
  LW: ["LW"],
  ST: ["ST"],
};

interface PickerState {
  slot: string;
  label: string;
}

export function ShadowXIView({ shortlist }: { shortlist: Shortlist }) {
  const formation = getFormation("4-2-3-1");

  const { data: shadowXI, loading, error, reload } = useAsync(() => fetchShadowXI(shortlist.id), [shortlist.id]);
  const { data: shortlistPlayers } = useAsync(() => fetchPlayersByIds(shortlist.playerIds), [shortlist.playerIds.join(",")]);

  const [slots, setSlots] = useState<ShadowXISlots>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [swapSource, setSwapSource] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const initializedForShortlist = useRef<string | null>(null);

  // Load the real saved slots once per shortlist switch — local `slots`
  // then owns further edits (each edit saves immediately, see
  // `persist`), so this must NOT re-run on every background refetch or
  // it would stomp an in-flight edit with stale server data.
  useEffect(() => {
    if (shadowXI && initializedForShortlist.current !== shortlist.id) {
      setSlots(shadowXI.slots);
      initializedForShortlist.current = shortlist.id;
    } else if (!loading && !shadowXI && initializedForShortlist.current !== shortlist.id) {
      setSlots({});
      initializedForShortlist.current = shortlist.id;
    }
  }, [shadowXI, loading, shortlist.id]);

  const assignedPlayerIds = useMemo(() => Object.values(slots), [slots]);
  const allNeededIds = useMemo(
    () => Array.from(new Set([...shortlist.playerIds, ...assignedPlayerIds])),
    [shortlist.playerIds, assignedPlayerIds]
  );
  const { data: allPlayers } = useAsync(() => fetchPlayersByIds(allNeededIds), [allNeededIds.join(",")]);
  const playerById = useMemo(() => new Map((allPlayers ?? []).map((p) => [p.id, p])), [allPlayers]);

  async function persist(next: ShadowXISlots) {
    const previous = slots;
    setSlots(next);
    setSaveError(null);
    try {
      await saveShadowXI(shortlist.id, formation.id, next);
    } catch (err) {
      setSlots(previous);
      setSaveError(err instanceof Error ? err.message : "Failed to save — try again.");
    }
  }

  function assignPlayer(slot: string, playerId: string) {
    persist(assignPlayerToSlot(slots, slot, playerId));
    setPicker(null);
  }

  function removePlayer(slot: string) {
    persist(removePlayerFromSlot(slots, slot));
  }

  function swap(slotA: string, slotB: string) {
    persist(swapSlots(slots, slotA, slotB));
    setSwapSource(null);
  }

  async function handleClearAll() {
    setConfirmingClear(false);
    setSaveError(null);
    const previous = slots;
    setSlots({});
    try {
      await clearShadowXI(shortlist.id, formation.id);
    } catch (err) {
      setSlots(previous);
      setSaveError(err instanceof Error ? err.message : "Failed to clear — try again.");
    }
  }

  function handleSlotClick(slotKey: string) {
    const currentPlayerId = slots[slotKey];
    if (swapSource) {
      if (swapSource === slotKey) {
        setSwapSource(null);
      } else {
        swap(swapSource, slotKey);
      }
      return;
    }
    if (!currentPlayerId) {
      const def = formation.positions.find((p) => p.slot === slotKey)!;
      setPicker({ slot: slotKey, label: def.label });
    }
  }

  function handleDragStart(e: React.DragEvent, slotKey: string) {
    e.dataTransfer.setData("text/plain", slotKey);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDrop(e: React.DragEvent, targetSlot: string) {
    e.preventDefault();
    const sourceSlot = e.dataTransfer.getData("text/plain");
    if (!sourceSlot || sourceSlot === targetSlot) return;
    swap(sourceSlot, targetSlot);
  }

  const filledCount = Object.keys(slots).length;
  const excludeForPicker = picker ? Object.entries(slots).filter(([slot]) => slot !== picker.slot).map(([, id]) => id) : [];

  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (loading) return <LoadingState label="Loading Shadow XI…" />;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-kvm-border px-5 py-3">
        <div>
          <h3 className="text-sm font-bold text-kvm-ink">{shortlist.name} — Shadow XI</h3>
          <p className="text-xs text-gray-500">
            Formation: {formation.name} · {filledCount}/11 filled
            {shadowXI ? <> · Last updated {formatDate(shadowXI.updatedAt)}</> : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {swapSource ? (
            <span className="flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">
              <ArrowLeftRight size={13} aria-hidden="true" />
              Pick a position to swap with
              <button type="button" onClick={() => setSwapSource(null)} className="ml-1 text-amber-600 hover:text-amber-900">
                <X size={13} aria-hidden="true" />
              </button>
            </span>
          ) : null}
          {confirmingClear ? (
            <span className="flex items-center gap-2 text-xs">
              <span className="font-medium text-gray-600">Clear all 11 positions?</span>
              <button type="button" onClick={handleClearAll} className="font-semibold text-kvm-red hover:underline">
                Yes, clear
              </button>
              <button type="button" onClick={() => setConfirmingClear(false)} className="font-semibold text-gray-500 hover:underline">
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingClear(true)}
              disabled={filledCount === 0}
              className="flex items-center gap-1.5 rounded-md border border-kvm-border bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:border-kvm-red hover:text-kvm-red disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 size={13} aria-hidden="true" />
              Clear all
            </button>
          )}
        </div>
      </div>

      {saveError ? <p className="border-b border-kvm-border bg-red-50 px-5 py-2 text-xs font-medium text-kvm-red">{saveError}</p> : null}

      <div className="p-5">
        <div
          className="relative mx-auto w-full max-w-2xl overflow-hidden rounded-xl border border-emerald-900/20"
          style={{
            aspectRatio: "68 / 100",
            background: "linear-gradient(180deg, #1f6b3f 0%, #24793f 50%, #1f6b3f 100%)",
          }}
        >
          {/* Pitch markings — subtle, real proportions, no game-like decoration. */}
          <div className="absolute inset-3 rounded-sm border border-white/25" />
          <div className="absolute left-3 right-3 top-1/2 h-px -translate-y-1/2 bg-white/25" />
          <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25" />
          <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/40" />
          <div className="absolute left-1/2 top-3 h-[16%] w-[46%] -translate-x-1/2 border border-t-0 border-white/25" />
          <div className="absolute bottom-3 left-1/2 h-[16%] w-[46%] -translate-x-1/2 border border-b-0 border-white/25" />

          {formation.positions.map((pos) => {
            const playerId = slots[pos.slot];
            const player = playerId ? playerById.get(playerId) : null;
            const isSwapCandidate = swapSource !== null && swapSource !== pos.slot;
            const isSwapSource = swapSource === pos.slot;

            return (
              <div
                key={pos.slot}
                className="absolute w-[17%] min-w-14 max-w-28 -translate-x-1/2 -translate-y-1/2 sm:w-24"
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDrop(e, pos.slot)}
              >
                {playerId ? (
                  <div
                    draggable
                    onDragStart={(e) => handleDragStart(e, pos.slot)}
                    onClick={() => handleSlotClick(pos.slot)}
                    className={cn(
                      "group relative cursor-pointer rounded-lg border bg-white p-1.5 text-center shadow-md transition-transform hover:-translate-y-0.5",
                      isSwapSource && "ring-2 ring-kvm-red",
                      isSwapCandidate && "ring-2 ring-amber-400"
                    )}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removePlayer(pos.slot);
                      }}
                      aria-label={`Remove ${player?.name ?? "player"} from ${pos.label}`}
                      className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-gray-400 opacity-0 shadow ring-1 ring-kvm-border hover:text-kvm-red group-hover:opacity-100"
                    >
                      <X size={10} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSwapSource(pos.slot);
                      }}
                      aria-label={`Swap ${player?.name ?? "player"} with another position`}
                      title="Swap with another position"
                      className="absolute -left-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-gray-400 opacity-0 shadow ring-1 ring-kvm-border hover:text-kvm-ink group-hover:opacity-100"
                    >
                      <ArrowLeftRight size={9} aria-hidden="true" />
                    </button>

                    <PlayerAvatar name={player?.name ?? "?"} photoUrl={player?.photoUrl ?? null} size="sm" className="mx-auto" />
                    {player ? (
                      <Link
                        href={`/player?id=${player.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 block truncate text-[10.5px] font-bold text-kvm-ink hover:text-kvm-red hover:underline"
                        title={player.name}
                      >
                        {player.name}
                      </Link>
                    ) : (
                      <p className="mt-1 truncate text-[10.5px] font-bold text-gray-400">Unknown player</p>
                    )}
                    <p className="truncate text-[9.5px] text-gray-400">{player?.club ?? "Unknown club"}</p>
                    <div className="mt-0.5 flex items-center justify-center gap-1 text-[9px] text-gray-500">
                      {player?.dateOfBirth ? <span>{calculateAge(player.dateOfBirth)}y</span> : null}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPicker({ slot: pos.slot, label: formation.positions.find((p) => p.slot === pos.slot)!.label });
                      }}
                      className="mt-0.5 flex w-full items-center justify-center gap-1 rounded bg-gray-50 py-0.5 text-[9px] font-semibold text-gray-500 opacity-0 hover:bg-gray-100 group-hover:opacity-100"
                    >
                      <RefreshCw size={8} aria-hidden="true" />
                      Replace
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSlotClick(pos.slot)}
                    className={cn(
                      "flex w-full flex-col items-center gap-0.5 rounded-lg border-2 border-dashed bg-white/10 px-1.5 py-2 text-white backdrop-blur-sm transition-colors hover:bg-white/20",
                      isSwapCandidate ? "border-amber-300" : "border-white/40"
                    )}
                  >
                    <Plus size={16} aria-hidden="true" />
                    <span className="text-[10px] font-semibold uppercase tracking-wide">{pos.slot}</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {picker ? (
        <PlayerPickerModal
          slotLabel={picker.label}
          matchingPositions={SLOT_MATCHING_POSITIONS[picker.slot] ?? []}
          shortlistPlayers={shortlistPlayers ?? []}
          excludePlayerIds={excludeForPicker}
          onSelect={(playerId) => assignPlayer(picker.slot, playerId)}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </div>
  );
}
