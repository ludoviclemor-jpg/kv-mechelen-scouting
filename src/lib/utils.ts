import { type ClassValue, clsx } from "clsx";

/**
 * Merge conditional class names. Kept dependency-free (no tailwind-merge)
 * since the design system uses a small, non-conflicting utility set.
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(...inputs);
}

/** "Unknown" for null — SCOUTASTIC doesn't return this field for every player, never invented. */
export function formatCurrency(valueEUR: number | null): string {
  if (valueEUR === null) return "Unknown";
  if (valueEUR >= 1_000_000) {
    return `€${(valueEUR / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (valueEUR >= 1_000) {
    return `€${(valueEUR / 1_000).toFixed(0)}K`;
  }
  return `€${valueEUR}`;
}

export function formatDate(iso: string | null): string {
  if (iso === null) return "Unknown";
  const date = new Date(iso);
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateShort(iso: string | null): string {
  if (iso === null) return "Unknown";
  const date = new Date(iso);
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
}

/** Returns null when the date of birth isn't known — never guess an age. */
export function calculateAge(dateOfBirth: string | null): number | null {
  if (dateOfBirth === null) return null;
  const dob = new Date(dateOfBirth);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

/** Just the birth year, for compact labels (pitch view, match sheets) — never the full date of birth. */
export function birthYear(dateOfBirth: string | null): number | null {
  if (dateOfBirth === null) return null;
  return new Date(dateOfBirth).getFullYear();
}

export type ContractTier = "expired" | "urgent" | "soon" | "neutral" | "unknown";

export function contractStatus(expiryIso: string | null): {
  label: string; // full formatted date, e.g. "15 Jun 2027"
  year: string | null; // e.g. "2027" — for the compact ContractBadge
  tier: ContractTier;
  urgent: boolean; // true for "expired"/"urgent" — kept for existing callers
} {
  if (expiryIso === null) return { label: "Unknown", year: null, tier: "unknown", urgent: false };
  const expiry = new Date(expiryIso);
  const now = new Date();
  const monthsLeft =
    (expiry.getFullYear() - now.getFullYear()) * 12 +
    (expiry.getMonth() - now.getMonth());
  const tier: ContractTier = monthsLeft < 0 ? "expired" : monthsLeft <= 6 ? "urgent" : monthsLeft <= 12 ? "soon" : "neutral";
  return {
    label: formatDate(expiryIso),
    year: String(expiry.getFullYear()),
    tier,
    urgent: tier === "expired" || tier === "urgent",
  };
}

/** Average of a list of ratings, rounded to 2 decimals. Returns null if empty. */
export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round((sum / values.length) * 100) / 100;
}

/** Ascending numeric compare for useSortableList comparators — `null`/`undefined` sort first (lowest), consistent across every sortable table. */
export function compareNumbers(a: number | null | undefined, b: number | null | undefined): number {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : -1;
  if (b === null || b === undefined) return 1;
  return a - b;
}

/** Ascending string compare for useSortableList comparators — `null`/`undefined` sort first (lowest). */
export function compareStrings(a: string | null | undefined, b: string | null | undefined): number {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : -1;
  if (b === null || b === undefined) return 1;
  return a.localeCompare(b);
}
