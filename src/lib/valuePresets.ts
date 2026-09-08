/**
 * Market value filtering — quick presets plus an always-available exact
 * min/max (mirrors src/lib/agePresets.ts's range convention). EUR, whole
 * numbers. `null` means unbounded on that side.
 */
export interface ValueRange {
  min: number | null;
  max: number | null;
}

export interface ValuePreset {
  value: string;
  label: string;
  range: ValueRange;
}

export const VALUE_PRESETS: ValuePreset[] = [
  { value: "all", label: "All values", range: { min: null, max: null } },
  { value: "u1", label: "Under €1M", range: { min: null, max: 999_999 } },
  { value: "1-3", label: "€1M – €3M", range: { min: 1_000_000, max: 2_999_999 } },
  { value: "3-6", label: "€3M – €6M", range: { min: 3_000_000, max: 5_999_999 } },
  { value: "6+", label: "€6M+", range: { min: 6_000_000, max: null } },
];

function rangesEqual(a: ValueRange, b: ValueRange): boolean {
  return a.min === b.min && a.max === b.max;
}

export function matchingValuePreset(range: ValueRange): string {
  const preset = VALUE_PRESETS.find((p) => rangesEqual(p.range, range));
  return preset?.value ?? "custom";
}

export function valuePresetRange(value: string): ValueRange {
  return VALUE_PRESETS.find((p) => p.value === value)?.range ?? { min: null, max: null };
}

/** Compact "€1M+" / "Under €6M" / "€2M – €5M" label for active-filter chips. Whole millions only, since that's the meaningful precision for scouting-sized values; exact figures still show in the input fields themselves. */
export function valueRangeLabel(range: ValueRange): string | null {
  if (range.min === null && range.max === null) return null;
  const preset = VALUE_PRESETS.find((p) => rangesEqual(p.range, range));
  if (preset) return preset.label;
  const fmt = (v: number) => `€${(v / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })}M`;
  if (range.min !== null && range.max !== null) return `${fmt(range.min)} – ${fmt(range.max)}`;
  if (range.min !== null) return `${fmt(range.min)}+`;
  return `Under ${fmt(range.max!)}`;
}

export function valueRangeToQuery(range: ValueRange): { gte?: number; lte?: number } {
  const result: { gte?: number; lte?: number } = {};
  if (range.min !== null) result.gte = range.min;
  if (range.max !== null) result.lte = range.max;
  return result;
}
