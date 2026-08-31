import { Sparkles } from "lucide-react";
import type { AiTipsDigest } from "@/lib/ai-tips-data";
import { formatDate } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * Clearly labelled as AI-generated — deliberately, since every other
 * widget in this app is a direct view of real SCOUTASTIC/derived data,
 * and this one is qualitatively different: LLM commentary synthesized
 * from real data (docs/AI_TIPS.md), not a new source of facts. Never
 * blend it visually with the "real data" widgets without that context.
 */
export function AiTipsWidget({ digest }: { digest: AiTipsDigest | null }) {
  if (!digest || digest.tips.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="No AI tips yet"
        description="Generated on a daily schedule from real scouting data — see docs/AI_TIPS.md."
      />
    );
  }

  return (
    <div>
      <ul className="divide-y divide-kvm-border">
        {digest.tips.map((tip, i) => (
          <li key={i} className="px-5 py-3">
            <div className="flex items-start gap-2">
              <Sparkles size={13} className="mt-0.5 shrink-0 text-kvm-yellow-dark" aria-hidden="true" />
              <div>
                <div className="text-sm font-semibold text-kvm-ink">{tip.title}</div>
                <div className="mt-0.5 text-xs text-gray-500">{tip.detail}</div>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <p className="border-t border-kvm-border px-5 py-2 text-[11px] text-gray-400">
        AI-generated from real scouting data, not a new source of facts · {formatDate(digest.generatedAt.slice(0, 10))}
      </p>
    </div>
  );
}
