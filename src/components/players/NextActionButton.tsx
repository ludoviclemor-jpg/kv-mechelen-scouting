"use client";

import { useEffect, useRef, useState } from "react";
import { ListTodo, Loader2 } from "lucide-react";
import { createActionItem } from "@/lib/action-items";
import { useAppStore } from "@/lib/app-store";

/** Quick "add a next action for this player" popover — used from the player profile header (redesign item 9). */
export function NextActionButton({ playerId }: { playerId: string }) {
  const { isPersistent } = useAppStore();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function handleSave() {
    if (!description.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await createActionItem({ description: description.trim(), actionType: "review_player", playerId, dueDate: dueDate || null });
      setSaving(false);
      setDone(true);
      setDescription("");
      setDueDate("");
      setTimeout(() => {
        setOpen(false);
        setDone(false);
      }, 1200);
    } catch (err) {
      setSaving(false);
      setError(err instanceof Error ? err.message : "Failed to save — try again.");
    }
  }

  if (!isPersistent) return null; // no honest way to persist this without a database — don't offer a control that would silently do nothing durable

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-md border border-kvm-border bg-white px-2.5 py-1.5 text-xs font-semibold text-kvm-ink hover:border-kvm-red"
      >
        <ListTodo size={14} aria-hidden="true" />
        Next action
      </button>

      {open ? (
        <div className="absolute right-0 z-20 mt-1 w-72 rounded-md border border-kvm-border bg-white p-3 shadow-lg">
          {done ? (
            <p className="py-2 text-center text-sm font-medium text-emerald-600">Added to My Next Actions.</p>
          ) : (
            <div className="space-y-2">
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Re-watch this player's last match"
                className="w-full resize-none rounded-md border border-kvm-border px-2.5 py-1.5 text-sm focus-visible:outline-none"
              />
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                aria-label="Due date (optional)"
                className="w-full rounded-md border border-kvm-border px-2.5 py-1.5 text-sm focus-visible:outline-none"
              />
              {error ? <p className="text-xs font-medium text-kvm-red">{error}</p> : null}
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !description.trim()}
                className="flex w-full items-center justify-center gap-1.5 rounded-md bg-kvm-red px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
              >
                {saving ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : null}
                {saving ? "Saving…" : "Add action"}
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
