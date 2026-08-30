import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  icon: Icon,
  accent = false,
  hint,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  accent?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between border border-kvm-border bg-white px-4 py-3.5">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          {label}
        </div>
        <div className="mt-1 text-2xl font-bold text-kvm-ink">{value}</div>
        {hint ? <div className="mt-0.5 text-xs text-gray-400">{hint}</div> : null}
      </div>
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-sm",
          accent ? "bg-kvm-red text-white" : "bg-kvm-yellow text-kvm-ink"
        )}
      >
        <Icon size={18} strokeWidth={2} aria-hidden="true" />
      </div>
    </div>
  );
}
