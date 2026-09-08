"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Plus, Trash2, ListTodo } from "lucide-react";
import { fetchActionItems, createActionItem, setActionItemCompleted, deleteActionItem, type ActionItem } from "@/lib/action-items";
import { fetchPlayersByIds, useAsync } from "@/lib/players-data";
import { useAppStore } from "@/lib/app-store";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState, SkeletonBlock } from "@/components/ui/LoadingState";
import { formatDate, cn } from "@/lib/utils";

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  return dueDate < new Date().toISOString().slice(0, 10);
}

/**
 * "Mijn volgende acties" (redesign item 8) — real, scout-owned to-dos,
 * private per scout, optionally linked to a player. Independent of every
 * other dashboard widget: its own load/error/empty state, own retry.
 */
export function NextActionsWidget() {
  const { isPersistent } = useAppStore();
  const { data: items, loading, error, reload } = useAsync(() => fetchActionItems(), []);
  const [adding, setAdding] = useState(false);
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const open = useMemo(() => (items ?? []).filter((i) => !i.completedAt), [items]);
  const playerIds = useMemo(() => Array.from(new Set(open.map((i) => i.playerId).filter((id): id is string => id !== null))), [open]);
  const { data: players } = useAsync(() => fetchPlayersByIds(playerIds), [playerIds.join(",")]);
  const playerById = useMemo(() => new Map((players ?? []).map((p) => [p.id, p])), [players]);

  async function handleAdd() {
    if (!description.trim()) return;
    setSaving(true);
    setFormError(null);
    try {
      await createActionItem({ description: description.trim(), actionType: "other", dueDate: dueDate || null });
      setSaving(false);
      setDescription("");
      setDueDate("");
      setAdding(false);
      reload();
    } catch (err) {
      setSaving(false);
      setFormError(err instanceof Error ? err.message : "Failed to save — try again.");
    }
  }

  async function handleComplete(item: ActionItem) {
    setRowError(null);
    try {
      await setActionItemCompleted(item.id, true);
      reload();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "Failed to update — try again.");
    }
  }

  async function handleDelete(item: ActionItem) {
    setRowError(null);
    try {
      await deleteActionItem(item.id);
      reload();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "Failed to delete — try again.");
    }
  }

  if (!isPersistent) {
    return (
      <div className="px-5 py-4 text-xs text-gray-400">
        Database not configured (see Settings) — next actions need Postgres persistence.
      </div>
    );
  }

  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (loading) return <SkeletonBlock rows={3} />;

  return (
    <div>
      {rowError ? <p className="border-b border-kvm-border px-5 py-2 text-xs font-medium text-kvm-red">{rowError}</p> : null}

      {open.length === 0 && !adding ? (
        <EmptyState icon={ListTodo} title="No open actions" description="Add one, or open a player and use the Next action button." />
      ) : (
        <ul className="divide-y divide-kvm-border">
          {open.map((item) => {
            const player = item.playerId ? playerById.get(item.playerId) : null;
            return (
              <li key={item.id} className="flex items-start gap-3 px-5 py-2.5">
                <button
                  type="button"
                  onClick={() => handleComplete(item)}
                  aria-label="Mark done"
                  className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-kvm-border text-transparent hover:border-kvm-red hover:text-kvm-red"
                >
                  <Check size={11} aria-hidden="true" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-kvm-ink">{item.description}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                    {player ? (
                      <Link href={`/player?id=${player.id}`} className="font-medium text-kvm-red hover:underline">
                        {player.name}
                      </Link>
                    ) : null}
                    {item.dueDate ? (
                      <span className={cn(isOverdue(item.dueDate) && "font-semibold text-kvm-red")}>
                        Due {formatDate(item.dueDate)}
                      </span>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(item)}
                  aria-label="Delete action"
                  className="shrink-0 text-gray-300 hover:text-kvm-red"
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="border-t border-kvm-border px-5 py-2.5">
        {adding ? (
          <div className="space-y-2">
            <input
              autoFocus
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="e.g. Finish the report for..."
              className="w-full rounded-md border border-kvm-border px-2.5 py-1.5 text-sm focus-visible:outline-none"
            />
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                aria-label="Due date (optional)"
                className="rounded-md border border-kvm-border px-2.5 py-1.5 text-xs focus-visible:outline-none"
              />
              <button
                type="button"
                onClick={handleAdd}
                disabled={saving || !description.trim()}
                className="rounded-md bg-kvm-red px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
              >
                {saving ? "Saving…" : "Add"}
              </button>
              <button type="button" onClick={() => setAdding(false)} disabled={saving} className="text-xs font-semibold text-gray-500">
                Cancel
              </button>
            </div>
            {formError ? <p className="text-xs font-medium text-kvm-red">{formError}</p> : null}
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="flex items-center gap-1.5 text-xs font-semibold text-kvm-red hover:underline">
            <Plus size={13} aria-hidden="true" />
            Add action
          </button>
        )}
      </div>
    </div>
  );
}
