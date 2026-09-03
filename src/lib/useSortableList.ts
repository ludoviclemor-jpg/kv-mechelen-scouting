"use client";

import { useMemo, useState } from "react";

/**
 * Shared client-side column-sort state for the several dashboard tables
 * that fetch a small, already-bounded list in full (Contract Watch, Loan
 * Watch, Market Value Movers, African Debutants, Injury Tracker) — same
 * click-to-sort/click-again-to-reverse convention PlayerTable already
 * established for the server-paginated Players list, just applied
 * client-side here since these lists are already fully in memory.
 */
export function useSortableList<T, K extends string>(
  items: T[],
  comparators: Record<K, (a: T, b: T) => number>,
  defaultKey: K,
  defaultDirection: "asc" | "desc" = "asc"
) {
  const [sortKey, setSortKey] = useState<K>(defaultKey);
  const [direction, setDirection] = useState<"asc" | "desc">(defaultDirection);

  function onSort(key: K) {
    if (key === sortKey) {
      setDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setDirection("asc");
    }
  }

  const sorted = useMemo(() => {
    const cmp = comparators[sortKey];
    const result = [...items].sort(cmp);
    if (direction === "desc") result.reverse();
    return result;
  }, [items, comparators, sortKey, direction]);

  return { sorted, sortKey, direction, onSort };
}
