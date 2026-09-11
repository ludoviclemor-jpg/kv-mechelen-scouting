"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { SCOUTING_STATUSES, STATUS_LABELS, type ScoutingStatus } from "@/lib/players-data";
import { cn } from "@/lib/utils";

/**
 * Colour progression across the 10-stage pipeline (2026-09-11 expansion):
 * neutral while still data-only, blue once a human has looked at data,
 * amber while actively being watched, indigo once listed, red for the
 * "this matters now" stages, grey+strikethrough / emerald for the two
 * terminal exits. Colour is never the only signal — STATUS_LABELS' text
 * is always rendered alongside it.
 */
const STATUS_STYLES: Record<ScoutingStatus, string> = {
  unwatched: "bg-gray-100 text-gray-500 ring-1 ring-inset ring-gray-300",
  data_identified: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-300",
  video: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-300",
  live: "bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-400",
  shortlist: "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-300",
  priority: "bg-kvm-red text-white ring-1 ring-inset ring-kvm-red-dark",
  discuss: "bg-purple-50 text-purple-700 ring-1 ring-inset ring-purple-300",
  target: "bg-kvm-yellow text-kvm-ink ring-1 ring-inset ring-kvm-yellow-dark",
  rejected: "bg-gray-100 text-gray-400 ring-1 ring-inset ring-gray-300 line-through",
  signed: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-300",
};

export function StatusBadge({ status }: { status: ScoutingStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
        STATUS_STYLES[status]
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

/**
 * Replaces the previous plain `<select>` — changing recruitment stage is
 * a real decision worth an optional reason, so this opens a small panel
 * with the stage list plus an optional note field instead of committing
 * immediately on selection. `onChange` resolves once the write is
 * confirmed (or rejected) by app-store — see PlayerHeader for how the
 * result is surfaced.
 */
export function StatusChangeMenu({
  status,
  onChange,
  disabled = false,
}: {
  status: ScoutingStatus;
  onChange: (status: ScoutingStatus, note: string) => void | Promise<void>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<ScoutingStatus | null>(null);
  const [note, setNote] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setPending(null);
        setNote("");
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setPending(null);
        setNote("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  async function confirm() {
    if (!pending) return;
    await onChange(pending, note.trim());
    setOpen(false);
    setPending(null);
    setNote("");
  }

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 disabled:opacity-60"
      >
        <StatusBadge status={status} />
        <ChevronDown size={13} className="text-gray-400" aria-hidden="true" />
      </button>

      {open ? (
        <div role="menu" className="absolute left-0 z-30 mt-1 w-64 rounded-md border border-kvm-border bg-white py-1 shadow-[0_1px_2px_rgba(26,23,18,0.04),0_8px_24px_-8px_rgba(26,23,18,0.10)]">
          {!pending ? (
            SCOUTING_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                role="menuitem"
                onClick={() => setPending(s)}
                className={cn(
                  "flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-gray-50",
                  s === status ? "font-semibold text-kvm-ink" : "text-gray-600"
                )}
              >
                {STATUS_LABELS[s]}
                {s === status ? <Check size={14} className="text-kvm-red" aria-hidden="true" /> : null}
              </button>
            ))
          ) : (
            <div className="p-3">
              <div className="mb-2 text-xs text-gray-500">
                Change status to <span className="font-semibold text-kvm-ink">{STATUS_LABELS[pending]}</span>
              </div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400" htmlFor="status-change-note">
                Note (optional)
              </label>
              <textarea
                id="status-change-note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Why the change?"
                className="w-full resize-none rounded-md border border-kvm-border px-2 py-1.5 text-sm text-kvm-ink focus-visible:outline-none"
              />
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPending(null);
                    setNote("");
                  }}
                  className="rounded-md px-2.5 py-1 text-xs font-medium text-gray-500 hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={confirm}
                  className="rounded-md bg-kvm-red px-2.5 py-1 text-xs font-semibold text-white"
                >
                  Update status
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
