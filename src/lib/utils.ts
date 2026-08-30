import { type ClassValue, clsx } from "clsx";

/**
 * Merge conditional class names. Kept dependency-free (no tailwind-merge)
 * since the design system uses a small, non-conflicting utility set.
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(...inputs);
}

export function formatCurrency(valueEUR: number): string {
  if (valueEUR >= 1_000_000) {
    return `€${(valueEUR / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (valueEUR >= 1_000) {
    return `€${(valueEUR / 1_000).toFixed(0)}K`;
  }
  return `€${valueEUR}`;
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateShort(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
}

export function calculateAge(dateOfBirth: string): number {
  const dob = new Date(dateOfBirth);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

export function contractStatus(expiryIso: string): {
  label: string;
  urgent: boolean;
} {
  const expiry = new Date(expiryIso);
  const now = new Date();
  const monthsLeft =
    (expiry.getFullYear() - now.getFullYear()) * 12 +
    (expiry.getMonth() - now.getMonth());
  return {
    label: formatDate(expiryIso),
    urgent: monthsLeft <= 12,
  };
}

/** Average of a list of ratings, rounded to 2 decimals. Returns null if empty. */
export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round((sum / values.length) * 100) / 100;
}
