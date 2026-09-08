"use client";

import { useState } from "react";
import { Plus, Loader2, AlertTriangle, Pencil, Trash2, X } from "lucide-react";
import {
  fetchMatchReportsForPlayer,
  createMatchReport,
  updateMatchReport,
  deleteMatchReport,
  SCOUTING_TYPE_LABELS,
  FOLLOW_UP_LABELS,
  FOLLOW_UP_ACTIONS,
  type MatchReport,
  type MatchReportInput,
  type ScoutingType,
  type FollowUpAction,
} from "@/lib/reports-data";
import { useAsync, POSITIONS, POSITION_LABELS } from "@/lib/players-data";
import { useAppStore } from "@/lib/app-store";
import { useUnsavedChangesGuard } from "@/lib/useUnsavedChangesGuard";
import { LoadingState, ErrorState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/utils";
import { FileText } from "lucide-react";

const EMPTY_INPUT: MatchReportInput = {
  matchId: null,
  opponent: "",
  matchDate: null,
  scoutingType: "live",
  minutesWatched: null,
  positionPlayed: null,
  strengths: "",
  weaknesses: "",
  overallRating: null,
  followUpAction: "no_action",
};

function inputFromReport(r: MatchReport): MatchReportInput {
  return {
    matchId: r.matchId,
    opponent: r.opponent,
    matchDate: r.matchDate,
    scoutingType: r.scoutingType,
    minutesWatched: r.minutesWatched,
    positionPlayed: r.positionPlayed,
    strengths: r.strengths,
    weaknesses: r.weaknesses,
    overallRating: r.overallRating,
    followUpAction: r.followUpAction,
  };
}

function ReportForm({
  input,
  onChange,
  onCancel,
  onSubmit,
  saving,
  error,
}: {
  input: MatchReportInput;
  onChange: (input: MatchReportInput) => void;
  onCancel: () => void;
  onSubmit: () => void;
  saving: boolean;
  error: string | null;
}) {
  return (
    <div className="space-y-3 border-b border-kvm-border bg-gray-50 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-medium text-gray-600">
          Opponent / match
          <input
            value={input.opponent}
            onChange={(e) => onChange({ ...input, opponent: e.target.value })}
            placeholder="e.g. vs Union SG"
            className="mt-1 w-full rounded-md border border-kvm-border bg-white px-2.5 py-1.5 text-sm focus-visible:outline-none"
          />
        </label>
        <label className="text-xs font-medium text-gray-600">
          Match date
          <input
            type="date"
            value={input.matchDate ?? ""}
            onChange={(e) => onChange({ ...input, matchDate: e.target.value || null })}
            className="mt-1 w-full rounded-md border border-kvm-border bg-white px-2.5 py-1.5 text-sm focus-visible:outline-none"
          />
        </label>
        <label className="text-xs font-medium text-gray-600">
          Scouting type
          <select
            value={input.scoutingType}
            onChange={(e) => onChange({ ...input, scoutingType: e.target.value as ScoutingType })}
            className="mt-1 w-full rounded-md border border-kvm-border bg-white px-2.5 py-1.5 text-sm"
          >
            {Object.entries(SCOUTING_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-gray-600">
          Minutes watched
          <input
            type="number"
            min={0}
            value={input.minutesWatched ?? ""}
            onChange={(e) => onChange({ ...input, minutesWatched: e.target.value === "" ? null : Number(e.target.value) })}
            placeholder="If known"
            className="mt-1 w-full rounded-md border border-kvm-border bg-white px-2.5 py-1.5 text-sm focus-visible:outline-none"
          />
        </label>
        <label className="text-xs font-medium text-gray-600">
          Position played
          <select
            value={input.positionPlayed ?? ""}
            onChange={(e) => onChange({ ...input, positionPlayed: e.target.value || null })}
            className="mt-1 w-full rounded-md border border-kvm-border bg-white px-2.5 py-1.5 text-sm"
          >
            <option value="">Unknown</option>
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {POSITION_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-gray-600">
          Overall rating (1–10)
          <input
            type="number"
            min={1}
            max={10}
            value={input.overallRating ?? ""}
            onChange={(e) => onChange({ ...input, overallRating: e.target.value === "" ? null : Number(e.target.value) })}
            placeholder="Optional"
            className="mt-1 w-full rounded-md border border-kvm-border bg-white px-2.5 py-1.5 text-sm focus-visible:outline-none"
          />
        </label>
        <label className="text-xs font-medium text-gray-600 sm:col-span-2">
          Follow-up
          <select
            value={input.followUpAction}
            onChange={(e) => onChange({ ...input, followUpAction: e.target.value as FollowUpAction })}
            className="mt-1 w-full rounded-md border border-kvm-border bg-white px-2.5 py-1.5 text-sm"
          >
            {FOLLOW_UP_ACTIONS.map((value) => (
              <option key={value} value={value}>
                {FOLLOW_UP_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-gray-600">
          Qualities / strengths
          <textarea
            rows={3}
            value={input.strengths}
            onChange={(e) => onChange({ ...input, strengths: e.target.value })}
            className="mt-1 w-full resize-none rounded-md border border-kvm-border bg-white px-2.5 py-1.5 text-sm focus-visible:outline-none"
          />
        </label>
        <label className="text-xs font-medium text-gray-600">
          Work-ons / weaknesses
          <textarea
            rows={3}
            value={input.weaknesses}
            onChange={(e) => onChange({ ...input, weaknesses: e.target.value })}
            className="mt-1 w-full resize-none rounded-md border border-kvm-border bg-white px-2.5 py-1.5 text-sm focus-visible:outline-none"
          />
        </label>
      </div>

      {error ? (
        <p className="flex items-center gap-1.5 text-xs font-medium text-kvm-red">
          <AlertTriangle size={13} aria-hidden="true" />
          {error} Your entries are kept — try again.
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSubmit}
          disabled={saving || !input.opponent.trim()}
          className="flex items-center gap-1.5 rounded-md bg-kvm-red px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
        >
          {saving ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : null}
          {saving ? "Saving…" : "Save report"}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className="rounded-md border border-kvm-border px-3 py-1.5 text-xs font-semibold text-kvm-ink">
          Cancel
        </button>
      </div>
    </div>
  );
}

function ReportRow({ report, onEdit, onDelete }: { report: MatchReport; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-kvm-ink">{report.opponent || "Untitled match"}</span>
          <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            {SCOUTING_TYPE_LABELS[report.scoutingType]}
          </span>
          {report.overallRating !== null ? (
            <span className="rounded-md bg-kvm-red/10 px-1.5 py-0.5 text-[10px] font-bold text-kvm-red">{report.overallRating}/10</span>
          ) : null}
        </div>
        <div className="mt-0.5 text-xs text-gray-400">
          {formatDate(report.matchDate)}
          {report.positionPlayed ? ` · ${POSITION_LABELS[report.positionPlayed as keyof typeof POSITION_LABELS] ?? report.positionPlayed}` : ""}
          {report.minutesWatched !== null ? ` · ${report.minutesWatched}'` : ""}
          {" · "}
          {FOLLOW_UP_LABELS[report.followUpAction]}
        </div>
        {report.strengths || report.weaknesses ? (
          <div className="mt-1.5 grid grid-cols-1 gap-1 text-xs text-gray-600 sm:grid-cols-2">
            {report.strengths ? (
              <p>
                <span className="font-semibold text-gray-500">Strengths: </span>
                {report.strengths}
              </p>
            ) : null}
            {report.weaknesses ? (
              <p>
                <span className="font-semibold text-gray-500">Work-ons: </span>
                {report.weaknesses}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button type="button" onClick={onEdit} aria-label="Edit report" className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-kvm-ink">
          <Pencil size={14} aria-hidden="true" />
        </button>
        <button type="button" onClick={onDelete} aria-label="Delete report" className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-kvm-red">
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/**
 * Dated match-report history (redesign item 5) — distinct from the
 * always-current `ScoutingNotesCard` above it. Each report is its own
 * durable row (see db/schema.sql's `match_reports`, private per scout).
 */
export function MatchReportsSection({ playerId, autoOpenForm = false }: { playerId: string; autoOpenForm?: boolean }) {
  const { isPersistent } = useAppStore();
  const { data: reports, loading, error, reload } = useAsync(() => fetchMatchReportsForPlayer(playerId), [playerId]);

  const [formOpen, setFormOpen] = useState(autoOpenForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [input, setInput] = useState<MatchReportInput>(EMPTY_INPUT);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  useUnsavedChangesGuard(formOpen && !saving, "You have an unsaved match report. Leave this page without saving?");

  function openNew() {
    setEditingId(null);
    setInput(EMPTY_INPUT);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(report: MatchReport) {
    setEditingId(report.id);
    setInput(inputFromReport(report));
    setFormError(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setFormError(null);
  }

  async function handleSubmit() {
    setSaving(true);
    setFormError(null);
    try {
      if (editingId) {
        await updateMatchReport(editingId, input);
      } else {
        await createMatchReport(playerId, input);
      }
      setSaving(false);
      setFormOpen(false);
      reload();
    } catch (err) {
      setSaving(false);
      setFormError(err instanceof Error ? err.message : "Failed to save report.");
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this match report? This can't be undone.")) return;
    setListError(null);
    try {
      await deleteMatchReport(id);
      reload();
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Failed to delete report.");
    }
  }

  if (!isPersistent) {
    return (
      <div className="rounded-lg border border-kvm-border bg-white">
        <div className="flex items-center justify-between border-b border-kvm-border px-5 py-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">Match Reports</h2>
        </div>
        <EmptyState
          icon={FileText}
          title="Database not configured"
          description="Match reports need Postgres persistence (see Settings) — this browser can't durably save them yet."
        />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-kvm-border bg-white">
      <div className="flex items-center justify-between border-b border-kvm-border px-5 py-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">Match Reports</h2>
        {!formOpen ? (
          <button
            type="button"
            onClick={openNew}
            className="flex items-center gap-1.5 rounded-md bg-kvm-red px-3 py-1.5 text-xs font-semibold text-white"
          >
            <Plus size={13} aria-hidden="true" />
            New report
          </button>
        ) : (
          <button type="button" onClick={closeForm} aria-label="Close form" className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-kvm-ink">
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      {formOpen ? (
        <ReportForm input={input} onChange={setInput} onCancel={closeForm} onSubmit={handleSubmit} saving={saving} error={formError} />
      ) : null}

      {listError ? <p className="border-b border-kvm-border px-5 py-2 text-xs font-medium text-kvm-red">{listError}</p> : null}

      {error ? (
        <ErrorState message={error.message} onRetry={reload} />
      ) : loading ? (
        <LoadingState label="Loading reports…" />
      ) : !reports || reports.length === 0 ? (
        !formOpen ? (
          <EmptyState icon={FileText} title="No match reports yet" description="Add one after watching this player live or on video." />
        ) : null
      ) : (
        <div className="divide-y divide-kvm-border">
          {reports.map((r) => (
            <ReportRow key={r.id} report={r} onEdit={() => openEdit(r)} onDelete={() => handleDelete(r.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
