"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { User, Shirt, Banknote } from "lucide-react";
import type { Player } from "@/lib/players-data";
import { positionLabel } from "@/lib/players-data";
import { calculateAge, formatCurrency, formatDate } from "@/lib/utils";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { StatusSelect } from "@/components/ui/StatusBadge";
import { ShortlistButton } from "@/components/shortlists/ShortlistButton";
import { useAppStore, useEffectiveStatus } from "@/lib/app-store";

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
    <div className="rounded-sm bg-gray-50 p-3.5">
      <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">
        <Icon size={12} aria-hidden="true" />
        {title}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">{children}</dl>
    </div>
  );
}

/** "Club → opens club/players view", "Nationality → filters relevant players" (item 20) — same convention GlobalSearch already uses. */
const linkClass = "hover:text-kvm-red hover:underline";

export function PlayerHeader({ player, competitionName }: { player: Player; competitionName?: string | null }) {
  const { setPlayerStatus } = useAppStore();
  const status = useEffectiveStatus(player.id, player.status);
  // Official SCOUTASTIC competition name when it's been resolved; `league`
  // (the competition's country, see docs/COMPETITIONS.md) is only a
  // fallback for the subtitle line while that lookup is still in flight.
  const competitionLabel = competitionName ?? player.league ?? "Unknown competition";
  const positions = [player.position, ...(player.secondaryPositions ?? [])].filter((p): p is NonNullable<typeof p> => p !== null);

  return (
    <div className="border border-kvm-border bg-white p-6">
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

        <div className="flex items-center gap-2">
          <StatusSelect status={status} onChange={(s) => setPlayerStatus(player.id, s)} />
          <ShortlistButton playerId={player.id} />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 border-t border-kvm-border pt-5 sm:grid-cols-3">
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
        </FieldGroup>

        <FieldGroup icon={Shirt} title="Club">
          <Field label="Club">
            {player.club ? (
              <Link href={`/players?search=${encodeURIComponent(player.club)}`} className={linkClass}>
                {player.club}
              </Link>
            ) : (
              "Unknown"
            )}
          </Field>
          <Field label="Competition">
            {player.competitionId ? (
              <Link href={`/competition?id=${player.competitionId}`} className={linkClass}>
                {competitionLabel}
              </Link>
            ) : (
              competitionLabel
            )}
          </Field>
          <Field label="Position(s)">{positions.map(positionLabel).join(", ") || "Unknown"}</Field>
          <Field label="Preferred foot">{unk(player.preferredFoot)}</Field>
        </FieldGroup>

        <FieldGroup icon={Banknote} title="Contract">
          <Field label="Market value">
            <span className="font-bold text-kvm-ink">{formatCurrency(player.marketValueEUR)}</span>
          </Field>
          <Field label="Contract expiry">{formatDate(player.contractExpiry)}</Field>
          <Field label="Agent">{unk(player.agent)}</Field>
        </FieldGroup>
      </div>
    </div>
  );
}
