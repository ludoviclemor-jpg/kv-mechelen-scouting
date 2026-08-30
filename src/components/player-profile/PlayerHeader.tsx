"use client";

import type { Player } from "@/lib/demo-data";
import { POSITION_LABELS } from "@/lib/demo-data";
import { calculateAge, formatCurrency, formatDate } from "@/lib/utils";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { StatusSelect } from "@/components/ui/StatusBadge";
import { ShortlistButton } from "@/components/shortlists/ShortlistButton";
import { useAppStore, useEffectiveStatus } from "@/lib/app-store";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-medium text-kvm-ink">{value}</dd>
    </div>
  );
}

export function PlayerHeader({ player }: { player: Player }) {
  const { setPlayerStatus } = useAppStore();
  const status = useEffectiveStatus(player.id, player.status);

  return (
    <div className="border border-kvm-border bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex items-center gap-4">
          <PlayerAvatar name={player.name} photoUrl={player.photoUrl} size="lg" />
          <div>
            <h1 className="text-xl font-bold text-kvm-ink">{player.name}</h1>
            <p className="text-sm text-gray-500">
              {POSITION_LABELS[player.position]} · {player.club} · {player.league}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <StatusSelect status={status} onChange={(s) => setPlayerStatus(player.id, s)} />
          <ShortlistButton playerId={player.id} />
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-kvm-border pt-5 sm:grid-cols-4 lg:grid-cols-6">
        <Field label="Age" value={`${calculateAge(player.dateOfBirth)} yrs`} />
        <Field label="Date of birth" value={formatDate(player.dateOfBirth)} />
        <Field label="Nationality" value={player.nationality} />
        <Field label="Position" value={POSITION_LABELS[player.position]} />
        <Field label="Club" value={player.club} />
        <Field label="League" value={player.league} />
        <Field label="Height" value={`${player.heightCm} cm`} />
        <Field label="Preferred foot" value={player.preferredFoot} />
        <Field label="Market value" value={formatCurrency(player.marketValueEUR)} />
        <Field label="Contract expiry" value={formatDate(player.contractExpiry)} />
      </dl>
    </div>
  );
}
