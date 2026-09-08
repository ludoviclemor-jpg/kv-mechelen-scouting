"use client";

import { VALUE_PRESETS, matchingValuePreset, type ValueRange } from "@/lib/valuePresets";
import { cn } from "@/lib/utils";

/** Quick presets stay as one-click shortcuts; the exact min/max fields underneath are always available and take priority the moment either is typed — same shortcuts+exact-range pattern as AgeRangeSlider (src/components/ui/AgeFilter.tsx), for a currency range instead of an age range. */
export function MarketValueFilter({ range, onChange }: { range: ValueRange; onChange: (range: ValueRange) => void }) {
  const selectedPreset = matchingValuePreset(range);
  const isActive = range.min !== null || range.max !== null;

  function setMin(raw: string) {
    const value = raw === "" ? null : Math.max(0, Number(raw));
    onChange({ min: value, max: range.max });
  }
  function setMax(raw: string) {
    const value = raw === "" ? null : Math.max(0, Number(raw));
    onChange({ min: range.min, max: value });
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1 pb-2">
        {VALUE_PRESETS.filter((p) => p.value !== "all").map((preset) => {
          const active = selectedPreset === preset.value;
          return (
            <button
              key={preset.value}
              type="button"
              onClick={() => onChange(preset.range)}
              className={cn(
                "rounded-md border px-2 py-1 text-xs font-medium",
                active ? "border-kvm-red bg-kvm-red text-white" : "border-kvm-border text-gray-600 hover:bg-gray-50"
              )}
            >
              {preset.label}
            </button>
          );
        })}
        {isActive ? (
          <button
            type="button"
            onClick={() => onChange({ min: null, max: null })}
            className="rounded-md border border-kvm-border px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            Clear
          </button>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-1 text-xs text-gray-500">
          Min €
          <input
            type="number"
            min={0}
            step={100_000}
            value={range.min ?? ""}
            onChange={(e) => setMin(e.target.value)}
            placeholder="0"
            aria-label="Minimum market value (EUR)"
            className="w-full min-w-0 rounded-md border border-kvm-border bg-white px-1.5 py-1 text-xs text-kvm-ink focus-visible:outline-none"
          />
        </label>
        <span className="shrink-0 text-gray-300">–</span>
        <label className="flex min-w-0 flex-1 items-center gap-1 text-xs text-gray-500">
          Max €
          <input
            type="number"
            min={0}
            step={100_000}
            value={range.max ?? ""}
            onChange={(e) => setMax(e.target.value)}
            placeholder="No max"
            aria-label="Maximum market value (EUR)"
            className="w-full min-w-0 rounded-md border border-kvm-border bg-white px-1.5 py-1 text-xs text-kvm-ink focus-visible:outline-none"
          />
        </label>
      </div>
    </div>
  );
}
