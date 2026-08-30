"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, X, ArrowUpDown } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { ShortlistCard } from "@/components/shortlists/ShortlistCard";
import { SearchBar } from "@/components/ui/SearchBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { RatingBadge } from "@/components/ui/RatingBadge";
import { useAppStore } from "@/lib/app-store";
import { getAllPlayers, computeMatchStats, positionLabel } from "@/lib/players-data";
import { ListChecks } from "lucide-react";

const ALL_PLAYERS = getAllPlayers();
const PLAYERS_BY_ID = new Map(ALL_PLAYERS.map((p) => [p.id, p]));

type SortOption = "name" | "rating" | "position";

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
  const [addQuery, setAddQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("name");

  const selected = shortlists.find((s) => s.id === selectedId) ?? shortlists[0] ?? null;

  const selectedPlayers = useMemo(() => {
    if (!selected) return [];
    const players = selected.playerIds
      .map((id) => PLAYERS_BY_ID.get(id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p));

    return [...players].sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "position") return (a.position ?? "").localeCompare(b.position ?? "");
      const ratingA = computeMatchStats(a.matches).average ?? 0;
      const ratingB = computeMatchStats(b.matches).average ?? 0;
      return ratingB - ratingA;
    });
  }, [selected, sortBy]);

  const addCandidates = useMemo(() => {
    if (!selected) return [];
    const query = addQuery.trim().toLowerCase();
    return ALL_PLAYERS.filter((p) => {
      if (selected.playerIds.includes(p.id)) return false;
      if (!query) return false;
      return `${p.name} ${p.club}`.toLowerCase().includes(query);
    }).slice(0, 6);
  }, [selected, addQuery]);

  function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    createShortlist(trimmed);
    setNewName("");
  }

  return (
    <>
      <PageHeader
        title="Shortlists"
        description="Build and manage recruitment shortlists. Persisted to PostgreSQL in Phase 3 — for now, changes last for this session."
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
              className="w-full rounded-sm border border-kvm-border bg-white px-2.5 py-1.5 text-sm focus-visible:outline-none"
            />
            <button
              type="button"
              onClick={handleCreate}
              aria-label="Create shortlist"
              className="flex shrink-0 items-center justify-center rounded-sm bg-kvm-red px-2.5 text-white"
            >
              <Plus size={16} />
            </button>
          </div>

          <div className="space-y-2">
            {shortlists.map((s) => (
              <ShortlistCard
                key={s.id}
                shortlist={s}
                active={s.id === selected?.id}
                onSelect={() => setSelectedId(s.id)}
                onRename={(name) => renameShortlist(s.id, name)}
                onDelete={() => {
                  deleteShortlist(s.id);
                  if (selectedId === s.id) setSelectedId(null);
                }}
              />
            ))}
          </div>
        </aside>

        <section className="min-w-0 flex-1 border border-kvm-border bg-white">
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
                <label className="flex items-center gap-1.5 text-xs text-gray-500">
                  <ArrowUpDown size={13} aria-hidden="true" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    className="rounded-sm border border-kvm-border bg-white px-2 py-1 text-xs"
                  >
                    <option value="name">Sort: Name</option>
                    <option value="rating">Sort: Last 5 average</option>
                    <option value="position">Sort: Position</option>
                  </select>
                </label>
              </div>

              <div className="border-b border-kvm-border px-5 py-3">
                <SearchBar
                  value={addQuery}
                  onChange={setAddQuery}
                  placeholder="Add a player to this shortlist..."
                />
                {addCandidates.length > 0 ? (
                  <div className="mt-2 divide-y divide-kvm-border rounded-sm border border-kvm-border">
                    {addCandidates.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          addPlayerToShortlist(selected.id, p.id);
                          setAddQuery("");
                        }}
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
              </div>

              {selectedPlayers.length === 0 ? (
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
                                href={`/players/${p.id}`}
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
                                onClick={() => removePlayerFromShortlist(selected.id, p.id)}
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
