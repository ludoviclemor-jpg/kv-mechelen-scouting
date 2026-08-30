"use client";

import { STATUS_LABELS, type ScoutingStatus } from "@/lib/players-data";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<ScoutingStatus, string> = {
  not_assessed: "bg-gray-100 text-gray-500 ring-1 ring-inset ring-gray-300",
  monitoring: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-300",
  interested: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-300",
  priority: "bg-kvm-red text-white ring-1 ring-inset ring-kvm-red-dark",
  rejected: "bg-gray-100 text-gray-400 ring-1 ring-inset ring-gray-300 line-through",
};

export function StatusBadge({ status }: { status: ScoutingStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
        STATUS_STYLES[status]
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export function StatusSelect({
  status,
  onChange,
}: {
  status: ScoutingStatus;
  onChange: (status: ScoutingStatus) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className="sr-only">Change scouting status</span>
      <select
        value={status}
        onChange={(e) => onChange(e.target.value as ScoutingStatus)}
        className="rounded-sm border border-kvm-border bg-white px-2.5 py-1.5 text-sm font-medium text-kvm-ink focus-visible:outline-none"
      >
        {Object.entries(STATUS_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
