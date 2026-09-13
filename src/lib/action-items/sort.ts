import type { ActionItem } from "./types";
import { PRIORITY_RANK } from "./types";

/** Calendar-date comparison, deliberately not a `Date` object — a deadline with no time component is a calendar date in the user's own timezone (see spec: never let UTC conversion shift it by a day), and `due_date` is already stored/read as a plain `YYYY-MM-DD` string. */
export function todayISODate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isOverdue(item: Pick<ActionItem, "dueDate" | "completedAt">): boolean {
  if (!item.dueDate || item.completedAt) return false;
  return item.dueDate < todayISODate();
}

export function isDueToday(item: Pick<ActionItem, "dueDate">): boolean {
  return item.dueDate === todayISODate();
}

/**
 * Standard ordering for open to-dos everywhere they're listed (widget +
 * full page): overdue first, then due today, then the rest by soonest
 * deadline, then no-deadline items last — priority breaks ties within
 * the same deadline bucket. A pure comparator (no mutation), safe to
 * reuse directly in `.sort()` or `.toSorted()`.
 */
export function compareActionItems(a: ActionItem, b: ActionItem): number {
  const bucket = (item: ActionItem) => (isOverdue(item) ? 0 : isDueToday(item) ? 1 : item.dueDate ? 2 : 3);
  const bucketDiff = bucket(a) - bucket(b);
  if (bucketDiff !== 0) return bucketDiff;
  if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
}

export type TodoFilter = "open" | "today" | "overdue" | "completed";

export function filterActionItems(items: ActionItem[], filter: TodoFilter): ActionItem[] {
  switch (filter) {
    case "completed":
      return items.filter((i) => i.completedAt !== null);
    case "overdue":
      return items.filter((i) => isOverdue(i));
    case "today":
      return items.filter((i) => !i.completedAt && isDueToday(i));
    case "open":
    default:
      return items.filter((i) => i.completedAt === null);
  }
}
