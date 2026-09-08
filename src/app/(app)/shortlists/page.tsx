"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, X, ArrowUpDown } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { ShortlistCard } from "@/components/shortlists/ShortlistCard";
import { SearchBar } from "@/components/ui/SearchBar";
import { AgeFilter } from "@/components/ui/AgeFilter";
import { EmptyState } from "@/components/ui/EmptyState";
import { RatingBadge } from "@/components/ui/RatingBadge";
import { LoadingState, ErrorState } from "@/components/ui/LoadingState";
import { useAppStore } from "@/lib/app-store";
import { fetchPlayersByIds, searchPlayers, useAsync, computeMatchStats, positionLabel } from "@/lib/players-data";
import { matchesAgeRange, type AgeRange } from "@/lib/agePresets";
import { calculateAge } from "@/lib/utils";
import { ListChecks } from "lucide-react";

type SortOption = "name" | "rating" | "position";
const ALL_AGES: AgeRange = { min: null, max: null };

/** 300ms — matches the Players page search debounce. */
function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export default function ShortlistsPage() {
  const {
    shortlists,
    createShortlist,
    renameShortlist,
    deleteShortlist,
    removePlayerFromShortlist,
    addPlayerToShortlist,
  } = useAppStore();

  const [selectedId, setSelectedId] = useState<string | null>(
    shortlists[0]?.id ?? null
  );
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("name");
  const [ageRange, setAgeRange] = useState<AgeRange>(ALL_AGES);

  const selected = shortlists.find((s) => s.id === selectedId) ?? shortlists[0] ?? null;

  // Bounded by shortlist membership (a handful of players per list), never
  // the full catalog — same reasoning as the Reports page.
  const { data: rawSelectedPlayers, loading: playersLoading, error: playersError } = useAsync(
    () => (selected ? fetchPlayersByIds(selected.playerIds) : Promise.resolve([])),
    [selected?.id, selected?.playerIds.join(",")]
  );

  const selectedPlayers = useMemo(() => {
    const players = (rawSelectedPlayers ?? []).filter((p) => matchesAgeRange(calculateAge(p.dateOfBirth), ageRange));
    return [...players].sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "position") return (a.position ?? "").localeCompare(b.position ?? "");
      const ratingA = computeMatchStats(a.matches).average ?? 0;
      const ratingB = computeMatchStats(b.matches).average ?? 0;
      return ratingB - ratingA;
    });
  }, [rawSelectedPlayers, sortBy, ageRange]);

  const debouncedAddQuery = useDebounced(addQuery);
  const { data: addCandidates } = useAsync(
    () =>
      selected && debouncedAddQuery.trim()
        ? searchPlayers(debouncedAddQuery, { excludeIds: selected.playerIds, limit: 6 })
        : Promise.resolve([]),
    [selected?.id, debouncedAddQuery]
  );

  async function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    setCreateError(null);
    const result = await createShortlist(trimmed);
    setCreating(false);
    if (result.ok) {
      setNewName(""); // only clear the input once the shortlist is actually confirmed created
    } else {
      setCreateError(result.error ?? "Failed to create shortlist — try again.");
    }
  }

  async function handleRename(id: string, name: string) {
    setListError(null);
    const result = await renameShortlist(id, name);
    if (!result.ok) setListError(result.error ?? "Failed to rename shortlist — try again.");
  }

  async function handleDelete(id: string) {
    setListError(null);
    const result = await deleteShortlist(id);
    if (result.ok) {
      if (selectedId === id) setSelectedId(null);
    } else {
      setListError(result.error ?? "Failed to delete shortlist — try again.");
    }
  }

  async function handleAddCandidate(playerId: string) {
    if (!selected) return;
    setAddError(null);
    const result = await addPlayerToShortlist(selected.id, playerId);
    if (result.ok) {
      setAddQuery(""); // only clear the search once the player is actually confirmed added
    } else {
      setAddError(result.error ?? "Failed to add player — try again.");
    }
  }

  async function handleRemovePlayer(playerId: string) {
    if (!selected) return;
    setListError(null);
    const result = await removePlayerFromShortlist(selected.id, playerId);
    if (!result.ok) setListError(result.error ?? "Failed to remove player — try again.");
  }

  return (
    <>
      <PageHeader
        title="Shortlists"
        description="Build and manage recruitment shortlists."
      />

      <div className="flex gap-6 p-8">
        <aside className="w-72 shrink-0 space-y-3">
          <div className="flex gap-1.5">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="New shortlist name..."
              aria-label="New shortlist name"
              className="w-full rounded-md border border-kvm-border bg-white px-2.5 py-1.5 text-sm focus-visible:outline-none"
            />
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              aria-label="Create shortlist"
              className="flex shrink-0 items-center justify-center rounded-md bg-kvm-red px-2.5 text-white disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
            >
              <Plus size={16} />
            </button>
          </div>
          {createError ? <p className="text-xs font-medium text-kvm-red">{createError}</p> : null}

          <div className="space-y-2">
            {listError ? <p className="text-xs font-medium text-kvm-red">{listError}</p> : null}
            {shortlists.map((s) => (
              <ShortlistCard
                key={s.id}
                shortlist={s}
                active={s.id === selected?.id}
                onSelect={() => setSelectedId(s.id)}
                onRename={(name) => handleRename(s.id, name)}
                onDelete={() => handleDelete(s.id)}
              />
            ))}
          </div>
        </aside>

        <section className="min-w-0 flex-1 rounded-xl border border-kvm-border bg-white shadow-[0_1px_2px_rgba(26,23,18,0.04),0_8px_24px_-8px_rgba(26,23,18,0.10)]">
          {!selected ? (
            <EmptyState
              icon={ListChecks}
              title="No shortlist selected"
              description="Create a shortlist to start building your recruitment list."
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-kvm-border px-5 py-3">
                <div>
                  <h2 className="text-sm font-bold text-kvm-ink">{selected.name}</h2>
                  <p className="text-xs text-gray-500">{selected.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <AgeFilter range={ageRange} onChange={setAgeRange} />
                  <label className="flex items-center gap-1.5 text-xs text-gray-500">
                    <ArrowUpDown size={13} aria-hidden="true" />
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as SortOption)}
                      className="rounded-md border border-kvm-border bg-white px-2 py-1 text-xs"
                    >
                      <option value="name">Sort: Name</option>
                      <option value="rating">Sort: Last 5 average</option>
                      <option value="position">Sort: Position</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="border-b border-kvm-border px-5 py-3">
                <SearchBar
                  value={addQuery}
                  onChange={setAddQuery}
                  placeholder="Add a player to this shortlist..."
                />
                {(addCandidates?.length ?? 0) > 0 ? (
                  <div className="mt-2 divide-y divide-kvm-border rounded-md border border-kvm-border">
                    {addCandidates!.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleAddCandidate(p.id)}
                        className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-gray-50"
                      >
                        <span>
                          {p.name} <span className="text-gray-400">· {p.club}</span>
                        </span>
                        <Plus size={14} className="text-kvm-red" />
                      </button>
                    ))}
                  </div>
                ) : null}
                {addError ? <p className="mt-1.5 text-xs font-medium text-kvm-red">{addError}</p> : null}
              </div>

              {playersError ? (
                <ErrorState message={playersError.message} />
              ) : playersLoading ? (
                <LoadingState label="Loading players…" />
              ) : selectedPlayers.length === 0 ? (
                <EmptyState
                  icon={ListChecks}
                  title="No players in this shortlist yet"
                  description="Use the search box above to add players."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Player</th>
                        <th>Position</th>
                        <th>Club</th>
                        <th>League</th>
                        <th>Last 5 avg</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {selectedPlayers.map((p) => {
                        const stats = computeMatchStats(p.matches);
                        return (
                          <tr key={p.id}>
                            <td>
                              <Link
                                href={`/player?id=${p.id}`}
                                className="font-semibold text-kvm-ink hover:text-kvm-red hover:underline"
                              >
                                {p.name}
                              </Link>
                            </td>
                            <td>{positionLabel(p.position)}</td>
                            <td>{p.club}</td>
                            <td className="text-gray-500">{p.league}</td>
                            <td>
                              <RatingBadge rating={stats.average} size="sm" />
                            </td>
                            <td>
                              <button
                                type="button"
                                onClick={() => handleRemovePlayer(p.id)}
                                aria-label={`Remove ${p.name} from ${selected.name}`}
                                className="text-gray-400 hover:text-kvm-red"
                              >
                                <X size={15} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}
