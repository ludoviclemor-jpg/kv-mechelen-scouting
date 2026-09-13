"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Info } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState, ErrorState } from "@/components/ui/LoadingState";
import { BestXIPitch } from "@/components/data/BestXIPitch";
import { BestXISlotDetail } from "@/components/data/BestXISlotDetail";
import { fetchDataCompetitionOptions, fetchBestXICandidates, selectBestXI } from "@/lib/best-xi";
import { FORMATIONS, DEFAULT_FORMATION_ID, getFormation } from "@/lib/shadow-xi";
import { useAsync } from "@/lib/players-data";
import { formatDate } from "@/lib/utils";
import { Users } from "lucide-react";

const FILTERS_STORAGE_KEY = "kvm-data-best-xi-filters";
const DEFAULT_MIN_MINUTES = 900;

interface StoredFilters {
  iterationId: number | null;
  minMinutes: number;
  formationId: string;
}

function loadStoredFilters(): StoredFilters {
  try {
    const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
    if (!raw) return { iterationId: null, minMinutes: DEFAULT_MIN_MINUTES, formationId: DEFAULT_FORMATION_ID };
    return JSON.parse(raw);
  } catch {
    return { iterationId: null, minMinutes: DEFAULT_MIN_MINUTES, formationId: DEFAULT_FORMATION_ID };
  }
}

/**
 * "Data" — Best XI per competition, computed entirely from real,
 * already-cached `player_ratings` (Current Level only — never
 * Potential or KV Mechelen Fit, per the brief). Filters persist per
 * browser (a lightweight per-viewer convenience, not meaningful shared
 * state) via localStorage.
 */
export default function DataPage() {
  // Lazy initializers (not a mount effect) — reads localStorage exactly
  // once, on first render, avoiding a real extra render pass just to
  // apply a remembered filter.
  const [iterationId, setIterationId] = useState<number | null>(() => loadStoredFilters().iterationId);
  const [minMinutes, setMinMinutes] = useState(() => loadStoredFilters().minMinutes);
  const [formationId, setFormationId] = useState(() => loadStoredFilters().formationId);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify({ iterationId, minMinutes, formationId }));
    } catch {
      // per-viewer convenience only — a storage failure (private browsing, quota) is never worth surfacing as an error
    }
  }, [iterationId, minMinutes, formationId]);

  const { data: competitionOptions, loading: optionsLoading, error: optionsError } = useAsync(() => fetchDataCompetitionOptions(), []);

  // No remembered/selected competition yet, but real options have loaded — fall back to the first real one rather than a second effect + extra render.
  const effectiveIterationId = iterationId ?? competitionOptions?.[0]?.iterationId ?? null;
  const selectedCompetition = competitionOptions?.find((c) => c.iterationId === effectiveIterationId) ?? null;

  const {
    data: candidateData,
    loading: candidatesLoading,
    error: candidatesError,
    reload,
  } = useAsync(() => (effectiveIterationId !== null ? fetchBestXICandidates(effectiveIterationId, minMinutes) : Promise.resolve(null)), [effectiveIterationId, minMinutes]);

  const formation = getFormation(formationId);
  const bestXI = useMemo(() => (candidateData ? selectBestXI(candidateData.candidates, formation) : null), [candidateData, formation]);
  const selected = bestXI?.slots.find((s) => s.slot === selectedSlot) ?? null;

  return (
    <>
      <PageHeader title="Data" description="The best available XI per competition, built entirely from real, position-specific performance data." />

      <div className="space-y-6 p-8">
        <section className="rounded-xl border border-kvm-border bg-white p-4 shadow-[0_1px_2px_rgba(26,23,18,0.04),0_8px_24px_-8px_rgba(26,23,18,0.10)]">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label htmlFor="data-competition" className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Competition
              </label>
              <select
                id="data-competition"
                value={effectiveIterationId ?? ""}
                onChange={(e) => setIterationId(Number(e.target.value))}
                className="mt-1 w-64 rounded-md border border-kvm-border bg-white px-2.5 py-1.5 text-sm"
              >
                {(competitionOptions ?? []).map((c) => (
                  <option key={c.iterationId} value={c.iterationId}>
                    {c.competitionName} — {c.season} ({c.playerCount})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="data-min-minutes" className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Minimum minutes
              </label>
              <input
                id="data-min-minutes"
                type="number"
                min={0}
                step={90}
                value={minMinutes}
                onChange={(e) => setMinMinutes(Math.max(0, Number(e.target.value)))}
                className="mt-1 w-28 rounded-md border border-kvm-border bg-white px-2.5 py-1.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="data-formation" className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Formation
              </label>
              <select
                id="data-formation"
                value={formationId}
                onChange={(e) => setFormationId(e.target.value)}
                className="mt-1 w-40 rounded-md border border-kvm-border bg-white px-2.5 py-1.5 text-sm"
              >
                {FORMATIONS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" onClick={() => setShowInfo((v) => !v)} className="flex items-center gap-1.5 text-xs font-semibold text-kvm-red hover:underline">
              <Info size={13} aria-hidden="true" />
              How is this XI selected?
            </button>
          </div>

          {showInfo ? (
            <div className="mt-3 rounded-md bg-gray-50 p-3 text-xs leading-relaxed text-gray-600">
              For every formation slot, the best-scoring real, position-eligible player in this competition and season is selected using the same real, position-specific
              Current Level performance model used across the rest of this app — never Potential or KV Mechelen Fit, and never a player twice. Ties break on confidence
              first, then real minutes played. Impect&apos;s own position data doesn&apos;t distinguish left/right for Centre Backs or Defensive Midfielders, so those two
              slots are filled by score alone. A position with no real, eligible candidate above the minimum-minutes filter is shown empty rather than filled with an
              unsuitable player. This reflects only the competitions and seasons this project has real synced data for — it is not a claim of complete competition
              coverage.
            </div>
          ) : null}
        </section>

        {optionsError ? (
          <ErrorState message={optionsError.message} />
        ) : optionsLoading ? (
          <LoadingState label="Loading available competitions…" />
        ) : (competitionOptions ?? []).length === 0 ? (
          <EmptyState icon={Users} title="No rated competitions yet" description="Run scripts/calculate-player-ratings.mjs for at least one competition first." />
        ) : (
          <>
            <section className="rounded-xl border border-kvm-border bg-white p-5 shadow-[0_1px_2px_rgba(26,23,18,0.04),0_8px_24px_-8px_rgba(26,23,18,0.10)]">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-kvm-ink">
                    Data Best XI — {selectedCompetition?.competitionName} {selectedCompetition?.season}
                  </h2>
                  <p className="text-xs text-gray-500">
                    {formation.name} · {bestXI?.filledCount ?? 0}/11 positions filled
                    {candidateData?.calculatedAt ? <> · Data last updated {formatDate(candidateData.calculatedAt)}</> : null}
                    {candidateData?.modelVersion ? <> · Model v{candidateData.modelVersion}</> : null}
                  </p>
                </div>
              </div>

              {candidatesError ? (
                <ErrorState message={candidatesError.message} onRetry={reload} />
              ) : candidatesLoading || !bestXI ? (
                <LoadingState label="Selecting the best available XI…" />
              ) : (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
                  <BestXIPitch formationId={formationId} slots={bestXI.slots} selectedSlot={selectedSlot} onSelectSlot={setSelectedSlot} />
                  {selected ? (
                    <BestXISlotDetail slot={selected} onClose={() => setSelectedSlot(null)} />
                  ) : (
                    <div className="flex items-center justify-center rounded-xl border border-dashed border-kvm-border p-6 text-center text-xs text-gray-400">
                      Click a position on the pitch to see why that player was selected and their real alternatives.
                    </div>
                  )}
                </div>
              )}
            </section>

            {bestXI ? (
              <section className="overflow-x-auto rounded-xl border border-kvm-border bg-white shadow-[0_1px_2px_rgba(26,23,18,0.04),0_8px_24px_-8px_rgba(26,23,18,0.10)]">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Position</th>
                      <th>Player</th>
                      <th>Club</th>
                      <th>Score</th>
                      <th>Confidence</th>
                      <th>Minutes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bestXI.slots.map((s) => (
                      <tr key={s.slot}>
                        <td className="font-medium text-kvm-ink">{s.label}</td>
                        <td>
                          {s.candidate ? (
                            <Link href={`/player?id=sc-${s.candidate.scoutasticPlayerId}`} className="font-semibold text-kvm-ink hover:text-kvm-red hover:underline">
                              {s.candidate.playerName}
                            </Link>
                          ) : (
                            <span className="text-gray-300">Empty — no eligible data</span>
                          )}
                        </td>
                        <td className="text-gray-500">{s.candidate?.club ?? "—"}</td>
                        <td className="tabular-nums text-gray-600">{s.candidate ? s.candidate.performanceScore.toFixed(1) : "—"}</td>
                        <td className="tabular-nums text-gray-600">{s.candidate ? `${Math.round(s.candidate.reliability * 100)}%` : "—"}</td>
                        <td className="tabular-nums text-gray-600">{s.candidate?.minutes ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}
