/**
 * Shared age filtering — one set of presets, one range-conversion
 * function, used everywhere age filtering appears (Players, Competitions
 * player lists, Explore, African Debutants, Top Performers, Shortlists).
 * Previously each page had its own small, inconsistent set of age bands;
 * this replaces all of them.
 */

export interface AgeRange {
  min: number | null;
  max: number | null;
}

export interface AgePreset {
  value: string;
  label: string;
  range: AgeRange;
}

export const AGE_PRESETS: AgePreset[] = [
  { value: "all", label: "All ages", range: { min: null, max: null } },
  { value: "u18", label: "U18", range: { min: null, max: 17 } },
  { value: "u19", label: "U19", range: { min: null, max: 18 } },
  { value: "u20", label: "U20", range: { min: null, max: 19 } },
  { value: "u21", label: "U21", range: { min: null, max: 20 } },
  { value: "u23", label: "U23", range: { min: null, max: 22 } },
  { value: "18-21", label: "18–21", range: { min: 18, max: 21 } },
  { value: "18-23", label: "18–23", range: { min: 18, max: 23 } },
  { value: "21-25", label: "21–25", range: { min: 21, max: 25 } },
  { value: "23-27", label: "23–27", range: { min: 23, max: 27 } },
  { value: "25-30", label: "25–30", range: { min: 25, max: 30 } },
  { value: "30+", label: "30+", range: { min: 30, max: null } },
];

export const CUSTOM_AGE_PRESET_VALUE = "custom";

function rangesEqual(a: AgeRange, b: AgeRange): boolean {
  return a.min === b.min && a.max === b.max;
}

/** Which preset (if any) a given range matches exactly — "custom" if it doesn't match one, e.g. a user-typed min/max. */
export function matchingPresetValue(range: AgeRange): string {
  const preset = AGE_PRESETS.find((p) => rangesEqual(p.range, range));
  return preset?.value ?? CUSTOM_AGE_PRESET_VALUE;
}

export function presetRange(value: string): AgeRange {
  return AGE_PRESETS.find((p) => p.value === value)?.range ?? { min: null, max: null };
}

/**
 * Birthday-aware age -> date-of-birth range, matching calculateAge()'s
 * exact semantics (src/lib/utils.ts): age >= min <=> dob <= today-min-years;
 * age <= max <=> dob > today-(max+1)-years. `today` is injected so this
 * stays deterministic/testable, not tied to the real clock.
 */
export function ageRangeToDobRange(range: AgeRange, today = new Date()): { gt?: string; lte?: string } {
  const minusYears = (years: number) => {
    const d = new Date(today);
    d.setFullYear(d.getFullYear() - years);
    return d.toISOString().slice(0, 10);
  };
  const result: { gt?: string; lte?: string } = {};
  if (range.min !== null) result.lte = minusYears(range.min);
  if (range.max !== null) result.gt = minusYears(range.max + 1);
  return result;
}

/** For client-side filtering of an already-fetched player list (Debutants, Top Performers) — mirrors ageRangeToDobRange's semantics on plain ages instead of dates. */
export function matchesAgeRange(age: number | null, range: AgeRange): boolean {
  if (range.min === null && range.max === null) return true;
  if (age === null) return false; // unknown age never matches a specific range
  if (range.min !== null && age < range.min) return false;
  if (range.max !== null && age > range.max) return false;
  return true;
}

/** For active-filter-chip labels — "U21", "18–23", or "22–29" for a custom range. */
export function ageRangeLabel(range: AgeRange): string | null {
  if (range.min === null && range.max === null) return null;
  const preset = AGE_PRESETS.find((p) => rangesEqual(p.range, range));
  if (preset) return preset.label;
  if (range.min !== null && range.max !== null) return `${range.min}–${range.max}`;
  if (range.min !== null) return `${range.min}+`;
  return `Under ${(range.max ?? 0) + 1}`;
}
