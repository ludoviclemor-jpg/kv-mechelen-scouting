"use client";

import { useEffect, useRef, useState } from "react";
import type { Player, ScoutingNotes } from "@/lib/players-data";
import { useAppStore, useEffectiveNotes } from "@/lib/app-store";
import { useUnsavedChangesGuard } from "@/lib/useUnsavedChangesGuard";
import { Save, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

const FIELDS: { key: keyof ScoutingNotes; label: string }[] = [
  { key: "strengths", label: "Strengths" },
  { key: "weaknesses", label: "Weaknesses" },
  { key: "recommendation", label: "Recommendation" },
  { key: "general", label: "General Notes" },
];

/**
 * General, always-current scouting notes for this player — distinct from
 * the dated match-report history (see the "Match Reports" section further
 * down the profile). Save status is a real state machine confirmed by the
 * database, not shown optimistically:
 *
 *   idle -> (edit) -> dirty -> (save) -> saving -> saved | error
 *
 * On error the draft is kept exactly as typed (never cleared/reverted)
 * and the same Save button retries. The button is disabled while saving
 * so a second click can't fire a duplicate write (app-store also
 * serializes same-player writes server-side, see keyedQueue.ts, as a
 * second line of defense against any race). A late-resolving initial
 * load (`isLoading` true -> false) only overwrites the draft if the scout
 * hasn't started typing yet — never clobbers in-progress input.
 */
export function ScoutingNotesCard({ player }: { player: Player }) {
  const { setPlayerNotes, isPersistent, isLoading } = useAppStore();
  const effectiveNotes = useEffectiveNotes(player.id, player.notes);
  const [draft, setDraft] = useState<ScoutingNotes>(effectiveNotes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const hasEditedRef = useRef(false);
  const wasLoadingRef = useRef(isLoading);

  useEffect(() => {
    if (wasLoadingRef.current && !isLoading && !hasEditedRef.current) {
      setDraft(effectiveNotes);
    }
    wasLoadingRef.current = isLoading;
    // Only re-sync on the loading transition / a genuinely different
    // player's notes arriving — not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, player.id]);

  const dirty = FIELDS.some((f) => draft[f.key] !== effectiveNotes[f.key]);
  useUnsavedChangesGuard(dirty, "You have unsaved scouting notes. Leave this page without saving?");

  function updateField(key: keyof ScoutingNotes, value: string) {
    hasEditedRef.current = true;
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function handleSave() {
    if (saving) return; // guards against a duplicate fire even if the disabled button is somehow bypassed
    hasEditedRef.current = true;
    setSaving(true);
    setError(null);
    const result = await setPlayerNotes(player.id, draft);
    setSaving(false);
    if (result.ok) {
      setSavedAt(new Date().toLocaleTimeString());
    } else {
      setError(result.error ?? "Failed to save — please try again.");
    }
  }

  return (
    <div className="rounded-lg border border-kvm-border bg-white">
      <div className="flex items-center justify-between border-b border-kvm-border px-5 py-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">Scouting Notes</h2>
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className="flex items-center gap-1.5 rounded-md bg-kvm-red px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
        >
          {saving ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Save size={13} aria-hidden="true" />}
          {saving ? "Saving…" : error ? "Try again" : "Save notes"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
        {FIELDS.map((field) => (
          <div key={field.key} className={field.key === "general" ? "sm:col-span-2" : ""}>
            <label
              htmlFor={`notes-${field.key}`}
              className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400"
            >
              {field.label}
            </label>
            <textarea
              id={`notes-${field.key}`}
              rows={field.key === "general" ? 3 : 4}
              value={draft[field.key]}
              onChange={(e) => updateField(field.key, e.target.value)}
              className="w-full resize-none rounded-md border border-kvm-border px-3 py-2 text-sm text-kvm-ink focus-visible:outline-none"
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-1.5 border-t border-kvm-border px-5 py-2 text-xs">
        {!isPersistent ? (
          <span className="text-gray-400">
            Database not configured (see Settings) — notes only last for this browser session and are never durably saved.
          </span>
        ) : error ? (
          <>
            <AlertTriangle size={13} className="shrink-0 text-kvm-red" aria-hidden="true" />
            <span className="font-medium text-kvm-red">{error} Your text is kept — click Save notes to retry.</span>
          </>
        ) : saving ? (
          <span className="text-gray-400">Saving…</span>
        ) : dirty ? (
          <span className="font-medium text-amber-600">Unsaved changes.</span>
        ) : savedAt ? (
          <>
            <CheckCircle2 size={13} className="shrink-0 text-emerald-600" aria-hidden="true" />
            <span className="text-gray-400">Saved at {savedAt} — private to your account.</span>
          </>
        ) : (
          <span className="text-gray-400">Saved to the database, private to your account.</span>
        )}
      </div>
    </div>
  );
}
