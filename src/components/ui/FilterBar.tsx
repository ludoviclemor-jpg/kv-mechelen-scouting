"use client";

import { useState, type ReactNode } from "react";
import { X, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Desktop: the same inline row of filter controls as always (`lg:flex`).
 * Below `lg`, that row is hidden and replaced by a "Filters (N)" button
 * that opens the same controls in a slide-up drawer instead — a page's
 * worth of dropdowns doesn't fit a phone screen well. `children` renders
 * twice in the DOM (once per layout) since both need the exact same
 * controlled inputs; only one copy is ever visible/interactive at a
 * given screen width (the other is `display: none`), so this doesn't
 * cause any state-sync issue in practice.
 */
export function FilterBar({ children, activeCount = 0 }: { children: ReactNode; activeCount?: number }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between border-b border-kvm-border bg-white px-8 py-2.5 lg:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="flex items-center gap-1.5 rounded-sm border border-kvm-border px-2.5 py-1.5 text-sm font-medium text-kvm-ink"
        >
          <SlidersHorizontal size={14} aria-hidden="true" />
          Filters{activeCount > 0 ? ` (${activeCount})` : ""}
        </button>
      </div>

      <div
        role="group"
        aria-label="Filters"
        className="hidden flex-wrap items-center gap-2 border-b border-kvm-border bg-white px-8 py-3 lg:flex"
      >
        {children}
      </div>

      {drawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Close filters" onClick={() => setDrawerOpen(false)} className="absolute inset-0 bg-black/30" />
          <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-lg border-t border-kvm-border bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-kvm-border px-5 py-3">
              <h2 className="text-sm font-bold text-kvm-ink">Filters</h2>
              <button type="button" onClick={() => setDrawerOpen(false)} aria-label="Close" className="text-gray-400 hover:text-kvm-ink">
                <X size={18} />
              </button>
            </div>
            <div className="flex flex-col gap-3 p-5">{children}</div>
            <div className="border-t border-kvm-border p-4">
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="w-full rounded-sm bg-kvm-red py-2 text-sm font-semibold text-white"
              >
                Show results
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function FilterSelect({
  label,
  value,
  options,
  onChange,
  disabled = false,
  stacked = false,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Label above a full-width select, for FilterSidebar — vs. the default inline "Label [select]" used in a horizontal FilterBar row. */
  stacked?: boolean;
}) {
  return (
    <label
      className={cn(
        stacked ? "flex flex-col gap-1 text-xs" : "inline-flex items-center gap-1.5 text-sm",
        disabled ? "text-gray-300" : "text-gray-600"
      )}
    >
      {label ? (
        <span className={cn("font-medium uppercase tracking-wide text-gray-400", stacked ? "text-[10px]" : "text-xs")}>{label}</span>
      ) : null}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn(
          "rounded-sm border border-kvm-border bg-white text-sm focus-visible:outline-none",
          stacked ? "w-full px-2 py-1.5 text-xs" : "px-2 py-1",
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
