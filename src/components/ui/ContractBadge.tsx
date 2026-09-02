import { contractStatus, type ContractTier } from "@/lib/utils";
import { cn } from "@/lib/utils";

const TIER_STYLES: Record<ContractTier, string> = {
  expired: "bg-red-50 text-kvm-red ring-1 ring-inset ring-red-200",
  urgent: "bg-red-50 text-kvm-red ring-1 ring-inset ring-red-200",
  soon: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
  neutral: "bg-gray-100 text-gray-600 ring-1 ring-inset ring-gray-200",
  unknown: "bg-gray-50 text-gray-400 ring-1 ring-inset ring-gray-200",
};

/** Compact year-only contract badge (e.g. "2027") — red for expired/≤6mo, amber for ≤12mo, neutral otherwise. Full date stays available via `title`. */
export function ContractBadge({ expiryIso }: { expiryIso: string | null }) {
  const contract = contractStatus(expiryIso);
  return (
    <span
      title={contract.label}
      className={cn("inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-semibold tabular-nums", TIER_STYLES[contract.tier])}
    >
      {contract.year ?? "—"}
    </span>
  );
}
