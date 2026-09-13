import { describe, it, expect } from "vitest";
import { isOverdue, isDueToday, compareActionItems, filterActionItems, todayISODate } from "../sort";
import type { ActionItem } from "../types";

function item(overrides: Partial<ActionItem> = {}): ActionItem {
  return {
    id: "1",
    description: "Test task",
    actionType: "other",
    priority: "normal",
    notes: null,
    playerId: null,
    dueDate: null,
    completedAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function daysFromToday(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

describe("isOverdue / isDueToday", () => {
  it("a past due date on an open task is overdue", () => {
    expect(isOverdue(item({ dueDate: daysFromToday(-1) }))).toBe(true);
  });

  it("a completed task is never overdue, even with a past deadline", () => {
    expect(isOverdue(item({ dueDate: daysFromToday(-1), completedAt: "2026-01-01T00:00:00Z" }))).toBe(false);
  });

  it("no deadline is never overdue", () => {
    expect(isOverdue(item({ dueDate: null }))).toBe(false);
  });

  it("today's date is due-today, not overdue", () => {
    const today = item({ dueDate: todayISODate() });
    expect(isDueToday(today)).toBe(true);
    expect(isOverdue(today)).toBe(false);
  });

  it("a future deadline is neither overdue nor due today", () => {
    const future = item({ dueDate: daysFromToday(3) });
    expect(isOverdue(future)).toBe(false);
    expect(isDueToday(future)).toBe(false);
  });
});

describe("compareActionItems", () => {
  it("orders overdue before due-today before future before no-deadline", () => {
    const overdue = item({ id: "overdue", dueDate: daysFromToday(-2) });
    const today = item({ id: "today", dueDate: daysFromToday(0) });
    const future = item({ id: "future", dueDate: daysFromToday(5) });
    const none = item({ id: "none", dueDate: null });
    const sorted = [none, future, today, overdue].sort(compareActionItems);
    expect(sorted.map((i) => i.id)).toEqual(["overdue", "today", "future", "none"]);
  });

  it("within the same deadline, sorts high priority before normal before low", () => {
    const high = item({ id: "high", dueDate: daysFromToday(2), priority: "high" });
    const normal = item({ id: "normal", dueDate: daysFromToday(2), priority: "normal" });
    const low = item({ id: "low", dueDate: daysFromToday(2), priority: "low" });
    const sorted = [low, normal, high].sort(compareActionItems);
    expect(sorted.map((i) => i.id)).toEqual(["high", "normal", "low"]);
  });

  it("orders two future deadlines by soonest first", () => {
    const soon = item({ id: "soon", dueDate: daysFromToday(1) });
    const later = item({ id: "later", dueDate: daysFromToday(10) });
    const sorted = [later, soon].sort(compareActionItems);
    expect(sorted.map((i) => i.id)).toEqual(["soon", "later"]);
  });
});

describe("filterActionItems", () => {
  const items = [
    item({ id: "open-no-date" }),
    item({ id: "overdue", dueDate: daysFromToday(-1) }),
    item({ id: "today", dueDate: daysFromToday(0) }),
    item({ id: "future", dueDate: daysFromToday(5) }),
    item({ id: "done", completedAt: "2026-01-01T00:00:00Z" }),
  ];

  it("'open' excludes completed tasks", () => {
    const result = filterActionItems(items, "open");
    expect(result.map((i) => i.id).sort()).toEqual(["future", "open-no-date", "overdue", "today"]);
  });

  it("'completed' only returns completed tasks", () => {
    expect(filterActionItems(items, "completed").map((i) => i.id)).toEqual(["done"]);
  });

  it("'overdue' only returns open, past-due tasks", () => {
    expect(filterActionItems(items, "overdue").map((i) => i.id)).toEqual(["overdue"]);
  });

  it("'today' only returns open tasks due today", () => {
    expect(filterActionItems(items, "today").map((i) => i.id)).toEqual(["today"]);
  });
});
