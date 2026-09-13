"use client";

import { useEffect, useState } from "react";
import { X, Users } from "lucide-react";
import { searchPlayers, useAsync, positionLabel, type Player } from "@/lib/players-data";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { calculateAge } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";

/** 300ms — matches every other debounced search in the app. */
function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function PlayerRow({ player, onSelect }: { player: Player; onSelect: () => void }) {
  return (
    <button type="button" onClick={onSelect} className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50">
      <PlayerAvatar name={player.name} photoUrl={player.photoUrl} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-kvm-ink">{player.name}</p>
        <p className="truncate text-xs text-gray-400">
          {player.club ?? "Unknown club"}
          {player.dateOfBirth ? ` · ${calculateAge(player.dateOfBirth)} yrs` : ""}
          {player.position ? ` · ${positionLabel(player.position)}` : ""}
        </p>
      </div>
    </button>
  );
}

/**
 * Compact search modal for assigning a player to one Shadow XI slot.
 * Shortlist members matching the slot's real position come first, then
 * the rest of the shortlist, then (once a query is typed) the wider
 * player database — reuses the same `searchPlayers` used everywhere
 * else in the app, never a second/mock player source.
 */
export function PlayerPickerModal({
  slotLabel,
  matchingPositions,
  shortlistPlayers,
  excludePlayerIds,
  onSelect,
  onClose,
}: {
  slotLabel: string;
  /** Real Scoutastic Position codes this slot maps to (e.g. RCB -> ["CB"]) — used only to sort shortlist members first, never to hard-filter (a scout can place any player anywhere on purpose). */
  matchingPositions: string[];
  shortlistPlayers: Player[];
  excludePlayerIds: string[];
  onSelect: (playerId: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query);
  const excludeSet = new Set(excludePlayerIds);

  const shortlistCandidates = shortlistPlayers
    .filter((p) => !excludeSet.has(p.id))
    .filter((p) => !debounced.trim() || p.name.toLowerCase().includes(debounced.trim().toLowerCase()))
    .sort((a, b) => {
      const aMatch = a.position ? matchingPositions.includes(a.position) : false;
      const bMatch = b.position ? matchingPositions.includes(b.position) : false;
      if (aMatch !== bMatch) return aMatch ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  const { data: widerResults } = useAsync(
    () => (debounced.trim().length >= 2 ? searchPlayers(debounced, { excludeIds: [...excludePlayerIds, ...shortlistPlayers.map((p) => p.id)], limit: 8 }) : Promise.resolve([])),
    [debounced, excludePlayerIds.join(","), shortlistPlayers.length]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="relative flex max-h-[80vh] w-full max-w-sm flex-col rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-kvm-border px-4 py-3">
          <h3 className="text-sm font-bold text-kvm-ink">Add player — {slotLabel}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-kvm-ink">
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="border-b border-kvm-border p-3">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search player name…"
            aria-label="Search player name"
            className="w-full rounded-md border border-kvm-border px-2.5 py-1.5 text-sm focus-visible:outline-none"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {shortlistCandidates.length === 0 && (widerResults ?? []).length === 0 ? (
            <EmptyState icon={Users} title="No players found" description="Try a different name, or search the full database above." />
          ) : (
            <>
              {shortlistCandidates.length > 0 ? (
                <div>
                  <p className="border-b border-kvm-border bg-gray-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    In this shortlist
                  </p>
                  {shortlistCandidates.map((p) => (
                    <PlayerRow key={p.id} player={p} onSelect={() => onSelect(p.id)} />
                  ))}
                </div>
              ) : null}

              {(widerResults ?? []).length > 0 ? (
                <div>
                  <p className="border-b border-t border-kvm-border bg-gray-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    All players
                  </p>
                  {widerResults!.map((p) => (
                    <PlayerRow key={p.id} player={p} onSelect={() => onSelect(p.id)} />
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
