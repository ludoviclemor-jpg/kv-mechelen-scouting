"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div
      role="group"
      aria-label="Filters"
      className="flex flex-wrap items-center gap-2 border-b border-kvm-border bg-white px-8 py-3"
    >
      {children}
    </div>
  );
}

export function FilterSelect({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className={cn("inline-flex items-center gap-1.5 text-sm", disabled ? "text-gray-300" : "text-gray-600")}>
      <span className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn(
          "rounded-sm border border-kvm-border bg-white px-2 py-1 text-sm focus-visible:outline-none",
          disabled ? "cursor-not-allowed bg-gray-50 text-gray-300" : "text-kvm-ink"
        )}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export interface ActiveFilterChip {
  key: string;
  label: string; // e.g. "Country"
  value: string; // e.g. "Belgium"
  onClear: () => void;
}

/**
 * Shows every currently-active (non-default) filter as a removable chip,
 * with a filter count and one-click "Clear all" — used on every page with
 * more than a couple of filters, so an active filter is never invisible.
 */
export function ActiveFilterChips({ chips, onClearAll }: { chips: ActiveFilterChip[]; onClearAll: () => void }) {
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-kvm-border bg-gray-50 px-8 py-2.5">
      <span className="text-xs font-semibold text-gray-500">
        Filters ({chips.length})
      </span>
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1 rounded-sm border border-kvm-border bg-white px-2 py-1 text-xs text-kvm-ink"
        >
          <span className="text-gray-400">{chip.label}:</span>
          {chip.value}
          <button
            type="button"
            onClick={chip.onClear}
            aria-label={`Clear ${chip.label} filter`}
            className="ml-0.5 text-gray-400 hover:text-kvm-red"
          >
            <X size={12} />
          </button>
        </span>
      ))}
      <button type="button" onClick={onClearAll} className="text-xs font-semibold text-kvm-red hover:underline">
        Clear all
      </button>
    </div>
  );
}
