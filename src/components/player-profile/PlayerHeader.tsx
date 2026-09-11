"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { User, Banknote, FileText, Gauge } from "lucide-react";
import type { ScoutingStatus } from "@/lib/players-data";
import type { Player } from "@/lib/players-data";
import { positionLabel } from "@/lib/players-data";
import { calculateAge, formatCurrency, formatDate, cn } from "@/lib/utils";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { StatusChangeMenu } from "@/components/ui/StatusBadge";
import { ShortlistButton } from "@/components/shortlists/ShortlistButton";
import { NextActionButton } from "@/components/players/NextActionButton";
import { useAppStore, useEffectiveStatus } from "@/lib/app-store";
import type { PlayerRating } from "@/lib/scoring-data/types";

const CONFIDENCE_TEXT: Record<string, string> = {
  High: "text-emerald-700",
  Medium: "text-amber-700",
  Low: "text-gray-500",
};

function unk(value: string | number | null): string {
  return value === null ? "Unknown" : String(value);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-kvm-ink">{children}</dd>
    </div>
  );
}

function FieldGroup({ icon: Icon, title, children }: { icon: typeof User; title: string; children: ReactNode }) {
  return (
    <div className="rounded-md bg-gray-50 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">
        <Icon size={12} aria-hidden="true" />
        {title}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">{children}</dl>
    </div>
  );
}

/** "Club → opens club/players view", "Nationality → filters relevant players" (item 20) — same convention GlobalSearch already uses. */
const linkClass = "hover:text-kvm-red hover:underline";

export function PlayerHeader({
  player,
  competitionName,
  rating,
  onNewReport,
}: {
  player: Player;
  competitionName?: string | null;
  rating?: PlayerRating | null;
  onNewReport?: () => void;
}) {
  const { setPlayerStatus } = useAppStore();
  const status = useEffectiveStatus(player.id, player.status);
  const [statusError, setStatusError] = useState<string | null>(null);

  async function handleStatusChange(next: ScoutingStatus, note: string) {
    setStatusError(null);
    const result = await setPlayerStatus(player.id, next, note);
    if (!result.ok) setStatusError(result.error ?? "Failed to save status — try again.");
  }
  // Official SCOUTASTIC competition name when it's been resolved; `league`
  // (the competition's country, see docs/COMPETITIONS.md) is only a
  // fallback for the subtitle line while that lookup is still in flight.
  const competitionLabel = competitionName ?? player.league ?? "Unknown competition";
  const positions = [player.position, ...(player.secondaryPositions ?? [])].filter((p): p is NonNullable<typeof p> => p !== null);

  return (
    <div className="rounded-xl border border-kvm-border bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex items-center gap-4">
          <PlayerAvatar name={player.name} photoUrl={player.photoUrl} size="lg" className="ring-2 ring-kvm-border ring-offset-2" />
          <div>
            <h1 className="text-xl font-bold text-kvm-ink">{player.name}</h1>
            <p className="text-sm text-gray-500">
              {positions.map(positionLabel).join(" / ") || "Unknown position"} ·{" "}
              {player.club ? (
                <Link href={`/players?search=${encodeURIComponent(player.club)}`} className={linkClass}>
                  {player.club}
                </Link>
              ) : (
                "Unknown club"
              )}{" "}
              ·{" "}
              {player.competitionId ? (
                <Link href={`/competition?id=${player.competitionId}`} className={linkClass}>
                  {competitionLabel}
                </Link>
              ) : (
                competitionLabel
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <StatusChangeMenu status={status} onChange={handleStatusChange} />
            <ShortlistButton playerId={player.id} />
            {onNewReport ? (
              <button
                type="button"
                onClick={onNewReport}
                className="flex items-center gap-1.5 rounded-md border border-kvm-border bg-white px-2.5 py-1.5 text-xs font-semibold text-kvm-ink hover:border-kvm-red"
              >
                <FileText size={14} aria-hidden="true" />
                New report
              </button>
            ) : null}
            <NextActionButton playerId={player.id} />
          </div>
          {statusError ? <p className="text-xs font-medium text-kvm-red">{statusError}</p> : null}
        </div>
      </div>

      {/* Club/Competition/Position are already in the subtitle above —
          not repeated here, so this is Personal + Contract only (was 3
          boxes including a "Club" one that just duplicated the subtitle). */}
      <div className={cn("mt-5 grid grid-cols-1 gap-3 border-t border-kvm-border pt-4 sm:grid-cols-2", rating?.ratable && "lg:grid-cols-3")}>
        <FieldGroup icon={User} title="Personal">
          <Field label="Age">{player.dateOfBirth ? `${calculateAge(player.dateOfBirth)} yrs` : "Unknown"}</Field>
          <Field label="Date of birth">{formatDate(player.dateOfBirth)}</Field>
          <Field label="Nationality">
            {player.nationality ? (
              <Link href={`/players?nationality=${encodeURIComponent(player.nationality)}`} className={linkClass}>
                {player.nationality}
              </Link>
            ) : (
              "Unknown"
            )}
            {player.secondNationality ? ` / ${player.secondNationality}` : ""}
          </Field>
          <Field label="Height">{player.heightCm !== null ? `${player.heightCm} cm` : "Unknown"}</Field>
          <Field label="Preferred foot">{unk(player.preferredFoot)}</Field>
        </FieldGroup>

        <FieldGroup icon={Banknote} title="Contract">
          <Field label="Market value">
            <span className="font-bold text-kvm-ink">{formatCurrency(player.marketValueEUR)}</span>
          </Field>
          <Field label="Contract expiry">{formatDate(player.contractExpiry)}</Field>
          <Field label="Agent">{unk(player.agent)}</Field>
        </FieldGroup>

        {rating?.ratable ? (
          <FieldGroup icon={Gauge} title="Position-Specific Rating (Impect)">
            <Field label="Current Level">
              <span className="text-base font-bold text-kvm-ink">{rating.currentLevel}</span>
            </Field>
            <Field label="Potential">
              <span className="text-base font-bold text-kvm-ink">{rating.potential}</span>
            </Field>
            <Field label="Confidence">
              <span className={cn("font-semibold", CONFIDENCE_TEXT[rating.confidence.label])}>{rating.confidence.label}</span>
            </Field>
            <Field label="Role">{rating.context.role ?? rating.context.positionGroup}</Field>
            <Field label="Minutes">{rating.context.minutes}</Field>
            <Field label="Calculated">{formatDate(rating.calculatedAt)}</Field>
          </FieldGroup>
        ) : null}
      </div>
    </div>
  );
}
