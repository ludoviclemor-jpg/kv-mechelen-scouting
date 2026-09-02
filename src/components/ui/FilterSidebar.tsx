"use client";

import { type ReactNode, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";

/**
 * Left-side filter column for dense, scouting-software-style list pages
 * (Players, Reports) — ~224px wide, white, border-right, filters stacked
 * vertically (see FilterSelect's `stacked` prop / AgeRangeSlider). Below
 * `lg`, collapses to a "Filters" button that opens the same controls in
 * a slide-over drawer — same collapse pattern FilterBar already uses,
 * just a side panel instead of a horizontal row.
 */
export function FilterSidebar({
  children,
  activeCount = 0,
  onClearAll,
}: {
  children: ReactNode;
  activeCount?: number;
  onClearAll?: () => void;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between border-b border-kvm-border bg-white px-4 py-2.5 lg:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="flex items-center gap-1.5 rounded-sm border border-kvm-border px-2.5 py-1.5 text-sm font-medium text-kvm-ink"
        >
          <SlidersHorizontal size={14} aria-hidden="true" />
          Filters{activeCount > 0 ? ` (${activeCount})` : ""}
        </button>
      </div>

      <aside className="hidden w-56 shrink-0 border-r border-kvm-border bg-white lg:block">
        <div className="sticky top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto">
          <div className="flex items-center justify-between border-b border-kvm-border px-4 py-3">
            <h2 className="text-xs font-bold uppercase tracking-wide text-kvm-ink">Filters</h2>
            {onClearAll && activeCount > 0 ? (
              <button type="button" onClick={onClearAll} className="text-[11px] font-semibold text-kvm-red hover:underline">
                Clear all
              </button>
            ) : null}
          </div>
          <div className="flex flex-col gap-4 p-4">{children}</div>
        </div>
      </aside>

      {drawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Close filters" onClick={() => setDrawerOpen(false)} className="absolute inset-0 bg-black/30" />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-kvm-border bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-kvm-border px-4 py-3">
              <h2 className="text-sm font-bold text-kvm-ink">Filters</h2>
              <button type="button" onClick={() => setDrawerOpen(false)} aria-label="Close" className="text-gray-400 hover:text-kvm-ink">
                <X size={18} />
              </button>
            </div>
            <div className="flex flex-col gap-4 p-4">{children}</div>
            {onClearAll ? (
              <div className="border-t border-kvm-border p-4">
                <button
                  type="button"
                  onClick={() => {
                    onClearAll();
                    setDrawerOpen(false);
                  }}
                  className="w-full rounded-sm border border-kvm-border py-2 text-sm font-semibold text-kvm-ink"
                >
                  Clear all
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Groups a stacked control under a small section label, e.g. "Position", "Age" — consistent spacing/typography for every filter in the sidebar. */
export function FilterSidebarSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</div>
      {children}
    </div>
  );
}
