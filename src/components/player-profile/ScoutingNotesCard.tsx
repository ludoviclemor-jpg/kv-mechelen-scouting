"use client";

import { useState } from "react";
import type { Player, ScoutingNotes } from "@/lib/demo-data";
import { useAppStore, useEffectiveNotes } from "@/lib/app-store";
import { Save } from "lucide-react";

const FIELDS: { key: keyof ScoutingNotes; label: string }[] = [
  { key: "strengths", label: "Strengths" },
  { key: "weaknesses", label: "Weaknesses" },
  { key: "recommendation", label: "Recommendation" },
  { key: "general", label: "General Notes" },
];

export function ScoutingNotesCard({ player }: { player: Player }) {
  const { setPlayerNotes } = useAppStore();
  const effectiveNotes = useEffectiveNotes(player.id, player.notes);
  const [draft, setDraft] = useState<ScoutingNotes>(effectiveNotes);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const dirty = FIELDS.some((f) => draft[f.key] !== effectiveNotes[f.key]);

  function handleSave() {
    setPlayerNotes(player.id, draft);
    setSavedAt(new Date().toLocaleTimeString());
  }

  return (
    <div className="border border-kvm-border bg-white">
      <div className="flex items-center justify-between border-b border-kvm-border px-5 py-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
          Scouting Notes
        </h2>
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty}
          className="flex items-center gap-1.5 rounded-sm bg-kvm-red px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
        >
          <Save size={13} aria-hidden="true" />
          Save notes
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
              onChange={(e) => setDraft((d) => ({ ...d, [field.key]: e.target.value }))}
              className="w-full resize-none rounded-sm border border-kvm-border px-3 py-2 text-sm text-kvm-ink focus-visible:outline-none"
            />
          </div>
        ))}
      </div>

      <div className="border-t border-kvm-border px-5 py-2 text-xs text-gray-400">
        {savedAt
          ? `Saved locally at ${savedAt} — database persistence arrives in Phase 3.`
          : "Notes are stored in this session only until PostgreSQL persistence is connected (Phase 3)."}
      </div>
    </div>
  );
}
