"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Trash2, Pencil, RotateCcw, X } from "lucide-react";
import type { ActionItem } from "@/lib/action-items";
import { isOverdue, isDueToday } from "@/lib/action-items";
import { formatDate, cn } from "@/lib/utils";
import type { Player } from "@/lib/players-data";

const PRIORITY_DOT: Record<ActionItem["priority"], string> = {
  high: "bg-kvm-red",
  normal: "bg-amber-400",
  low: "bg-gray-300",
};

/**
 * One to-do row — shared by the dashboard "My To-Dos" widget, the full
 * /todos page, and the player-profile "+ To-Do" panel (which passes
 * `player={null}` since the player is already implied by the page
 * itself, so the name isn't repeated).
 */
export function TodoItemRow({
  item,
  player,
  onToggleComplete,
  onEdit,
  onDelete,
}: {
  item: ActionItem;
  player?: Player | null;
  onToggleComplete: (item: ActionItem) => void;
  onEdit: (item: ActionItem) => void;
  onDelete: (item: ActionItem) => void;
}) {
  const overdue = isOverdue(item);
  const dueToday = isDueToday(item);
  const done = item.completedAt !== null;
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <li className="flex items-start gap-3 px-5 py-2.5">
      <button
        type="button"
        onClick={() => onToggleComplete(item)}
        aria-label={done ? "Reopen task" : "Mark done"}
        aria-pressed={done}
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
          done ? "border-kvm-red bg-kvm-red text-white" : "border-kvm-border text-transparent hover:border-kvm-red hover:text-kvm-red"
        )}
      >
        {done ? <Check size={11} aria-hidden="true" /> : <Check size={11} aria-hidden="true" />}
      </button>

      <div className="min-w-0 flex-1">
        <button type="button" onClick={() => onEdit(item)} className={cn("text-left text-sm hover:underline", done ? "text-gray-400 line-through" : "text-kvm-ink")}>
          {item.description}
        </button>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-400">
          <span className={cn("inline-block h-1.5 w-1.5 rounded-full", PRIORITY_DOT[item.priority])} aria-hidden="true" />
          <span className="capitalize">{item.priority}</span>
          {player ? (
            <Link href={`/player?id=${player.id}`} className="font-medium text-kvm-red hover:underline">
              {player.name}
              {player.club ? <span className="font-normal text-gray-400"> · {player.club}</span> : null}
            </Link>
          ) : null}
          {item.dueDate ? (
            <span className={cn(overdue && !done && "font-semibold text-kvm-red", dueToday && !done && "font-semibold text-amber-600")}>
              {overdue && !done ? "Overdue — " : dueToday && !done ? "Due today — " : "Due "}
              {formatDate(item.dueDate)}
            </span>
          ) : null}
        </div>
        {item.notes ? <p className="mt-1 text-xs text-gray-500">{item.notes}</p> : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {confirmingDelete ? (
          <>
            <button
              type="button"
              onClick={() => {
                setConfirmingDelete(false);
                onDelete(item);
              }}
              className="text-[11px] font-semibold text-kvm-red hover:underline"
            >
              Delete?
            </button>
            <button type="button" onClick={() => setConfirmingDelete(false)} aria-label="Cancel delete" className="text-gray-300 hover:text-kvm-ink">
              <X size={13} aria-hidden="true" />
            </button>
          </>
        ) : (
          <>
            {done ? (
              <button type="button" onClick={() => onToggleComplete(item)} aria-label="Reopen task" className="text-gray-300 hover:text-kvm-ink">
                <RotateCcw size={14} aria-hidden="true" />
              </button>
            ) : (
              <button type="button" onClick={() => onEdit(item)} aria-label="Edit task" className="text-gray-300 hover:text-kvm-ink">
                <Pencil size={14} aria-hidden="true" />
              </button>
            )}
            <button type="button" onClick={() => setConfirmingDelete(true)} aria-label="Delete task" className="text-gray-300 hover:text-kvm-red">
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </>
        )}
      </div>
    </li>
  );
}
