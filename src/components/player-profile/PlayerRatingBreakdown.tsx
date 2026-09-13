"use client";

import { useState } from "react";
import { Info, X, Target, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Legend, Tooltip } from "recharts";
import type { PlayerRating } from "@/lib/scoring-data/types";
import { formatDate, cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState, ErrorState } from "@/components/ui/LoadingState";

const CONFIDENCE_STYLES: Record<string, string> = {
  High: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-300",
  Medium: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-300",
  Low: "bg-gray-100 text-gray-500 ring-1 ring-inset ring-gray-300",
};

/** Pillar scores are already centered on 50 = the cohort average (see docs/SCORING_MODEL.md's normalization method) — a small dead zone avoids reading noise around 50 as a meaningful signal either way. */
const AVERAGE_DEAD_ZONE = 3;

function averageComparison(score: number | null) {
  if (score === null) return null;
  if (score > 50 + AVERAGE_DEAD_ZONE) return { direction: "above" as const, Icon: ArrowUp, className: "text-emerald-700" };
  if (score < 50 - AVERAGE_DEAD_ZONE) return { direction: "below" as const, Icon: ArrowDown, className: "text-kvm-red" };
  return { direction: "average" as const, Icon: Minus, className: "text-gray-400" };
}

function AverageBadge({ score }: { score: number | null }) {
  const comparison = averageComparison(score);
  if (!comparison) return <span className="text-gray-300">—</span>;
  const { Icon, className, direction } = comparison;
  const label = direction === "above" ? "Above average" : direction === "below" ? "Below average" : "Average";
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", className)}>
      <Icon size={12} aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * Full explanation panel (Request B, section 7): every rating shown on
 * the profile must be traceable back to real, disclosed inputs — never
 * just "trust the number". Renders the actual data behind this specific
 * player's rating, not generic copy; falls back to the general concept
 * text only for fields a given rating genuinely has nothing to show
 * (e.g. no `competitionCalibration` recorded yet, an older model version).
 */
function InfoModal({ rating, onClose }: { rating: PlayerRating; onClose: () => void }) {
  const calibration = rating.context.competitionCalibration;
  const fit = rating.kvMechelenFit;
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
            <dt className="font-semibold text-kvm-ink">Position / role used</dt>
            <dd>
              {rating.context.position} ({rating.context.positionGroup}
              {rating.context.role ? `, ${rating.context.role}` : ""})
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-kvm-ink">Reference cohort</dt>
            <dd>
              {rating.context.cohortSize} {rating.context.positionGroup.toLowerCase()}s in {rating.context.competition}, {rating.context.season}
              {rating.context.cohortLevel !== "position+competition+season" ? " — broadened cohort, see warnings below" : ""}.
            </dd>
          </div>
          {calibration ? (
            <div>
              <dt className="font-semibold text-kvm-ink">Competition correction</dt>
              <dd>
                Raw within-competition score {calibration.rawScore} → calibrated {calibration.calibratedScore} (
                {calibration.competitionAdjustment.tier} tier, ×{calibration.competitionAdjustment.multiplier}
                {calibration.competitionAdjustment.offset >= 0 ? "+" : ""}
                {calibration.competitionAdjustment.offset}). {calibration.realTransferEvidence ? `Cross-checked against ${calibration.realTransferEvidence.n} real transfer pairs (disclosed diagnostic, not blended into the score — see docs/SCORING_MODEL.md).` : "No real transfer-based evidence available for this competition yet — a provisional, disclosed calibration."}
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="font-semibold text-kvm-ink">Key strengths</dt>
            <dd>
              {rating.strengths.length > 0
                ? rating.strengths.map((s) => `${s.label} (${s.percentile}th pct.)`).join(", ")
                : "No pillar clears the strength threshold yet."}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-kvm-ink">Key shortcomings</dt>
            <dd>
              {rating.weaknesses.length > 0
                ? rating.weaknesses.map((w) => `${w.label} (${w.percentile}th pct.)`).join(", ")
                : "No pillar falls below the weakness threshold."}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-kvm-ink">KV Mechelen fit</dt>
            {fit.supported && fit.totalFit !== null ? (
              <dd>
                Total Fit {fit.totalFit}/100 for the {fit.intendedRole ?? "configured"} role
                {fit.playingStyle ? ` (${fit.playingStyle})` : ""}.{" "}
                {fit.failedRequirements && fit.failedRequirements.length > 0
                  ? `Falls short of a minimum requirement: ${fit.failedRequirements.map((f) => `${f.label} (${f.actualPercentile}th vs. ${f.minPercentile}th required)`).join(", ")}.`
                  : "Meets this role's disclosed minimum requirements."}
                {" "}Based on a draft KV Mechelen role profile (v{fit.profileVersion}), not verified current club tactics or transfer policy.
              </dd>
            ) : (
              <dd>{fit.reason ?? "Insufficient data for this position/role."}</dd>
            )}
          </div>
          <div>
            <dt className="font-semibold text-kvm-ink">Missing information</dt>
            <dd>{rating.warnings.length > 0 ? rating.warnings.join(" ") : "No data-completeness warnings recorded for this rating."}</dd>
          </div>
          <div>
            <dt className="font-semibold text-kvm-ink">Model version &amp; calculation date</dt>
            <dd>
              v{rating.modelVersion} · calculated {formatDate(rating.calculatedAt)}
            </dd>
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
  compact = false,
}: {
  rating: PlayerRating | null;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  /** Score cards + chart + cohort line only — no pillar table, strengths/weaknesses, explanation or footer. Used for the always-visible top-of-profile zone (2026-09-11 redesign); the full breakdown still renders in the Ratings tab. */
  compact?: boolean;
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

  // Split into Technical / Physical (scripts/lib/scoring/config/positionPillars.mjs's `domain` tag) — this chart shows the
  // Technical pillars only. The duel/pressing pillars tagged "physical" here are still real Impect signal and still count
  // toward Current Level below, but they're a proxy for physicality, not a measurement of it — real physical data (distance,
  // sprints, high-speed running) lives in the separate SkillCorner-backed Physical Profile chart on this profile instead.
  const technicalPillars = rating.pillars.filter((p) => p.domain === "technical");
  const physicalPillarCount = rating.pillars.filter((p) => p.domain === "physical" && p.available).length;
  const radarData = technicalPillars.filter((p) => p.available).map((p) => ({ pillar: p.label, score: p.score ?? 0, average: 50 }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Technical Profile — Impect</h3>
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
          <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-3", !compact && "gap-4")}>
            <div className={cn("rounded-md bg-gray-50 text-center", compact ? "p-2.5" : "p-4")}>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Current Level</div>
              <div className={cn("mt-1 font-bold text-kvm-ink", compact ? "text-2xl" : "text-3xl")}>{rating.currentLevel}</div>
              {!compact ? <div className="mt-1 text-[11px] text-gray-500">{rating.currentLevelBand}</div> : null}
            </div>
            <div className={cn("rounded-md bg-gray-50 text-center", compact ? "p-2.5" : "p-4")}>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Potential</div>
              <div className={cn("mt-1 font-bold text-kvm-ink", compact ? "text-2xl" : "text-3xl")}>{rating.potential}</div>
              {rating.potentialRange && !compact ? (
                <div className="mt-1 text-[11px] text-gray-500">
                  Range {rating.potentialRange.low}–{rating.potentialRange.high}
                </div>
              ) : null}
            </div>
            <div className={cn("rounded-md bg-gray-50 text-center", compact ? "p-2.5" : "p-4")}>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Confidence</div>
              <div className="mt-1.5">
                <span className={cn("inline-flex items-center rounded-md px-2.5 py-1 text-sm font-semibold", CONFIDENCE_STYLES[rating.confidence.label])}>
                  {rating.confidence.label} ({rating.confidence.score})
                </span>
              </div>
              {rating.overallPercentile !== null && !compact ? (
                <div className="mt-1 text-[11px] text-gray-500">{rating.overallPercentile}th percentile overall</div>
              ) : null}
            </div>
          </div>

          {radarData.length >= 3 ? (
            <div className={compact ? "h-56 w-full" : "h-72 w-full"}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} outerRadius="75%">
                  <PolarGrid stroke="#e7e1d4" />
                  <PolarAngleAxis dataKey="pillar" tick={{ fontSize: compact ? 9.5 : 10.5, fill: "#6b665f" }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#a39d8e" }} tickCount={5} />
                  <Radar name="Cohort average" dataKey="average" stroke="#a39d8e" strokeDasharray="4 3" fill="none" isAnimationActive={false} />
                  <Radar name="This player" dataKey="score" stroke="#e30613" fill="#e30613" fillOpacity={0.25} isAnimationActive={false} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6, borderColor: "#e7e1d4" }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-xs text-gray-400">Not enough technical pillars available yet to draw a chart for this player.</p>
          )}

          <p className="text-xs text-gray-500">
            <span className="font-semibold text-gray-700">Compared with: </span>
            {rating.context.cohortSize} {rating.context.positionGroup.toLowerCase()}s in {rating.context.competition}
            {rating.context.cohortLevel !== "position+competition+season" ? " (broadened cohort)" : ""}
          </p>

          {!compact ? (
            <>
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Pillar</th>
                      <th>Score</th>
                      <th>vs. Cohort Average</th>
                      <th>Percentile</th>
                      <th>Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {technicalPillars.map((p) => (
                      <tr key={p.key}>
                        <td className="font-medium text-kvm-ink">{p.label}</td>
                        <td className="tabular-nums text-gray-600">{p.available ? p.score : "—"}</td>
                        <td>
                          <AverageBadge score={p.available ? p.score : null} />
                        </td>
                        <td className="tabular-nums text-gray-600">{p.available ? `${p.percentile}th` : "—"}</td>
                        <td className="tabular-nums text-gray-600">{p.available ? p.weight : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {physicalPillarCount > 0 ? (
                <p className="text-xs text-gray-400">
                  {physicalPillarCount} additional duel-based pillar{physicalPillarCount === 1 ? "" : "s"} (ground/aerial duels,
                  pressing) still counts toward Current Level above but isn&apos;t shown in this chart — see the Physical Profile
                  tab for real SkillCorner tracking data instead.
                </p>
              ) : null}

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
          ) : null}
        </>
      )}

      {infoOpen ? <InfoModal rating={rating} onClose={() => setInfoOpen(false)} /> : null}
    </div>
  );
}
