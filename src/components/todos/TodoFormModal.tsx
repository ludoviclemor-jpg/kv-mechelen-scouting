"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { TITLE_PRESETS, PRIORITY_LABELS, type ActionItem, type ActionPriority } from "@/lib/action-items";
import { cn } from "@/lib/utils";

export interface TodoFormValues {
  description: string;
  notes: string;
  dueDate: string; // "" = none
  priority: ActionPriority;
}

/**
 * Shared create/edit modal — used from the player-profile "+ To-Do"
 * button, the dashboard "My To-Dos" widget, and the full /todos page,
 * so the same fields/validation/quick-picks exist everywhere instead of
 * three slightly-different forms.
 */
export function TodoFormModal({
  mode,
  initial,
  playerLabel,
  onSave,
  onClose,
}: {
  mode: "create" | "edit";
  initial?: ActionItem;
  /** e.g. "Erling Haaland" — shown read-only when creating from a player profile; omitted for the dashboard/todos-page generic "New to-do" flow. */
  playerLabel?: string | null;
  onSave: (values: TodoFormValues) => Promise<void>;
  onClose: () => void;
}) {
  const [description, setDescription] = useState(initial?.description ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  const [priority, setPriority] = useState<ActionPriority>(initial?.priority ?? "normal");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const trimmed = description.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({ description: trimmed, notes: notes.trim(), dueDate, priority });
    } catch (err) {
      setSaving(false);
      setError(err instanceof Error ? err.message : "Failed to save — try again.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-sm rounded-xl bg-white p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-kvm-ink">{mode === "create" ? "New To-Do" : "Edit To-Do"}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-kvm-ink">
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-3">
          {playerLabel ? (
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Player</label>
              <p className="text-sm font-medium text-kvm-ink">{playerLabel}</p>
            </div>
          ) : null}

          <div>
            <label htmlFor="todo-title" className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Task title *
            </label>
            <input
              id="todo-title"
              autoFocus
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Re-watch this player's last match"
              className="mt-1 w-full rounded-md border border-kvm-border px-2.5 py-1.5 text-sm focus-visible:outline-none"
            />
            {mode === "create" ? (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {TITLE_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setDescription(preset)}
                    className="rounded-full border border-kvm-border px-2 py-0.5 text-[11px] text-gray-600 hover:border-kvm-red hover:text-kvm-red"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div>
            <label htmlFor="todo-notes" className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Notes (optional)
            </label>
            <textarea
              id="todo-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional details…"
              className="mt-1 w-full resize-none rounded-md border border-kvm-border px-2.5 py-1.5 text-sm focus-visible:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="todo-due" className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Deadline (optional)
              </label>
              <input
                id="todo-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1 w-full rounded-md border border-kvm-border px-2.5 py-1.5 text-sm focus-visible:outline-none"
              />
            </div>
            <div>
              <label htmlFor="todo-priority" className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Priority
              </label>
              <select
                id="todo-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as ActionPriority)}
                className="mt-1 w-full rounded-md border border-kvm-border bg-white px-2.5 py-1.5 text-sm focus-visible:outline-none"
              >
                {(Object.keys(PRIORITY_LABELS) as ActionPriority[]).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error ? <p className="text-xs font-medium text-kvm-red">{error}</p> : null}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !description.trim()}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-md bg-kvm-red px-3 py-1.5 text-xs font-semibold text-white",
                (saving || !description.trim()) && "cursor-not-allowed bg-gray-200 text-gray-400"
              )}
            >
              {saving ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : null}
              {saving ? "Saving…" : mode === "create" ? "Add To-Do" : "Save changes"}
            </button>
            <button type="button" onClick={onClose} disabled={saving} className="rounded-md border border-kvm-border px-3 py-1.5 text-xs font-semibold text-gray-600">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
