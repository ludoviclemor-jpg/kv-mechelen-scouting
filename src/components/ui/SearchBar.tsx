"use client";

import { Search } from "lucide-react";

export function SearchBar({
  value,
  onChange,
  placeholder = "Search...",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative w-full max-w-sm">
      <Search
        size={16}
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
        aria-hidden="true"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-sm border border-kvm-border bg-white py-1.5 pl-8 pr-3 text-sm text-kvm-ink placeholder:text-gray-400 focus-visible:outline-none"
      />
    </div>
  );
}
