"use client";

import { useState } from "react";
import { Info, X, Target } from "lucide-react";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts";
import type { PlayerRating } from "@/lib/scoring-data/types";
import { formatDate, cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState, ErrorState } from "@/components/ui/LoadingState";

const CONFIDENCE_STYLES: Record<string, string> = {
  High: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-300",
  Medium: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-300",
  Low: "bg-gray-100 text-gray-500 ring-1 ring-inset ring-gray-300",
};

function InfoModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-kvm-ink">About this rating</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-kvm-ink">
            <X size={18} />
          </button>
        </div>
        <dl className="space-y-3 text-sm text-gray-600">
          <div>
            <dt className="font-semibold text-kvm-ink">Current Level</dt>
            <dd>An absolute 0–100 estimate of the player&apos;s level right now, calibrated against real competition strength — not simply their percentile within their own league.</dd>
          </div>
          <div>
            <dt className="font-semibold text-kvm-ink">Potential</dt>
            <dd>A projection of the level this player could realistically reach, based on Current Level, age and a position-specific development curve. Never lower than Current Level, and always shown with a plausible range rather than one exact number.</dd>
          </div>
          <div>
            <dt className="font-semibold text-kvm-ink">Who the player is compared with</dt>
            <dd>Players in the same broad position group, in the same competition where possible — never the entire player database at once. See &ldquo;Comparison group&rdquo; below for exactly who was used for this rating.</dd>
          </div>
          <div>
            <dt className="font-semibold text-kvm-ink">Why confidence matters</dt>
            <dd>A rating built on few minutes, a small comparison group, or missing metrics is real but less certain — Confidence says how much weight to put on it, separately from the score itself.</dd>
          </div>
          <div className="rounded-md bg-gray-50 p-3 text-xs text-gray-500">
            This rating supports, and never replaces, live and video scouting.
          </div>
        </dl>
      </div>
    </div>
  );
}

function NotRatable({ rating }: { rating: PlayerRating }) {
  return (
    <EmptyState
      icon={Target}
      title="No rating available"
      description={rating.reason ?? "This player's position or sample doesn't currently support a rating."}
    />
  );
}

export function PlayerRatingBreakdown({
  rating,
  loading,
  error,
  onRetry,
}: {
  rating: PlayerRating | null;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  const [infoOpen, setInfoOpen] = useState(false);

  if (error) return <ErrorState message={error.message} onRetry={onRetry} />;
  if (loading) return <LoadingState label="Loading rating…" />;
  if (!rating) {
    return (
      <EmptyState
        icon={Target}
        title="No Impect rating yet"
        description="This player hasn't been matched to a calculated rating — run scripts/calculate-player-ratings.mjs for their competition."
      />
    );
  }

  const radarData = rating.pillars.filter((p) => p.available).map((p) => ({ pillar: p.label, score: p.score ?? 0 }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Position-Specific Rating — Impect</h3>
        <button
          type="button"
          onClick={() => setInfoOpen(true)}
          className="flex items-center gap-1 text-xs font-semibold text-kvm-red hover:underline"
        >
          <Info size={13} aria-hidden="true" />
          What does this mean?
        </button>
      </div>

      {!rating.ratable ? (
        <NotRatable rating={rating} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-md bg-gray-50 p-4 text-center">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Current Level</div>
              <div className="mt-1 text-3xl font-bold text-kvm-ink">{rating.currentLevel}</div>
              <div className="mt-1 text-[11px] text-gray-500">{rating.currentLevelBand}</div>
            </div>
            <div className="rounded-md bg-gray-50 p-4 text-center">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Potential</div>
              <div className="mt-1 text-3xl font-bold text-kvm-ink">{rating.potential}</div>
              {rating.potentialRange ? (
                <div className="mt-1 text-[11px] text-gray-500">
                  Range {rating.potentialRange.low}–{rating.potentialRange.high}
                </div>
              ) : null}
            </div>
            <div className="rounded-md bg-gray-50 p-4 text-center">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Confidence</div>
              <div className="mt-1.5">
                <span className={cn("inline-flex items-center rounded-md px-2.5 py-1 text-sm font-semibold", CONFIDENCE_STYLES[rating.confidence.label])}>
                  {rating.confidence.label} ({rating.confidence.score})
                </span>
              </div>
              {rating.overallPercentile !== null ? (
                <div className="mt-1 text-[11px] text-gray-500">{rating.overallPercentile}th percentile overall</div>
              ) : null}
            </div>
          </div>

          {radarData.length >= 3 ? (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} outerRadius="75%">
                  <PolarGrid stroke="#e7e1d4" />
                  <PolarAngleAxis dataKey="pillar" tick={{ fontSize: 10.5, fill: "#6b665f" }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#a39d8e" }} tickCount={5} />
                  <Radar dataKey="score" stroke="#e30613" fill="#e30613" fillOpacity={0.25} isAnimationActive={false} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Pillar</th>
                  <th>Score</th>
                  <th>Percentile</th>
                  <th>Weight</th>
                </tr>
              </thead>
              <tbody>
                {rating.pillars.map((p) => (
                  <tr key={p.key}>
                    <td className="font-medium text-kvm-ink">{p.label}</td>
                    <td className="tabular-nums text-gray-600">{p.available ? p.score : "—"}</td>
                    <td className="tabular-nums text-gray-600">{p.available ? `${p.percentile}th` : "—"}</td>
                    <td className="tabular-nums text-gray-600">{p.available ? p.weight : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">Strengths</h4>
              {rating.strengths.length === 0 ? (
                <p className="text-sm text-gray-400">No pillar clears the strength threshold yet.</p>
              ) : (
                <ul className="space-y-1 text-sm text-kvm-ink">
                  {rating.strengths.map((s) => (
                    <li key={s.pillar}>
                      {s.label} <span className="text-gray-400">({s.percentile}th percentile)</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">Weaknesses</h4>
              {rating.weaknesses.length === 0 ? (
                <p className="text-sm text-gray-400">No pillar falls below the weakness threshold.</p>
              ) : (
                <ul className="space-y-1 text-sm text-kvm-ink">
                  {rating.weaknesses.map((w) => (
                    <li key={w.pillar}>
                      {w.label} <span className="text-gray-400">({w.percentile}th percentile)</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {rating.developmentPriorities.length > 0 ? (
            <div>
              <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">Development Priorities</h4>
              <ul className="list-inside list-disc space-y-1 text-sm text-kvm-ink">
                {rating.developmentPriorities.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {rating.explanation ? (
            <div className="rounded-md border border-kvm-border bg-gray-50 p-4 text-sm leading-relaxed text-gray-700">{rating.explanation}</div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 border-t border-kvm-border pt-4 text-xs text-gray-500 sm:grid-cols-2">
            <div>
              <span className="font-semibold text-gray-700">Comparison group: </span>
              {rating.context.cohortSize} {rating.context.positionGroup.toLowerCase()}s in {rating.context.competition} ({rating.context.cohortLevel === "position+competition+season" ? "same competition" : "broadened cohort — see warnings"})
            </div>
            <div>
              <span className="font-semibold text-gray-700">Model: </span>v{rating.modelVersion} · calculated {formatDate(rating.calculatedAt)}
            </div>
          </div>

          {rating.confidence.reasons.length > 0 ? (
            <div className="text-xs text-gray-500">
              <span className="font-semibold text-gray-700">Confidence notes: </span>
              {rating.confidence.reasons.join(" ")}
            </div>
          ) : null}

          {rating.warnings.length > 0 ? (
            <ul className="space-y-1 rounded-md bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-inset ring-amber-200">
              {rating.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
        </>
      )}

      {infoOpen ? <InfoModal onClose={() => setInfoOpen(false)} /> : null}
    </div>
  );
}
