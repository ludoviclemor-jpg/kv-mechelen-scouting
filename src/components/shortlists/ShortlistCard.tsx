"use client";

import { useState } from "react";
import { Pencil, Trash2, Check, X } from "lucide-react";
import type { Shortlist } from "@/lib/players-data";
import { cn } from "@/lib/utils";

export function ShortlistCard({
  shortlist,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  shortlist: Shortlist;
  active: boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(shortlist.name);

  function commitRename() {
    const trimmed = draftName.trim();
    if (trimmed) onRename(trimmed);
    setEditing(false);
  }

  return (
    <div
      className={cn(
        "border px-3 py-2.5 transition-colors",
        active ? "border-kvm-red bg-red-50/40" : "border-kvm-border bg-white hover:bg-gray-50"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        {editing ? (
          <div className="flex flex-1 items-center gap-1">
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setEditing(false);
              }}
              className="w-full rounded-sm border border-kvm-border px-1.5 py-0.5 text-sm"
              aria-label="Shortlist name"
            />
            <button type="button" onClick={commitRename} aria-label="Confirm rename">
              <Check size={15} className="text-emerald-600" />
            </button>
            <button type="button" onClick={() => setEditing(false)} aria-label="Cancel rename">
              <X size={15} className="text-gray-400" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onSelect}
            className="flex-1 text-left text-sm font-semibold text-kvm-ink"
          >
            {shortlist.name}
          </button>
        )}

        {!editing && (
          <div className="flex shrink-0 items-center gap-1.5 text-gray-400">
            <button
              type="button"
              onClick={() => {
                setDraftName(shortlist.name);
                setEditing(true);
              }}
              aria-label={`Rename ${shortlist.name}`}
              className="hover:text-kvm-ink"
            >
              <Pencil size={13} />
            </button>
            <button
              type="button"
              onClick={onDelete}
              aria-label={`Delete ${shortlist.name}`}
              className="hover:text-kvm-red"
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>
      <p className="mt-1 text-xs text-gray-500">{shortlist.description}</p>
      <p className="mt-1 text-[11px] font-medium text-gray-400">
        {shortlist.playerIds.length} player{shortlist.playerIds.length === 1 ? "" : "s"}
      </p>
    </div>
  );
}
