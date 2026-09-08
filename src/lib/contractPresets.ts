/**
 * Contract-expiry filtering, relative to today rather than hardcoded
 * calendar years — replaces the previous "Expires 2026/2027/2028/2029+"
 * bands, which silently went stale every year (see the redesign brief's
 * "toekomstbestendig" requirement). Same value/query-range convention as
 * agePresets.ts/valuePresets.ts.
 */
export interface ContractPreset {
  value: string;
  label: string;
}

export const CONTRACT_PRESETS: ContractPreset[] = [
  { value: "all", label: "All contracts" },
  { value: "expired", label: "Already expired" },
  { value: "6", label: "Expiring within 6 months" },
  { value: "12", label: "Expiring within 12 months" },
  { value: "24", label: "Expiring within 24 months" },
  { value: "24+", label: "2+ years away" },
];

export const CONTRACT_PRESET_LABELS: Record<string, string> = Object.fromEntries(CONTRACT_PRESETS.map((p) => [p.value, p.label]));

export function contractPresetToRange(value: string, today = new Date()): { gte?: string; lt?: string } {
  const todayStr = today.toISOString().slice(0, 10);
  if (value === "expired") return { lt: todayStr };
  if (value === "24+") {
    const cutoff = new Date(today);
    cutoff.setMonth(cutoff.getMonth() + 24);
    return { gte: cutoff.toISOString().slice(0, 10) };
  }
  const months = Number(value);
  if (!Number.isFinite(months)) return {};
  const cutoff = new Date(today);
  cutoff.setMonth(cutoff.getMonth() + months);
  return { gte: todayStr, lt: cutoff.toISOString().slice(0, 10) };
}
