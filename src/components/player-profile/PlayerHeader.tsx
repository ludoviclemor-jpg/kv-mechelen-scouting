"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { FileText } from "lucide-react";
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

const CONFIDENCE_STYLES: Record<string, string> = {
  High: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
  Medium: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
  Low: "bg-gray-100 text-gray-500 ring-1 ring-inset ring-gray-200",
};

function unk(value: string | number | null): string {
  return value === null ? "Unknown" : String(value);
}

/** "Club → opens club/players view", "Nationality → filters relevant players" — same convention GlobalSearch already uses. */
const linkClass = "hover:text-kvm-red hover:underline";

/** One dense label/value row — the compact info column's basic building block, replacing the old grid-of-cards layout (redesign 2026-09-11: too busy/too much whitespace for a 25-30%-width column). */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-xs">
      <dt className="shrink-0 text-gray-400">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium text-kvm-ink">{children}</dd>
    </div>
  );
}

/**
 * Compact player info column — left side of the redesigned player
 * profile (2026-09-11), ~25-30% width alongside the wide Technical/
 * Physical analysis zone. Every field from the old horizontal
 * FieldGroup layout is preserved, just restructured into dense rows
 * instead of a grid of cards, per the redesign brief's explicit
 * "reorganize, don't remove information" instruction.
 */
export function PlayerHeader({
  player,
  competitionName,
  rating,
  internationalStatus,
  onNewReport,
}: {
  player: Player;
  competitionName?: string | null;
  rating?: PlayerRating | null;
  /** Real, derived from this player's own call-up history (see /player page.tsx) — never a guess. `null` while still loading. */
  internationalStatus?: string | null;
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
    <div className="rounded-xl border border-kvm-border bg-white p-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <PlayerAvatar name={player.name} photoUrl={player.photoUrl} size="lg" className="ring-2 ring-kvm-border ring-offset-2" />
        <div>
          <h1 className="text-base font-bold leading-tight text-kvm-ink">{player.name}</h1>
          <p className="mt-0.5 text-xs text-gray-500">{positions.map(positionLabel).join(" / ") || "Unknown position"}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
        <StatusChangeMenu status={status} onChange={handleStatusChange} />
        <ShortlistButton playerId={player.id} />
        <NextActionButton playerId={player.id} playerName={player.name} />
        {onNewReport ? (
          <button
            type="button"
            onClick={onNewReport}
            aria-label="New scouting report"
            title="New scouting report"
            className="flex items-center gap-1.5 rounded-md border border-kvm-border bg-white px-2.5 py-1.5 text-xs font-semibold text-kvm-ink hover:border-kvm-red"
          >
            <FileText size={14} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {statusError ? <p className="mt-1.5 text-center text-xs font-medium text-kvm-red">{statusError}</p> : null}

      {rating?.ratable ? (
        <div className="mt-4 border-t border-kvm-border pt-3">
          <div className="grid grid-cols-3 gap-1.5">
            <div className="rounded-md bg-gray-50 py-1.5 text-center">
              <div className="text-[9px] font-semibold uppercase tracking-wide text-gray-400">Level</div>
              <div className="text-sm font-bold text-kvm-ink">{rating.currentLevel}</div>
            </div>
            <div className="rounded-md bg-gray-50 py-1.5 text-center">
              <div className="text-[9px] font-semibold uppercase tracking-wide text-gray-400">Potential</div>
              <div className="text-sm font-bold text-kvm-ink">{rating.potential}</div>
              {rating.potentialRange && rating.potential !== null ? (
                <div className="text-[9px] text-gray-400">±{rating.potentialRange.high - rating.potential}</div>
              ) : null}
            </div>
            <div className={cn("rounded-md py-1.5 text-center", CONFIDENCE_STYLES[rating.confidence.label])}>
              <div className="text-[9px] font-semibold uppercase tracking-wide opacity-70">Confidence</div>
              <div className="text-sm font-bold">{rating.confidence.label}</div>
            </div>
          </div>

          {/* KV Mechelen Fit is a deliberately separate assessment from Current Level/Potential — "een goede speler is niet automatisch een goede match voor KV Mechelen" (Request B). Never shown as part of the level/potential tiles above. */}
          <div className="mt-1.5 rounded-md bg-kvm-red/5 px-2.5 py-2 ring-1 ring-inset ring-kvm-red/15">
            <div className="text-[9px] font-semibold uppercase tracking-wide text-kvm-red/70">KV Mechelen Fit</div>
            {rating.kvMechelenFit.supported && rating.kvMechelenFit.totalFit !== null ? (
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="text-lg font-bold text-kvm-ink">{rating.kvMechelenFit.totalFit}</span>
                <div className="text-right text-[10px] leading-tight text-gray-500">
                  <div>Immediate {rating.kvMechelenFit.immediateFit}</div>
                  <div>Development {rating.kvMechelenFit.developmentFit}</div>
                </div>
              </div>
            ) : (
              <div className="mt-1 text-[11px] text-gray-400">{rating.kvMechelenFit.reason ?? "Insufficient data"}</div>
            )}
            {rating.kvMechelenFit.intendedRole ? (
              <div className="mt-1 text-[9px] text-gray-400">Role: {rating.kvMechelenFit.intendedRole}</div>
            ) : null}
          </div>
        </div>
      ) : null}

      <dl className="mt-4 divide-y divide-kvm-border border-t border-kvm-border">
        <Row label="Age">{player.dateOfBirth ? `${calculateAge(player.dateOfBirth)} yrs` : "Unknown"}</Row>
        <Row label="Date of birth">{formatDate(player.dateOfBirth)}</Row>
        <Row label="Nationality">
          {player.nationality ? (
            <Link href={`/players?nationality=${encodeURIComponent(player.nationality)}`} className={linkClass}>
              {player.nationality}
              {player.secondNationality ? ` / ${player.secondNationality}` : ""}
            </Link>
          ) : (
            "Unknown"
          )}
        </Row>
        <Row label="Club">
          {player.club ? (
            <Link href={`/players?search=${encodeURIComponent(player.club)}`} className={linkClass}>
              {player.club}
            </Link>
          ) : (
            "Unknown"
          )}
        </Row>
        <Row label="Competition">
          {player.competitionId ? (
            <Link href={`/competition?id=${player.competitionId}`} className={linkClass}>
              {competitionLabel}
            </Link>
          ) : (
            competitionLabel
          )}
        </Row>
        <Row label="Preferred foot">{unk(player.preferredFoot)}</Row>
        <Row label="Height">{player.heightCm !== null ? `${player.heightCm} cm` : "Unknown"}</Row>
        <Row label="Contract expiry">{formatDate(player.contractExpiry)}</Row>
        <Row label="Market value">{formatCurrency(player.marketValueEUR)}</Row>
        <Row label="Minutes (season)">{player.minutes !== null ? player.minutes.toLocaleString("en-GB") : "Unknown"}</Row>
        <Row label="International">{internationalStatus ?? "Unknown"}</Row>
      </dl>
    </div>
  );
}
