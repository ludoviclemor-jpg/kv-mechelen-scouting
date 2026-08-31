"use client";

import { useState } from "react";
import { AGE_PRESETS, CUSTOM_AGE_PRESET_VALUE, matchingPresetValue, presetRange, type AgeRange } from "@/lib/agePresets";

/**
 * Age preset dropdown + custom min/max range, used everywhere age
 * filtering appears. Selecting "Custom range" reveals two number inputs;
 * typing a min/max that happens to match a preset exactly switches the
 * dropdown back to that preset automatically (one source of truth, no
 * way for the two controls to disagree).
 */
export function AgeFilter({ range, onChange }: { range: AgeRange; onChange: (range: AgeRange) => void }) {
  const selected = matchingPresetValue(range);
  const [showCustom, setShowCustom] = useState(selected === CUSTOM_AGE_PRESET_VALUE);

  function handlePresetChange(value: string) {
    if (value === CUSTOM_AGE_PRESET_VALUE) {
      setShowCustom(true);
      return;
    }
    setShowCustom(false);
    onChange(presetRange(value));
  }

  return (
    <div className="inline-flex flex-col gap-1.5">
      <label className="inline-flex items-center gap-1.5 text-sm text-gray-600">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Age</span>
        <select
          value={showCustom ? CUSTOM_AGE_PRESET_VALUE : selected}
          onChange={(e) => handlePresetChange(e.target.value)}
          className="rounded-sm border border-kvm-border bg-white px-2 py-1 text-sm text-kvm-ink focus-visible:outline-none"
        >
          {AGE_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
          <option value={CUSTOM_AGE_PRESET_VALUE}>Custom range…</option>
        </select>
      </label>

      {showCustom ? (
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <label className="flex items-center gap-1">
            Min
            <input
              type="number"
              min={0}
              max={60}
              value={range.min ?? ""}
              onChange={(e) => onChange({ ...range, min: e.target.value === "" ? null : Number(e.target.value) })}
              placeholder="—"
              aria-label="Minimum age"
              className="w-14 rounded-sm border border-kvm-border bg-white px-1.5 py-0.5 text-xs text-kvm-ink focus-visible:outline-none"
            />
          </label>
          <label className="flex items-center gap-1">
            Max
            <input
              type="number"
              min={0}
              max={60}
              value={range.max ?? ""}
              onChange={(e) => onChange({ ...range, max: e.target.value === "" ? null : Number(e.target.value) })}
              placeholder="—"
              aria-label="Maximum age"
              className="w-14 rounded-sm border border-kvm-border bg-white px-1.5 py-0.5 text-xs text-kvm-ink focus-visible:outline-none"
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
