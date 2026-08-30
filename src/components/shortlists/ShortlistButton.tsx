"use client";

import { useEffect, useRef, useState } from "react";
import { Bookmark, BookmarkCheck, ChevronDown } from "lucide-react";
import { useAppStore } from "@/lib/app-store";
import { cn } from "@/lib/utils";

/**
 * "Add to shortlist" control. Frontend-only state via `useAppStore` —
 * PostgreSQL persistence lands in Phase 3.
 */
export function ShortlistButton({ playerId }: { playerId: string }) {
  const { shortlists, addPlayerToShortlist, removePlayerFromShortlist } =
    useAppStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const memberOf = shortlists.filter((s) => s.playerIds.includes(playerId));
  const isShortlisted = memberOf.length > 0;

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        className={cn(
          "flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-xs font-semibold transition-colors",
          isShortlisted
            ? "border-kvm-red bg-kvm-red text-white"
            : "border-kvm-border bg-white text-kvm-ink hover:border-kvm-red"
        )}
      >
        {isShortlisted ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
        {isShortlisted ? `Shortlisted (${memberOf.length})` : "Add to shortlist"}
        <ChevronDown size={12} aria-hidden="true" />
      </button>

      {open ? (
        <div className="absolute right-0 z-20 mt-1 w-56 rounded-sm border border-kvm-border bg-white py-1 shadow-lg">
          {shortlists.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-400">
              No shortlists yet — create one from the Shortlists page.
            </p>
          ) : (
            shortlists.map((s) => {
              const included = s.playerIds.includes(playerId);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() =>
                    included
                      ? removePlayerFromShortlist(s.id, playerId)
                      : addPlayerToShortlist(s.id, playerId)
                  }
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm text-kvm-ink hover:bg-gray-50"
                >
                  <span>{s.name}</span>
                  {included ? (
                    <BookmarkCheck size={14} className="text-kvm-red" />
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
