"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Same sortable `<th>` markup/icons PlayerTable already used, extracted so every other table can reuse it instead of re-implementing the arrow-icon button each time. */
export function SortableHeader<K extends string>({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
}: {
  label: string;
  sortKey: K;
  activeKey: K;
  direction: "asc" | "desc";
  onSort: (key: K) => void;
}) {
  const active = sortKey === activeKey;
  const Icon = active ? (direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn("flex items-center gap-1 uppercase tracking-wide hover:text-kvm-ink", active && "text-kvm-ink")}
      >
        {label}
        <Icon size={11} aria-hidden="true" />
      </button>
    </th>
  );
}
