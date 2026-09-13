"use client";

import { useEffect, useRef, useState } from "react";
import { ListTodo, Plus } from "lucide-react";
import {
  fetchActionItemsForPlayer,
  createActionItem,
  updateActionItem,
  setActionItemCompleted,
  deleteActionItem,
  compareActionItems,
  type ActionItem,
} from "@/lib/action-items";
import { useAsync } from "@/lib/players-data";
import { useAppStore } from "@/lib/app-store";
import { TodoItemRow } from "@/components/todos/TodoItemRow";
import { TodoFormModal, type TodoFormValues } from "@/components/todos/TodoFormModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";

/**
 * "+ To-Do" — player-profile primary action, next to the shortlist
 * button. Shows this player's own open-task count on the button itself,
 * and opens a compact panel listing every existing to-do for this
 * player (view/edit/complete/reopen/delete) plus an "Add" action —
 * never just a bare creation form, per the multiple-tasks-per-player
 * requirement.
 */
export function NextActionButton({ playerId, playerName }: { playerId: string; playerName: string }) {
  const { isPersistent } = useAppStore();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ActionItem | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const { data: items, reload } = useAsync(() => fetchActionItemsForPlayer(playerId), [playerId]);
  const openItems = (items ?? []).filter((i) => !i.completedAt).slice().sort(compareActionItems);
  const completedItems = (items ?? []).filter((i) => i.completedAt).slice().sort(compareActionItems);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function handleCreate(values: TodoFormValues) {
    await createActionItem({
      description: values.description,
      actionType: "review_player",
      priority: values.priority,
      notes: values.notes || null,
      playerId,
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

  if (!isPersistent) return null; // no honest way to persist this without a database — don't offer a control that would silently do nothing durable

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        className={cn(
          "flex items-center gap-1.5 rounded-md border border-kvm-border bg-white px-2.5 py-1.5 text-xs font-semibold text-kvm-ink hover:border-kvm-red",
          openItems.length > 0 && "border-kvm-red"
        )}
      >
        <ListTodo size={14} aria-hidden="true" />
        + To-Do
        {openItems.length > 0 ? (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-kvm-red px-1 text-[10px] font-bold text-white">{openItems.length}</span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-20 mt-1 w-[min(20rem,calc(100vw-2rem))] rounded-md border border-kvm-border bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-kvm-border px-3 py-2">
            <span className="text-xs font-bold uppercase tracking-wide text-gray-500">To-Dos for {playerName}</span>
            <button type="button" onClick={() => setCreating(true)} className="flex items-center gap-1 text-xs font-semibold text-kvm-red hover:underline">
              <Plus size={12} aria-hidden="true" />
              Add
            </button>
          </div>

          {rowError ? <p className="px-3 py-1.5 text-xs font-medium text-kvm-red">{rowError}</p> : null}

          <div className="max-h-72 overflow-y-auto">
            {openItems.length === 0 && completedItems.length === 0 ? (
              <EmptyState icon={ListTodo} title="No to-dos yet" description="Add one to track a follow-up for this player." />
            ) : (
              <ul className="divide-y divide-kvm-border">
                {[...openItems, ...completedItems].map((item) => (
                  <TodoItemRow key={item.id} item={item} onToggleComplete={handleToggleComplete} onEdit={setEditing} onDelete={handleDelete} />
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {creating ? <TodoFormModal mode="create" playerLabel={playerName} onSave={handleCreate} onClose={() => setCreating(false)} /> : null}
      {editing ? <TodoFormModal mode="edit" initial={editing} playerLabel={playerName} onSave={handleEditSave} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
