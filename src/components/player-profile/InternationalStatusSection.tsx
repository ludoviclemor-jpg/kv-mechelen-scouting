import { Flag } from "lucide-react";
import type { CapsByLevel } from "@/lib/players-data";
import type { FirstCallUp } from "@/lib/callups-data";
import { formatDate, cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";

const NEW_CALL_UP_WINDOW_DAYS = 60;

function isRecent(dateISO: string): boolean {
  const days = (Date.now() - new Date(dateISO).getTime()) / (1000 * 60 * 60 * 24);
  return days >= 0 && days <= NEW_CALL_UP_WINDOW_DAYS;
}

/**
 * Caps-by-level table from real performanceSummary rows (aggregateStats
 * across every international row, grouped by level — see capsByLevel()
 * in src/lib/players-data/performance.ts), plus a "NEW INTERNATIONAL
 * CALL-UP" banner sourced from player_international_callups
 * (docs/INTERNATIONAL_CALLUPS.md) when a call-up landed within the last
 * 60 days. Both are independently real — a player can have caps history
 * without a *recent* call-up, or vice versa if their history predates
 * this project's sync window (see that doc's "what this can't do").
 */
export function InternationalStatusSection({ caps, callUps }: { caps: CapsByLevel[]; callUps: FirstCallUp[] }) {
  const recentCallUp = callUps.find((c) => isRecent(c.firstCallUpDate));

  if (caps.length === 0 && callUps.length === 0) {
    return (
      <EmptyState icon={Flag} title="No international data" description="No senior or youth national-team appearances found in SCOUTASTIC's data for this player." />
    );
  }

  return (
    <div className="space-y-3">
      {recentCallUp ? (
        <div className="border border-kvm-red bg-red-50 px-3 py-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wide text-kvm-red">New international call-up</div>
          <div className="mt-0.5 text-sm font-semibold text-kvm-ink">
            {recentCallUp.teamName}
            {recentCallUp.level === "Senior" ? " — first senior call-up" : ` — first ${recentCallUp.level} call-up`}
          </div>
          <div className="text-xs text-gray-500">{formatDate(recentCallUp.firstCallUpDate)}</div>
        </div>
      ) : null}

      {caps.length > 0 ? (
        <table className="w-full text-sm">
          <tbody>
            {caps.map((c) => (
              <tr key={c.level} className="border-b border-kvm-border last:border-0">
                <td className="py-1.5 pr-3">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                      c.level === "Senior" ? "bg-kvm-red text-white" : "bg-gray-100 text-gray-600"
                    )}
                  >
                    {c.level}
                  </span>
                </td>
                <td className="py-1.5 pr-3 font-medium text-kvm-ink">{c.teamName ?? "—"}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-gray-600">{c.caps} caps</td>
                <td className="py-1.5 text-right tabular-nums text-gray-400">{c.goals} goals</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
