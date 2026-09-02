"use client";

import { useEffect, useRef, useState } from "react";
import { AGE_PRESETS, ageRangeLabel, matchingPresetValue, type AgeRange } from "@/lib/agePresets";
import { cn } from "@/lib/utils";

/** Slider bounds. The top handle at MAX_BOUND represents "40+" (unbounded), matching the null-max convention used throughout agePresets.ts. */
const MIN_BOUND = 16;
const MAX_BOUND = 40;

/** The five most useful scouting shortcuts, shown as quick-select chips — the rest of AGE_PRESETS (18-21, 23-27, etc.) stay reachable via the slider/number inputs instead of cluttering the chip row. */
const SHORTCUT_VALUES = ["u18", "u19", "u20", "u21", "u23"];

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function sliderToRange(minPos: number, maxPos: number): AgeRange {
  return {
    min: minPos <= MIN_BOUND ? null : minPos,
    max: maxPos >= MAX_BOUND ? null : maxPos,
  };
}

function rangeToSlider(range: AgeRange): { min: number; max: number } {
  return {
    min: range.min === null ? MIN_BOUND : clamp(range.min, MIN_BOUND, MAX_BOUND),
    max: range.max === null ? MAX_BOUND : clamp(range.max, MIN_BOUND, MAX_BOUND),
  };
}

/**
 * The actual dual-handle slider + shortcuts + numeric inputs — shared by
 * both `AgeFilter` (a compact popover button, used in horizontal
 * FilterBar rows) and `AgeRangeSlider` (always-visible, used in
 * `FilterSidebar`). Two overlaid native `<input type="range">` elements
 * (pointer-events disabled on the input, re-enabled only on its thumb
 * via ::-webkit/moz-*-thumb in globals.css) rather than a slider library.
 */
function AgeRangeControls({ range, onChange }: { range: AgeRange; onChange: (range: AgeRange) => void }) {
  const slider = rangeToSlider(range);
  const isActive = range.min !== null || range.max !== null;
  const selectedPreset = matchingPresetValue(range);

  function setMin(v: number) {
    onChange(sliderToRange(clamp(v, MIN_BOUND, slider.max), slider.max));
  }
  function setMax(v: number) {
    onChange(sliderToRange(slider.min, clamp(v, slider.min, MAX_BOUND)));
  }

  const minPct = ((slider.min - MIN_BOUND) / (MAX_BOUND - MIN_BOUND)) * 100;
  const maxPct = ((slider.max - MIN_BOUND) / (MAX_BOUND - MIN_BOUND)) * 100;

  return (
    <div>
      <div className="flex flex-wrap gap-1 pb-3">
        {SHORTCUT_VALUES.map((value) => {
          const preset = AGE_PRESETS.find((p) => p.value === value)!;
          const active = selectedPreset === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => onChange(preset.range)}
              className={cn(
                "rounded-sm border px-2 py-1 text-xs font-medium",
                active ? "border-kvm-red bg-kvm-red text-white" : "border-kvm-border text-gray-600 hover:bg-gray-50"
              )}
            >
              {preset.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onChange({ min: null, max: null })}
          className={cn(
            "rounded-sm border px-2 py-1 text-xs font-medium",
            !isActive ? "border-kvm-red bg-kvm-red text-white" : "border-kvm-border text-gray-600 hover:bg-gray-50"
          )}
        >
          All ages
        </button>
      </div>

      <div className="flex items-center justify-between pb-1.5 text-xs font-bold text-kvm-ink">
        <span>{slider.min}</span>
        <span>{slider.max >= MAX_BOUND ? `${MAX_BOUND}+` : slider.max}</span>
      </div>

      <div className="relative h-4">
        <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-gray-200" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-kvm-red"
          style={{ left: `${minPct}%`, right: `${100 - maxPct}%` }}
        />
        <input
          type="range"
          min={MIN_BOUND}
          max={MAX_BOUND}
          step={1}
          value={slider.min}
          onChange={(e) => setMin(Number(e.target.value))}
          aria-label="Minimum age"
          className="age-slider-thumb absolute inset-0 z-10 h-4 w-full appearance-none bg-transparent"
        />
        <input
          type="range"
          min={MIN_BOUND}
          max={MAX_BOUND}
          step={1}
          value={slider.max}
          onChange={(e) => setMax(Number(e.target.value))}
          aria-label="Maximum age"
          className="age-slider-thumb absolute inset-0 z-20 h-4 w-full appearance-none bg-transparent"
        />
      </div>

      <div className="mt-0.5 flex items-center justify-between text-[10px] text-gray-400">
        <span>{MIN_BOUND}</span>
        <span>{MAX_BOUND}+</span>
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-kvm-border pt-3">
        <label className="flex items-center gap-1 text-xs text-gray-500">
          Min
          <input
            type="number"
            min={MIN_BOUND}
            max={slider.max}
            value={slider.min}
            onChange={(e) => setMin(Number(e.target.value))}
            aria-label="Minimum age (number)"
            className="w-14 rounded-sm border border-kvm-border bg-white px-1.5 py-0.5 text-xs text-kvm-ink focus-visible:outline-none"
          />
        </label>
        <span className="text-gray-300">–</span>
        <label className="flex items-center gap-1 text-xs text-gray-500">
          Max
          <input
            type="number"
            min={slider.min}
            max={MAX_BOUND}
            value={slider.max}
            onChange={(e) => setMax(Number(e.target.value))}
            aria-label="Maximum age (number)"
            className="w-14 rounded-sm border border-kvm-border bg-white px-1.5 py-0.5 text-xs text-kvm-ink focus-visible:outline-none"
          />
        </label>
        {isActive ? (
          <button type="button" onClick={() => onChange({ min: null, max: null })} className="ml-auto text-xs font-medium text-kvm-red hover:underline">
            Reset
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Compact popover version — a button showing the current selection
 * ("U23", "19–23", "All ages") that opens `AgeRangeControls` in a
 * dropdown. Used in horizontal `FilterBar` rows (Explore, Debutants,
 * Top Performers, Shortlists, Competition detail) where an always-open
 * slider would take too much horizontal space.
 */
export function AgeFilter({ range, onChange }: { range: AgeRange; onChange: (range: AgeRange) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const label = ageRangeLabel(range) ?? "All ages";
  const isActive = range.min !== null || range.max !== null;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-1.5 rounded-sm border border-kvm-border bg-white px-2.5 py-1.5 text-sm",
          isActive ? "font-medium text-kvm-ink" : "text-gray-600"
        )}
      >
        <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Age</span>
        {label}
      </button>

      {open ? (
        <div className="absolute left-0 z-30 mt-1 w-72 rounded-sm border border-kvm-border bg-white p-4 shadow-lg">
          <AgeRangeControls range={range} onChange={onChange} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Always-visible dual-handle age slider for `FilterSidebar` — same
 * `AgeRangeControls` as the popover version, just never hidden. Shows a
 * precise "18 — 23" style range, never a broad U21/U23-only bucket
 * (those shortcut chips are offered too, but the slider always allows
 * exact min/max selection).
 */
export function AgeRangeSlider({ range, onChange }: { range: AgeRange; onChange: (range: AgeRange) => void }) {
  return <AgeRangeControls range={range} onChange={onChange} />;
}
