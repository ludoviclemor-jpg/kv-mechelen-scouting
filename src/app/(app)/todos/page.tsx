"use client";

import { useMemo, useState } from "react";
import { Plus, ListTodo } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState, ErrorState } from "@/components/ui/LoadingState";
import { TodoItemRow } from "@/components/todos/TodoItemRow";
import { TodoFormModal, type TodoFormValues } from "@/components/todos/TodoFormModal";
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
import { cn } from "@/lib/utils";

const FILTERS: { value: TodoFilter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "today", label: "Today" },
  { value: "overdue", label: "Overdue" },
  { value: "completed", label: "Completed" },
];

/** Full "My To-Dos" manager — the dashboard widget's "View all" destination. Same shared components/sorting as the widget and the player-profile panel. */
export default function TodosPage() {
  const { isPersistent } = useAppStore();
  const { data: items, loading, error, reload } = useAsync(() => fetchActionItems(), []);
  const [filter, setFilter] = useState<TodoFilter>("open");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ActionItem | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const filtered = useMemo(() => (items ? filterActionItems(items, filter).slice().sort(compareActionItems) : []), [items, filter]);
  const openCount = useMemo(() => (items ?? []).filter((i) => !i.completedAt).length, [items]);
  const overdueCount = useMemo(() => (items ?? []).filter((i) => isOverdue(i)).length, [items]);
  const todayCount = useMemo(() => filterActionItems(items ?? [], "today").length, [items]);
  const completedCount = useMemo(() => (items ?? []).filter((i) => i.completedAt !== null).length, [items]);

  const playerIds = useMemo(() => Array.from(new Set(filtered.map((i) => i.playerId).filter((id): id is string => id !== null))), [filtered]);
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

  return (
    <>
      <PageHeader title="My To-Dos" description="Personal follow-ups, private to your own account." />

      <div className="p-8">
        {!isPersistent ? (
          <div className="rounded-xl border border-kvm-border bg-white p-6 text-sm text-gray-400">
            Database not configured (see Settings) — to-dos need Postgres persistence.
          </div>
        ) : (
          <div className="rounded-xl border border-kvm-border bg-white shadow-[0_1px_2px_rgba(26,23,18,0.04),0_8px_24px_-8px_rgba(26,23,18,0.10)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-kvm-border px-5 py-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {FILTERS.map((f) => {
                  const count = f.value === "open" ? openCount : f.value === "overdue" ? overdueCount : f.value === "today" ? todayCount : completedCount;
                  return (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => setFilter(f.value)}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-xs font-semibold",
                        filter === f.value ? "bg-kvm-red text-white" : "text-gray-500 hover:bg-gray-100"
                      )}
                    >
                      {f.label} ({count})
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex items-center gap-1.5 rounded-md bg-kvm-red px-3 py-1.5 text-xs font-semibold text-white"
              >
                <Plus size={13} aria-hidden="true" />
                New to-do
              </button>
            </div>

            {rowError ? <p className="border-b border-kvm-border px-5 py-2 text-xs font-medium text-kvm-red">{rowError}</p> : null}

            {error ? (
              <ErrorState message={error.message} onRetry={reload} />
            ) : loading ? (
              <LoadingState label="Loading to-dos…" />
            ) : filtered.length === 0 ? (
              <EmptyState icon={ListTodo} title={`No ${filter} to-dos`} description="Add one, or open a player and use the + To-Do button." />
            ) : (
              <ul className="divide-y divide-kvm-border">
                {filtered.map((item) => (
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
          </div>
        )}
      </div>

      {creating ? <TodoFormModal mode="create" onSave={handleCreate} onClose={() => setCreating(false)} /> : null}
      {editing ? <TodoFormModal mode="edit" initial={editing} onSave={handleEditSave} onClose={() => setEditing(null)} /> : null}
    </>
  );
}
