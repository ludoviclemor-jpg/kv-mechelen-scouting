"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function Pagination({
  page,
  pageCount,
  onChange,
  totalItems,
  pageSize,
}: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
  totalItems: number;
  pageSize: number;
}) {
  if (pageCount <= 1) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex items-center justify-between border-t border-kvm-border px-4 py-2.5 text-xs text-gray-500">
      <span>
        Showing <strong className="text-kvm-ink">{start}–{end}</strong> of{" "}
        <strong className="text-kvm-ink">{totalItems}</strong>
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-sm border border-kvm-border",
            page <= 1 ? "cursor-not-allowed text-gray-300" : "text-kvm-ink hover:bg-gray-50"
          )}
        >
          <ChevronLeft size={15} />
        </button>
        <span className="px-2 tabular-nums">
          {page} / {pageCount}
        </span>
        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page >= pageCount}
          aria-label="Next page"
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-sm border border-kvm-border",
            page >= pageCount ? "cursor-not-allowed text-gray-300" : "text-kvm-ink hover:bg-gray-50"
          )}
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
