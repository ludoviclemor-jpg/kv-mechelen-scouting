"use client";

import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

function shiftDate(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatLabel(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00.000Z`);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export function DateNav({ date, onChange }: { date: string; onChange: (date: string) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const isToday = date === today;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-kvm-border bg-white px-8 py-3">
      <button
        type="button"
        onClick={() => onChange(shiftDate(date, -1))}
        aria-label="Previous day"
        className="flex h-8 w-8 items-center justify-center rounded-sm border border-kvm-border text-kvm-ink hover:bg-gray-50"
      >
        <ChevronLeft size={15} />
      </button>

      <button
        type="button"
        onClick={() => onChange(today)}
        className={cn(
          "rounded-sm border px-3 py-1.5 text-sm font-semibold",
          isToday ? "border-kvm-red bg-kvm-red text-white" : "border-kvm-border text-kvm-ink hover:bg-gray-50"
        )}
      >
        Today
      </button>

      <button
        type="button"
        onClick={() => onChange(shiftDate(date, 1))}
        aria-label="Next day"
        className="flex h-8 w-8 items-center justify-center rounded-sm border border-kvm-border text-kvm-ink hover:bg-gray-50"
      >
        <ChevronRight size={15} />
      </button>

      <div className="ml-2 flex items-center gap-2 border-l border-kvm-border pl-4">
        <span className="text-sm font-bold text-kvm-ink">{formatLabel(date)}</span>
        <label className="relative flex items-center text-gray-400 hover:text-kvm-ink">
          <Calendar size={16} aria-hidden="true" />
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && onChange(e.target.value)}
            aria-label="Pick a date"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
      </div>
    </div>
  );
}
