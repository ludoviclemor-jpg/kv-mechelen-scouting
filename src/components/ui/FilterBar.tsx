"use client";

import type { ReactNode } from "react";

export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div
      role="group"
      aria-label="Filters"
      className="flex flex-wrap items-center gap-2 border-b border-kvm-border bg-white px-8 py-3"
    >
      {children}
    </div>
  );
}

export function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-sm text-gray-600">
      <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-sm border border-kvm-border bg-white px-2 py-1 text-sm text-kvm-ink focus-visible:outline-none"
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
