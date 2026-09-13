"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, ListTodo } from "lucide-react";
import {
  fetchActionItems,
  createActionItem,
  updateActionItem,
  setActionItemCompleted,
  deleteActionItem,
  compareActionItems,
  filterActionItems,
  isOverdue,
  type ActionItem,
  type TodoFilter,
} from "@/lib/action-items";
import { fetchPlayersByIds, useAsync } from "@/lib/players-data";
import { useAppStore } from "@/lib/app-store";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState, SkeletonBlock } from "@/components/ui/LoadingState";
import { TodoItemRow } from "@/components/todos/TodoItemRow";
import { TodoFormModal, type TodoFormValues } from "@/components/todos/TodoFormModal";
import { cn } from "@/lib/utils";

const MAX_SHOWN = 6;
const FILTERS: { value: TodoFilter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "today", label: "Today" },
  { value: "overdue", label: "Overdue" },
  { value: "completed", label: "Completed" },
];

/**
 * "My To-Dos" (2026-09-11 expansion of the earlier "My Next Actions") —
 * real, scout-owned to-dos, private per scout, optionally linked to a
 * player. Independent of every other dashboard widget: its own load/
 * error/empty state, own retry. Shares TodoItemRow/TodoFormModal with
 * the player-profile panel and the full /todos page so behavior stays
 * identical everywhere.
 */
export function NextActionsWidget() {
  const { isPersistent } = useAppStore();
  const { data: items, loading, error, reload } = useAsync(() => fetchActionItems(), []);
  const [filter, setFilter] = useState<TodoFilter>("open");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ActionItem | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const filtered = useMemo(() => (items ? filterActionItems(items, filter).slice().sort(compareActionItems) : []), [items, filter]);
  const shown = filtered.slice(0, MAX_SHOWN);
  const openCount = useMemo(() => (items ?? []).filter((i) => !i.completedAt).length, [items]);
  const overdueCount = useMemo(() => (items ?? []).filter((i) => isOverdue(i)).length, [items]);

  const playerIds = useMemo(() => Array.from(new Set(shown.map((i) => i.playerId).filter((id): id is string => id !== null))), [shown]);
  const { data: players } = useAsync(() => fetchPlayersByIds(playerIds), [playerIds.join(",")]);
  const playerById = useMemo(() => new Map((players ?? []).map((p) => [p.id, p])), [players]);

  async function handleCreate(values: TodoFormValues) {
    await createActionItem({
      description: values.description,
      actionType: "other",
      priority: values.priority,
      notes: values.notes || null,
      dueDate: values.dueDate || null,
    });
    setCreating(false);
    reload();
  }

  async function handleEditSave(values: TodoFormValues) {
    if (!editing) return;
    await updateActionItem(editing.id, { description: values.description, priority: values.priority, notes: values.notes || null, dueDate: values.dueDate || null });
    setEditing(null);
    reload();
  }

  async function handleToggleComplete(item: ActionItem) {
    setRowError(null);
    try {
      await setActionItemCompleted(item.id, item.completedAt === null);
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
    return <div className="px-5 py-4 text-xs text-gray-400">Database not configured (see Settings) — to-dos need Postgres persistence.</div>;
  }

  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (loading) return <SkeletonBlock rows={3} />;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-kvm-border px-5 py-2">
        <div className="flex flex-wrap items-center gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                filter === f.value ? "bg-kvm-red text-white" : "text-gray-500 hover:bg-gray-100"
              )}
            >
              {f.label}
              {f.value === "open" && openCount > 0 ? ` (${openCount})` : null}
              {f.value === "overdue" && overdueCount > 0 ? ` (${overdueCount})` : null}
            </button>
          ))}
        </div>
        <Link href="/todos" className="text-xs font-semibold text-kvm-red hover:underline">
          View all
        </Link>
      </div>

      {rowError ? <p className="border-b border-kvm-border px-5 py-2 text-xs font-medium text-kvm-red">{rowError}</p> : null}

      {filtered.length === 0 ? (
        <EmptyState icon={ListTodo} title={filter === "open" ? "No open to-dos" : `No ${filter} to-dos`} description="Add one, or open a player and use the + To-Do button." />
      ) : (
        <ul className="divide-y divide-kvm-border">
          {shown.map((item) => (
            <TodoItemRow
              key={item.id}
              item={item}
              player={item.playerId ? (playerById.get(item.playerId) ?? null) : null}
              onToggleComplete={handleToggleComplete}
              onEdit={setEditing}
              onDelete={handleDelete}
            />
          ))}
        </ul>
      )}

      {filtered.length > MAX_SHOWN ? (
        <div className="border-t border-kvm-border px-5 py-2 text-center">
          <Link href="/todos" className="text-xs font-semibold text-kvm-red hover:underline">
            View all {filtered.length} {filter} to-dos
          </Link>
        </div>
      ) : null}

      <div className="border-t border-kvm-border px-5 py-2.5">
        <button type="button" onClick={() => setCreating(true)} className="flex items-center gap-1.5 text-xs font-semibold text-kvm-red hover:underline">
          <Plus size={13} aria-hidden="true" />
          Add to-do
        </button>
      </div>

      {creating ? <TodoFormModal mode="create" onSave={handleCreate} onClose={() => setCreating(false)} /> : null}
      {editing ? <TodoFormModal mode="edit" initial={editing} onSave={handleEditSave} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
