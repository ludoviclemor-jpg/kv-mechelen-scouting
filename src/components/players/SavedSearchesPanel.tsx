"use client";

import { useState } from "react";
import { Bookmark, Plus, Pencil, Trash2, X, Check } from "lucide-react";
import { useAsync } from "@/lib/players-data";
import { fetchSavedSearches, createSavedSearch, renameSavedSearch, deleteSavedSearch, type PlayersSearchFilters } from "@/lib/saved-searches";
import { useAppStore } from "@/lib/app-store";

/** Personal, named filter presets for the Players page — save, open, rename, delete (redesign item 6). Private per scout via RLS, same as shortlists. */
export function SavedSearchesPanel({
  currentFilters,
  onApply,
}: {
  currentFilters: PlayersSearchFilters;
  onApply: (filters: PlayersSearchFilters) => void;
}) {
  const { isPersistent } = useAppStore();
  const { data: searches, loading, reload } = useAsync(() => (isPersistent ? fetchSavedSearches() : Promise.resolve([])), [isPersistent]);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  async function handleSaveCurrent() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      await createSavedSearch(trimmed, currentFilters);
      setSaving(false);
      setNaming(false);
      setName("");
      reload();
    } catch (err) {
      setSaving(false);
      setError(err instanceof Error ? err.message : "Failed to save search — try again.");
    }
  }

  async function handleRename(id: string) {
    const trimmed = editName.trim();
    if (!trimmed) return;
    try {
      await renameSavedSearch(id, trimmed);
      setEditingId(null);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename — try again.");
    }
  }

  async function handleDelete(id: string, label: string) {
    if (!window.confirm(`Delete the saved search "${label}"?`)) return;
    try {
      await deleteSavedSearch(id);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete — try again.");
    }
  }

  if (!isPersistent) return null;

  return (
    <div>
      {error ? <p className="mb-1.5 text-xs font-medium text-kvm-red">{error}</p> : null}

      {!loading && searches && searches.length > 0 ? (
        <ul className="mb-2 space-y-0.5">
          {searches.map((s) => (
            <li key={s.id} className="flex items-center gap-1">
              {editingId === s.id ? (
                <>
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleRename(s.id)}
                    className="min-w-0 flex-1 rounded-md border border-kvm-border px-1.5 py-1 text-xs"
                  />
                  <button type="button" onClick={() => handleRename(s.id)} aria-label="Confirm rename" className="shrink-0 text-emerald-600">
                    <Check size={13} aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => setEditingId(null)} aria-label="Cancel rename" className="shrink-0 text-gray-400">
                    <X size={13} aria-hidden="true" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => onApply(s.filters)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 truncate rounded-md px-1.5 py-1 text-left text-xs text-kvm-ink hover:bg-gray-50"
                  >
                    <Bookmark size={12} className="shrink-0 text-gray-400" aria-hidden="true" />
                    <span className="truncate">{s.name}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(s.id);
                      setEditName(s.name);
                    }}
                    aria-label={`Rename ${s.name}`}
                    className="shrink-0 text-gray-300 hover:text-kvm-ink"
                  >
                    <Pencil size={12} aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => handleDelete(s.id, s.name)} aria-label={`Delete ${s.name}`} className="shrink-0 text-gray-300 hover:text-kvm-red">
                    <Trash2 size={12} aria-hidden="true" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {naming ? (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSaveCurrent()}
            placeholder="Name this search..."
            className="min-w-0 flex-1 rounded-md border border-kvm-border px-1.5 py-1 text-xs focus-visible:outline-none"
          />
          <button type="button" onClick={handleSaveCurrent} disabled={saving || !name.trim()} aria-label="Save search" className="shrink-0 text-kvm-red disabled:text-gray-300">
            <Check size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => {
              setNaming(false);
              setName("");
            }}
            aria-label="Cancel"
            className="shrink-0 text-gray-400"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setNaming(true)} className="flex items-center gap-1.5 text-xs font-semibold text-kvm-red hover:underline">
          <Plus size={13} aria-hidden="true" />
          Save current search
        </button>
      )}
    </div>
  );
}
